# tasks_crud.py
"""
CRUD заявок: создание, обновление, закрытие, взятие в работу,
удаление, перемещение по Kanban.

Создавать заявки могут только Администратор и Пользователь.
Техник — исполнитель, создавать заявки не может.
"""
import sqlite3
from datetime import datetime

from flask import Blueprint, jsonify, session

from database import Database
from utils import login_required, role_required, get_json_safe
from logger import get_logger
from constants import (
    ROLE_ADMIN, ROLE_USER, EDITOR_ROLES,
    STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED,
    ALL_STATUSES,
)
from audit import log_action, log_task_change, diff_task
from services.notifications import (
    notify_new_task,
    notify_task_taken,
    notify_task_completed,
)
from tasks_helpers import check_executor_busy, invalidate_task_caches

log = get_logger(__name__)
tasks_crud_bp = Blueprint('tasks_crud', __name__)
db = Database()


# ============================================================
# КТО МОЖЕТ СОЗДАВАТЬ ЗАЯВКИ
# ============================================================
CREATOR_ROLES = (ROLE_ADMIN, ROLE_USER)


# ============================================================
# МАТРИЦА ДОПУСТИМЫХ ПЕРЕХОДОВ (для Kanban)
# ============================================================
_ALLOWED_TRANSITIONS = {
    STATUS_NEW: {
        STATUS_IN_PROGRESS,
        STATUS_COMPLETED,
        STATUS_CANCELLED,
    },
    STATUS_IN_PROGRESS: {
        STATUS_COMPLETED,
        STATUS_CANCELLED,
    },
    STATUS_COMPLETED: set(),
    STATUS_CANCELLED: set(),
}


def _is_transition_allowed(from_status, to_status, role):
    """Проверка допустимости перехода + прав."""
    if from_status == to_status:
        return True, None

    allowed = _ALLOWED_TRANSITIONS.get(from_status, set())

    if to_status not in allowed:
        if from_status == STATUS_COMPLETED:
            return False, 'Заявка выполнена — переход невозможен'
        if from_status == STATUS_CANCELLED:
            return False, 'Заявка отменена — переход невозможен'
        if to_status == STATUS_NEW:
            return False, 'Нельзя вернуть заявку в «Новое»'
        if to_status == STATUS_IN_PROGRESS and from_status == STATUS_COMPLETED:
            return False, 'Нельзя вернуть выполненную заявку в работу'
        return False, f'Переход «{from_status}» → «{to_status}» запрещён'

    if to_status == STATUS_CANCELLED and role != ROLE_ADMIN:
        return False, 'Только администратор может отменить заявку'

    return True, None


# ============================================================
# ДЕТАЛИ ЗАЯВКИ
# ============================================================

