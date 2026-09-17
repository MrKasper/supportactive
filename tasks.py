# tasks.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime, timedelta
from utils import login_required, role_required
from extensions import cache
from logger import get_logger
import sqlite3

from notifications import (
    create_notification,
    notify_new_task,
    notify_task_taken,
    notify_task_completed,
)
from audit import log_action, log_task_change, diff_task

log = get_logger(__name__)

tasks_bp = Blueprint('tasks', __name__)
db = Database()


def _invalidate_task_caches():
    """Сброс кешей, связанных с заявками."""
    try:
        cache.delete('filters_data')
    except Exception:
        pass


# ============= СТАТИСТИКА =============

@tasks_bp.route('/api/statistics')
@login_required
def get_statistics():
    try:
        total_tasks = db.query(
            'SELECT COUNT(*) as c FROM tasks WHERE deleted_at IS NULL', one=True
        )['c']
        completed_tasks = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status = 'Выполнено' AND deleted_at IS NULL",
            one=True
        )['c']
        new_tasks = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status = 'Новое' AND deleted_at IS NULL",
            one=True
        )['c']
        in_progress_tasks = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status = 'В работе' AND deleted_at IS NULL",
            one=True
        )['c']
        cancelled_tasks = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status = 'Отменено' AND deleted_at IS NULL",
            one=True
        )['c']

        user_name = session.get('user_name')
        user_total = db.query(
            'SELECT COUNT(*) as c FROM tasks WHERE executor = ? AND deleted_at IS NULL',
            [user_name], one=True
        )['c']
        user_completed = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status = 'Выполнено' AND executor = ? AND deleted_at IS NULL",
            [user_name], one=True
        )['c']
        user_in_progress = db.query(
            "SELECT COUNT(*) as c FROM tasks WHERE status IN ('Новое','В работе') AND executor = ? AND deleted_at IS NULL",
            [user_name], one=True
        )['c']

        work_type_stats = db.query('''
            SELECT work_type, COUNT(*) as count FROM tasks
            WHERE work_type != '' AND deleted_at IS NULL
            GROUP BY work_type ORDER BY count DESC
        ''')
        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) as count FROM tasks
            WHERE cabinet != '' AND deleted_at IS NULL
            GROUP BY cabinet ORDER BY count DESC LIMIT 10
        ''')
        overdue_tasks = db.query('''
            SELECT COUNT(*) as c FROM tasks
            WHERE status NOT IN ('Выполнено','Отменено')
              AND deadline < datetime('now')
              AND deleted_at IS NULL
        ''', one=True)['c']

        return jsonify({
            'total': total_tasks,
            'completed': completed_tasks,
            'new': new_tasks,
            'in_progress': in_progress_tasks,
            'cancelled': cancelled_tasks,
            'new_or_progress': new_tasks + in_progress_tasks,
            'user_completed': user_completed,
            'user_in_progress': user_in_progress,
            'user_total': user_total,
            'overdue': overdue_tasks,
            'work_type_stats': [dict(s) for s in work_type_stats],
            'cabinet_stats': [dict(s) for s in cabinet_stats]
        })
    except Exception as e:
        log.exception('Ошибка статистики')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============= СПИСОК =============

@tasks_bp.route('/api/tasks')
@login_required
def get_tasks():
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(200, max(10, int(request.args.get('per_page', 50))))
        offset = (page - 1) * per_page

        work_type = request.args.get('work_type', '')
        cabinet = request.args.get('cabinet', '')
        status = request.args.get('status', '')
        exclude_status = request.args.get('exclude_status', '')
        user = request.args.get('user', '')
        priority = request.args.get('priority', '')
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        search = request.args.get('search', '')
        created_by = request.args.get('created_by', '')
        sort_by = request.args.get('sort_by', 'created_date')
        sort_order = request.args.get('sort_order', 'DESC')

        where = 'WHERE deleted_at IS NULL'
        params = []

        if work_type:
            where += ' AND work_type = ?'; params.append(work_type)
        if cabinet:
            where += ' AND cabinet LIKE ?'; params.append(f'%{cabinet}%')
        if status:
            where += ' AND status = ?'; params.append(status)
        elif exclude_status:
            excl = [s.strip() for s in exclude_status.split(',') if s.strip()]
            if excl:
                placeholders = ','.join(['?'] * len(excl))
                where += f' AND status NOT IN ({placeholders})'
                params.extend(excl)
        if priority:
            where += ' AND priority = ?'; params.append(priority)
        if user:
            where += ' AND (from_user LIKE ? OR executor LIKE ? OR assistant LIKE ?)'
            s = f'%{user}%'
            params.extend([s, s, s])
        if date_from:
            where += ' AND deadline >= ?'; params.append(date_from)
        if date_to:
            where += ' AND deadline <= ?'; params.append(date_to)
        if search:
            where += ' AND (description LIKE ? OR from_user LIKE ? OR cabinet LIKE ?)'
            s = f'%{search}%'
            params.extend([s, s, s])
        if created_by:
            where += ' AND created_by = ?'; params.append(created_by)

        total = db.query(f'SELECT COUNT(*) as c FROM tasks {where}', params, one=True)['c']

        allowed_sort = ['created_date', 'deadline', 'status', 'priority', 'from_user', 'cabinet']
        if sort_by not in allowed_sort:
            sort_by = 'created_date'
        if sort_order.upper() not in ('ASC', 'DESC'):
            sort_order = 'DESC'

        rows = db.query(
            f'SELECT * FROM tasks {where} ORDER BY {sort_by} {sort_order} LIMIT ? OFFSET ?',
            params + [per_page, offset]
        )

        tasks_list = []
        for task in rows:
            td = dict(task)
            if td['status'] not in ('Выполнено', 'Отменено') and td['deadline']:
                try:
                    deadline_date = datetime.strptime(td['deadline'], '%Y-%m-%d %H:%M:%S')
                    td['is_overdue'] = deadline_date < datetime.now()
                except Exception:
                    td['is_overdue'] = False
            else:
                td['is_overdue'] = False
            tasks_list.append(td)

        return jsonify({
            'items': tasks_list,
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        })
    except Exception as e:
        log.exception('Ошибка получения заявок')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============= ДЕТАЛИ ЗАЯВКИ =============

@tasks_bp.route('/api/task/<int:task_id>')
@login_required
def get_task(task_id):
    try:
        task = db.query(
            'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True
        )
        if not task:
            return jsonify({'error': 'Заявка не найдена'}), 404

        if session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
            return jsonify({'error': 'Недостаточно прав'}), 403

        history = db.query('''
            SELECT * FROM task_history WHERE task_id = ?
            ORDER BY created_at DESC, id DESC LIMIT 100
        ''', [task_id])

        att_count = db.query(
            'SELECT COUNT(*) as c FROM task_attachments WHERE task_id = ?',
            [task_id], one=True
        )['c']
        com_count = db.query(
            'SELECT COUNT(*) as c FROM task_comments WHERE task_id = ? AND deleted_at IS NULL',
            [task_id], one=True
        )['c']

        result = dict(task)
        result['history'] = [dict(h) for h in history]
        result['attachments_count'] = att_count
        result['comments_count'] = com_count
        return jsonify(result)
    except Exception as e:
        log.exception('Ошибка получения заявки')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============= СОЗДАНИЕ =============

@tasks_bp.route('/api/create_task', methods=['POST'])
@login_required
def create_task():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        for field in ('description', 'work_type'):
            if not data.get(field):
                return jsonify({'success': False, 'error': f'Поле "{field}" обязательно'}), 400

        executor = (data.get('executor') or '').strip()
        deadline = (data.get('deadline') or '').strip()
        duration_minutes = int(data.get('duration_minutes') or 60)

        if executor and deadline:
            try:
                new_deadline_str = deadline.replace('T', ' ') + ':00'
                new_deadline = datetime.strptime(new_deadline_str, '%Y-%m-%d %H:%M:%S')
            except Exception:
                new_deadline = None

            if new_deadline:
                existing = db.query('''
                    SELECT id, deadline, duration_minutes FROM tasks
                    WHERE executor = ?
                      AND status IN ('Новое','В работе')
                      AND deleted_at IS NULL
                ''', [executor])

                new_start = new_deadline
                new_end = new_deadline + timedelta(minutes=duration_minutes)

                for t in existing:
                    if not t['deadline']:
                        continue
                    td = None
                    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
                                '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
                        try:
                            td = datetime.strptime(t['deadline'], fmt)
                            break
                        except Exception:
                            continue
                    if not td:
                        continue

                    existing_duration = int(t['duration_minutes'] or 60)
                    existing_start = td
                    existing_end = td + timedelta(minutes=existing_duration)

                    if new_start < existing_end and existing_start < new_end:
                        return jsonify({
                            'success': False,
                            'error': f'Техник занят в это время! Заявка №{t["id"]} '
                                     f'с {t["deadline"]} на {existing_duration} мин.'
                        }), 400

        normalized_deadline = (
            deadline.replace('T', ' ') + ':00' if deadline
            else datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )

        if session.get('user_role') == 'Пользователь':
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
                    executor, assistant, 'Новое',
                    session['user_id'],
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    duration_minutes
                ])
        except sqlite3.IntegrityError:
            return jsonify({
                'success': False,
                'error': 'Техник в это время уже занят другой заявкой'
            }), 400

        log.info(f'Создана заявка №{task_id}')
        log_action('create', 'task', task_id, {
            'description': data['description'][:100],
            'cabinet': data.get('cabinet', ''),
            'executor': executor,
        })

        notify_new_task(task_id, {
            'description': data['description'],
            'from_user': data.get('from_user', ''),
            'executor': executor,
            'assistant': assistant
        })

        _invalidate_task_caches()

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': f'Заявка №{task_id} создана'
        }), 201
    except Exception as e:
        log.exception('Ошибка создания заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============= ОБНОВЛЕНИЕ =============

@tasks_bp.route('/api/update_task/<int:task_id>', methods=['POST'])
@login_required
def update_task(task_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
                       [task_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        if session.get('user_role') == 'Пользователь' and old['created_by'] != session.get('user_id'):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        old_dict = dict(old)
        changes = diff_task(old_dict, data)
        for field_name, old_val, new_val in changes:
            log_task_change(task_id, field_name, old_val, new_val)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE tasks
                SET deadline = ?, from_user = ?, cabinet = ?, description = ?,
                    status = ?, executor = ?, assistant = ?, work_type = ?, priority = ?
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
                task_id
            ])

        log_action('update', 'task', task_id, {'changes': len(changes)})
        return jsonify({'success': True, 'message': f'Заявка №{task_id} обновлена'})
    except Exception as e:
        log.exception('Ошибка обновления заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============= ЗАКРЫТИЕ =============

@tasks_bp.route('/api/close_task/<int:task_id>', methods=['POST'])
@login_required
def close_task(task_id):
    try:
        if session.get('user_role') not in ('Администратор', 'Техник'):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        task = db.query('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
                        [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404
        if task['status'] == 'Выполнено':
            return jsonify({'success': False, 'error': 'Заявка уже закрыта'}), 400

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE tasks SET status = "Выполнено", completed_date = ? WHERE id = ?',
                [current_time, task_id]
            )

        log_task_change(task_id, 'Статус', task['status'], 'Выполнено')
        log_action('update', 'task', task_id, {'action': 'close'})

        updated = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        notify_task_completed(task_id, dict(updated))

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} закрыта',
            'completed_date': current_time
        })
    except Exception as e:
        log.exception('Ошибка закрытия заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============= ВЗЯТИЕ В РАБОТУ =============

@tasks_bp.route('/api/task/<int:task_id>/take', methods=['POST'])
@login_required
def take_task(task_id):
    try:
        if session.get('user_role') not in ('Администратор', 'Техник'):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        task = db.query('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
                        [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404
        if task['status'] != 'Новое':
            return jsonify({'success': False, 'error': 'Заявка уже в работе или закрыта'}), 400

        user_name = session.get('user_name')

        if task['executor'] and task['executor'] != user_name:
            return jsonify({
                'success': False,
                'error': f'Заявка уже назначена на {task["executor"]}'
            }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE tasks SET status = "В работе", executor = ? WHERE id = ?',
                [user_name, task_id]
            )

        log_task_change(task_id, 'Статус', 'Новое', 'В работе')
        log_task_change(task_id, 'Исполнитель', task['executor'] or '', user_name)
        log_action('update', 'task', task_id, {'action': 'take'})

        updated = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        notify_task_taken(task_id, dict(updated))

        return jsonify({
            'success': True,
            'message': 'Заявка взята в работу',
            'new_status': 'В работе',
            'executor': user_name
        })
    except Exception as e:
        log.exception('Ошибка взятия заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============= УДАЛЕНИЕ =============

@tasks_bp.route('/api/delete_task/<int:task_id>', methods=['DELETE'])
@role_required('Администратор')
def delete_task(task_id):
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
                        [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        log_action('delete', 'task', task_id, {
            'description': (task['description'] or '')[:100]
        })

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM notifications WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_history WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_comments WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM task_attachments WHERE task_id = ?', [task_id])
            tx.execute('DELETE FROM tasks WHERE id = ?', [task_id])

        return jsonify({'success': True, 'message': f'Заявка №{task_id} удалена'})
    except Exception as e:
        log.exception('Ошибка удаления заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============= ФИЛЬТРЫ (кешируется) =============

@tasks_bp.route('/api/filters')
@login_required
@cache.cached(timeout=120, key_prefix='filters_data')
def get_filters():
    """Данные для фильтров. Кешируется на 2 минуты."""
    try:
        work_types = [r['name'] for r in db.query(
            'SELECT name FROM problem_types WHERE is_active = 1 ORDER BY name'
        )]
        cabinets = [r['cabinet_number'] for r in db.query(
            'SELECT cabinet_number FROM cabinets WHERE is_active = 1 ORDER BY cabinet_number'
        )]
        statuses = ['Новое', 'В работе', 'Выполнено', 'Отменено']
        priorities = ['Высокий', 'Средний', 'Низкий']
        users = [r['full_name'] for r in db.query(
            'SELECT full_name FROM users WHERE is_active = 1 AND deleted_at IS NULL ORDER BY full_name'
        )]

        return jsonify({
            'work_types': work_types,
            'cabinets': cabinets,
            'statuses': statuses,
            'priorities': priorities,
            'users': users
        })
    except Exception as e:
        log.exception('Ошибка получения фильтров')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500