@tasks_crud_bp.route('/api/task/<int:task_id>')
@login_required
def get_task(task_id):
    try:
        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({'error': 'Заявка не найдена'}), 404

        if (
            session.get('user_role') == ROLE_USER
            and task['created_by'] != session.get('user_id')
        ):
            return jsonify({'error': 'Недостаточно прав'}), 403

        history = db.query('''
            SELECT * FROM task_history WHERE task_id = ?
            ORDER BY created_at DESC, id DESC LIMIT 100
        ''', [task_id])

        att_count = db.query(
            'SELECT COUNT(*) AS c FROM task_attachments WHERE task_id = ?',
            [task_id], one=True,
        )['c']
        com_count = db.query(
            'SELECT COUNT(*) AS c FROM task_comments '
            'WHERE task_id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )['c']

        result = dict(task)
        result['history'] = [dict(h) for h in history]
        result['attachments_count'] = att_count
        result['comments_count'] = com_count
        return jsonify(result)
    except Exception as e:
        log.exception('Ошибка получения заявки')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# СОЗДАНИЕ (только Админ и Пользователь)
# ============================================================

@tasks_crud_bp.route('/api/create_task', methods=['POST'])
@role_required(*CREATOR_ROLES)
def create_task():
    """
    Создание заявки. Доступно только Администратору и Пользователю.
    Техник получит 403 Forbidden.
    """
    try:
        data = get_json_safe()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        for field in ('description', 'work_type'):
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Поле "{field}" обязательно',
                }), 400

        executor = (data.get('executor') or '').strip()
        deadline = (data.get('deadline') or '').strip()
        try:
            duration_minutes = int(data.get('duration_minutes') or 60)
        except (ValueError, TypeError):
            duration_minutes = 60

        if executor and deadline:
            ok, err, _ = check_executor_busy(
                executor, deadline, duration_minutes,
            )
            if not ok:
                return jsonify({'success': False, 'error': err}), 400

        normalized_deadline = (
            deadline.replace('T', ' ') + ':00'
            if deadline
            else datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )

        # Пользователь не назначает исполнителя и помощника — это делает Админ
        if session.get('user_role') == ROLE_USER:
            executor = ''
            assistant = ''
        else:
            assistant = (data.get('assistant') or '').strip()

        try:
            with db.transaction(immediate=True) as tx:
                task_id = tx.execute('''
                    INSERT INTO tasks
                        (deadline, from_user, cabinet, description, work_type,
                         priority, executor, assistant, status, created_by,
                         created_date, duration_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    normalized_deadline,
                    data.get('from_user', ''),
                    data.get('cabinet', ''),
                    data['description'],
                    data['work_type'],
                    data.get('priority', 'Средний'),
                    executor, assistant, STATUS_NEW,
                    session['user_id'],
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    duration_minutes,
                ])
        except sqlite3.IntegrityError:
            return jsonify({
                'success': False,
                'error': 'Техник в это время уже занят другой заявкой',
            }), 400

        log.info(
            f'Создана заявка №{task_id} '
            f'(role={session.get("user_role")})'
        )
        log_action('create', 'task', task_id, {
            'description': data['description'][:100],
            'cabinet': data.get('cabinet', ''),
            'executor': executor,
        })

        notify_new_task(
            task_id,
            {
                'description': data['description'],
                'from_user': data.get('from_user', ''),
                'executor': executor,
                'assistant': assistant,
            },
            actor_id=session.get('user_id'),
        )

        invalidate_task_caches()

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': f'Заявка №{task_id} создана',
        }), 201
    except Exception as e:
        log.exception('Ошибка создания заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ОБНОВЛЕНИЕ
# ============================================================

@tasks_crud_bp.route('/api/update_task/<int:task_id>', methods=['POST'])
@login_required
def update_task(task_id):
    try:
        data = get_json_safe()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        if (
            session.get('user_role') == ROLE_USER
            and old['created_by'] != session.get('user_id')
        ):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        old_dict = dict(old)
        changes = diff_task(old_dict, data)
        for field_name, old_val, new_val in changes:
            log_task_change(task_id, field_name, old_val, new_val)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE tasks
                SET deadline = ?, from_user = ?, cabinet = ?, description = ?,
                    status = ?, executor = ?, assistant = ?,
                    work_type = ?, priority = ?
                WHERE id = ?
            ''', [
                data.get('deadline', old['deadline']),
                data.get('from_user', old['from_user']),
                data.get('cabinet', old['cabinet']),
                data.get('description', old['description']),
                data.get('status', old['status']),
                data.get('executor', old['executor']),
                data.get('assistant', old['assistant']),
                data.get('work_type', old['work_type']),
                data.get('priority', old['priority']),
                task_id,
            ])

        log_action('update', 'task', task_id, {'changes': len(changes)})
        invalidate_task_caches()

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} обновлена',
        })
    except Exception as e:
        log.exception('Ошибка обновления заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ЗАКРЫТИЕ
# ============================================================

@tasks_crud_bp.route('/api/close_task/<int:task_id>', methods=['POST'])
@login_required
def close_task(task_id):
    try:
        if session.get('user_role') not in EDITOR_ROLES:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404
        if task['status'] == STATUS_COMPLETED:
            return jsonify({'success': False, 'error': 'Заявка уже закрыта'}), 400

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE tasks SET status = ?, completed_date = ? WHERE id = ?',
                [STATUS_COMPLETED, current_time, task_id],
            )

        log_task_change(task_id, 'Статус', task['status'], STATUS_COMPLETED)
        log_action('update', 'task', task_id, {'action': 'close'})

        updated = db.query(
            'SELECT * FROM tasks WHERE id = ?', [task_id], one=True,
        )

        notify_task_completed(
            task_id, dict(updated),
            actor_id=session.get('user_id'),
        )

        invalidate_task_caches()

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} закрыта',
            'completed_date': current_time,
        })
    except Exception as e:
        log.exception('Ошибка закрытия заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ВЗЯТИЕ В РАБОТУ
# ============================================================

@tasks_crud_bp.route('/api/task/<int:task_id>/take', methods=['POST'])
@login_required
def take_task(task_id):
    try:
        if session.get('user_role') not in EDITOR_ROLES:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404
        if task['status'] != STATUS_NEW:
            return jsonify({
                'success': False,
                'error': 'Заявка уже в работе или закрыта',
            }), 400

        user_name = session.get('user_name')

        if task['executor'] and task['executor'] != user_name:
            return jsonify({
                'success': False,
                'error': f'Заявка уже назначена на {task["executor"]}',
            }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE tasks SET status = ?, executor = ? WHERE id = ?',
                [STATUS_IN_PROGRESS, user_name, task_id],
            )

        log_task_change(task_id, 'Статус', STATUS_NEW, STATUS_IN_PROGRESS)
        log_task_change(task_id, 'Исполнитель',
                        task['executor'] or '', user_name)
        log_action('update', 'task', task_id, {'action': 'take'})

        updated = db.query(
            'SELECT * FROM tasks WHERE id = ?', [task_id], one=True,
        )

        notify_task_taken(
            task_id, dict(updated),
            actor_id=session.get('user_id'),
        )

        invalidate_task_caches()

        return jsonify({
            'success': True,
            'message': 'Заявка взята в работу',
            'new_status': STATUS_IN_PROGRESS,
            'executor': user_name,
        })
    except Exception as e:
        log.exception('Ошибка взятия заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ПЕРЕМЕЩЕНИЕ ПО KANBAN (Drag & Drop)
# ============================================================

@tasks_crud_bp.route('/api/task/<int:task_id>/move', methods=['POST'])
@login_required
def move_task(task_id):
    """
    Меняет статус заявки (для Kanban Drag & Drop).
    Body: { status: 'Новое'|'В работе'|'Выполнено'|'Отменено' }
    """
    try:
        if session.get('user_role') not in EDITOR_ROLES:
            return jsonify({
                'success': False,
                'error': 'Недостаточно прав',
            }), 403

        data = get_json_safe()
        new_status = (data.get('status') or '').strip()

        if new_status not in ALL_STATUSES:
            return jsonify({
                'success': False,
                'error': 'Недопустимый статус',
            }), 400

        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({
                'success': False,
                'error': 'Заявка не найдена',
            }), 404

        old_status = task['status']
        user_role = session.get('user_role')
        user_name = session.get('user_name')
        user_id = session.get('user_id')

        ok, err = _is_transition_allowed(
            old_status, new_status, user_role,
        )
        if not ok:
            return jsonify({
                'success': False,
                'error': err,
                'from': old_status,
                'to': new_status,
            }), 400

        if old_status == new_status:
            return jsonify({
                'success': True,
                'message': 'Статус не изменился',
                'new_status': new_status,
            })

        new_executor = task['executor']
        completed_date = task['completed_date']

        if new_status == STATUS_IN_PROGRESS:
            if task['executor'] and task['executor'] != user_name:
                return jsonify({
                    'success': False,
                    'error': f'Заявка уже назначена на {task["executor"]}',
                }), 400
            new_executor = user_name
            completed_date = None

        elif new_status == STATUS_COMPLETED:
            completed_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            if not new_executor:
                new_executor = user_name

        elif new_status == STATUS_CANCELLED:
            completed_date = task['completed_date']

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE tasks
                SET status = ?, executor = ?, completed_date = ?
                WHERE id = ?
            ''', [new_status, new_executor, completed_date, task_id])

        log_task_change(task_id, 'Статус', old_status, new_status)
        if task['executor'] != new_executor:
            log_task_change(
                task_id, 'Исполнитель',
                task['executor'] or '',
                new_executor or '',
            )
        log_action('update', 'task', task_id, {
            'action': 'move',
            'from': old_status,
            'to': new_status,
        })

        updated = db.query(
            'SELECT * FROM tasks WHERE id = ?', [task_id], one=True,
        )

        if new_status == STATUS_IN_PROGRESS and old_status == STATUS_NEW:
            notify_task_taken(task_id, dict(updated), actor_id=user_id)
        elif new_status == STATUS_COMPLETED:
            notify_task_completed(task_id, dict(updated), actor_id=user_id)

        invalidate_task_caches()

        log.info(
            f'[KANBAN] Заявка #{task_id}: {old_status} → {new_status} '
            f'(user={user_name})'
        )

        return jsonify({
            'success': True,
            'message': f'Заявка → {new_status}',
            'new_status': new_status,
            'executor': new_executor,
            'completed_date': completed_date,
        })
    except Exception as e:
        log.exception('move_task error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ (жёсткое, только админ)
# ============================================================

@tasks_crud_bp.route('/api/delete_task/<int:task_id>', methods=['DELETE'])
@role_required(ROLE_ADMIN)
def delete_task(task_id):
    try:
        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        log_action('delete', 'task', task_id, {
            'description': (task['description'] or '')[:100],
        })

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM notifications WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_history WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_comments WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_attachments WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM tasks WHERE id = ?', [task_id])

        invalidate_task_caches()

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} удалена',
        })
    except Exception as e:
        log.exception('Ошибка удаления заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500