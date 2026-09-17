# tasks.py
"""
Заявки: список, фильтры, создание, обновление, закрытие, удаление,
массовые операции.
"""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, session
import sqlite3

from database import Database
from utils import (
    login_required, role_required, get_json_safe,
    get_pagination_params,
)
from extensions import cache
from logger import get_logger
from constants import (
    ROLE_ADMIN, ROLE_TECH, ROLE_USER,
    EDITOR_ROLES,
    STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED,
    ALL_PRIORITIES,
)

from services.notifications import (
    notify_new_task,
    notify_task_taken,
    notify_task_completed,
)
from audit import log_action, log_task_change, diff_task

log = get_logger(__name__)
tasks_bp = Blueprint('tasks', __name__)
db = Database()


# ============================================================
# КЕШ
# ============================================================

def _invalidate_task_caches():
    try:
        cache.delete('filters_data')
    except Exception:
        pass


# ============================================================
# СТАТИСТИКА
# ============================================================

@tasks_bp.route('/api/statistics')
@login_required
def get_statistics():
    try:
        def _count(sql, params=()):
            return db.query(sql, params, one=True)['c']

        total_tasks = _count(
            'SELECT COUNT(*) AS c FROM tasks WHERE deleted_at IS NULL'
        )
        completed_tasks = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status = ? AND deleted_at IS NULL',
            [STATUS_COMPLETED],
        )
        new_tasks = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status = ? AND deleted_at IS NULL',
            [STATUS_NEW],
        )
        in_progress_tasks = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status = ? AND deleted_at IS NULL',
            [STATUS_IN_PROGRESS],
        )
        cancelled_tasks = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status = ? AND deleted_at IS NULL',
            [STATUS_CANCELLED],
        )

        user_name = session.get('user_name')
        user_total = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE executor = ? AND deleted_at IS NULL',
            [user_name],
        )
        user_completed = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status = ? AND executor = ? AND deleted_at IS NULL',
            [STATUS_COMPLETED, user_name],
        )
        user_in_progress = _count(
            'SELECT COUNT(*) AS c FROM tasks '
            'WHERE status IN (?, ?) AND executor = ? AND deleted_at IS NULL',
            [STATUS_NEW, STATUS_IN_PROGRESS, user_name],
        )

        work_type_stats = db.query('''
            SELECT work_type, COUNT(*) AS count FROM tasks
            WHERE work_type != '' AND deleted_at IS NULL
            GROUP BY work_type ORDER BY count DESC
        ''')
        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) AS count FROM tasks
            WHERE cabinet != '' AND deleted_at IS NULL
            GROUP BY cabinet ORDER BY count DESC LIMIT 10
        ''')
        overdue_tasks = _count('''
            SELECT COUNT(*) AS c FROM tasks
            WHERE status NOT IN (?, ?)
              AND deadline < datetime('now')
              AND deleted_at IS NULL
        ''', [STATUS_COMPLETED, STATUS_CANCELLED])

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
            'cabinet_stats': [dict(s) for s in cabinet_stats],
        })
    except Exception as e:
        log.exception('Ошибка статистики')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# СПИСОК ЗАЯВОК
# ============================================================

_ALLOWED_SORT_FIELDS = (
    'created_date', 'deadline', 'status', 'priority', 'from_user', 'cabinet',
)


@tasks_bp.route('/api/tasks')
@login_required
def get_tasks():
    try:
        page, per_page, offset = get_pagination_params(default_per_page=50)

        work_type = request.args.get('work_type', '').strip()
        cabinet = request.args.get('cabinet', '').strip()
        status = request.args.get('status', '').strip()
        exclude_status = request.args.get('exclude_status', '').strip()
        user = request.args.get('user', '').strip()
        priority = request.args.get('priority', '').strip()
        date_from = request.args.get('date_from', '').strip()
        date_to = request.args.get('date_to', '').strip()
        search = request.args.get('search', '').strip()
        created_by = request.args.get('created_by', '').strip()
        sort_by = request.args.get('sort_by', 'created_date').strip()
        sort_order = request.args.get('sort_order', 'DESC').strip().upper()

        where = 'WHERE deleted_at IS NULL'
        params = []

        if work_type:
            where += ' AND work_type = ?'
            params.append(work_type)
        if cabinet:
            where += ' AND cabinet LIKE ?'
            params.append(f'%{cabinet}%')
        if status:
            where += ' AND status = ?'
            params.append(status)
        elif exclude_status:
            excl = [s.strip() for s in exclude_status.split(',') if s.strip()]
            if excl:
                placeholders = ','.join(['?'] * len(excl))
                where += f' AND status NOT IN ({placeholders})'
                params.extend(excl)
        if priority:
            where += ' AND priority = ?'
            params.append(priority)
        if user:
            where += ' AND (from_user LIKE ? OR executor LIKE ? OR assistant LIKE ?)'
            s = f'%{user}%'
            params.extend([s, s, s])
        if date_from:
            where += ' AND deadline >= ?'
            params.append(date_from)
        if date_to:
            where += ' AND deadline <= ?'
            params.append(date_to)
        if search:
            where += ' AND (description LIKE ? OR from_user LIKE ? OR cabinet LIKE ?)'
            s = f'%{search}%'
            params.extend([s, s, s])
        if created_by:
            where += ' AND created_by = ?'
            params.append(created_by)

        total = db.query(
            f'SELECT COUNT(*) AS c FROM tasks {where}',
            params, one=True,
        )['c']

        if sort_by not in _ALLOWED_SORT_FIELDS:
            sort_by = 'created_date'
        if sort_order not in ('ASC', 'DESC'):
            sort_order = 'DESC'

        rows = db.query(
            f'SELECT * FROM tasks {where} '
            f'ORDER BY {sort_by} {sort_order} LIMIT ? OFFSET ?',
            params + [per_page, offset],
        )

        tasks_list = []
        for task in rows:
            td = dict(task)
            if (
                td['status'] not in (STATUS_COMPLETED, STATUS_CANCELLED)
                and td['deadline']
            ):
                try:
                    deadline_date = datetime.strptime(
                        td['deadline'], '%Y-%m-%d %H:%M:%S'
                    )
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
            'pages': (total + per_page - 1) // per_page,
        })
    except Exception as e:
        log.exception('Ошибка получения заявок')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ДЕТАЛИ ЗАЯВКИ
# ============================================================

@tasks_bp.route('/api/task/<int:task_id>')
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
# ПРОВЕРКА ЗАНЯТОСТИ
# ============================================================

def _check_executor_busy(executor, deadline_str, duration_minutes,
                         exclude_task_id=None):
    """
    Проверяет пересечение интервалов у исполнителя.
    Возвращает (ok, error_msg, conflict_task_id).
    """
    if not executor or not deadline_str:
        return True, None, None

    try:
        new_deadline_str = deadline_str.replace('T', ' ') + ':00'
        new_deadline = datetime.strptime(
            new_deadline_str, '%Y-%m-%d %H:%M:%S'
        )
    except Exception:
        return True, None, None

    sql = '''
        SELECT id, deadline, duration_minutes FROM tasks
        WHERE executor = ?
          AND status IN (?, ?)
          AND deleted_at IS NULL
    '''
    params = [executor, STATUS_NEW, STATUS_IN_PROGRESS]

    if exclude_task_id:
        sql += ' AND id != ?'
        params.append(exclude_task_id)

    existing = db.query(sql, params)

    new_start = new_deadline
    new_end = new_deadline + timedelta(minutes=duration_minutes)

    for t in existing:
        if not t['deadline']:
            continue
        td = None
        for fmt in (
            '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
            '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M',
        ):
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
            return (
                False,
                f'Техник занят в это время! Заявка №{t["id"]} '
                f'с {t["deadline"]} на {existing_duration} мин.',
                t['id'],
            )

    return True, None, None


# ============================================================
# СОЗДАНИЕ
# ============================================================

@tasks_bp.route('/api/create_task', methods=['POST'])
@login_required
def create_task():
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
            ok, err, _ = _check_executor_busy(
                executor, deadline, duration_minutes,
            )
            if not ok:
                return jsonify({'success': False, 'error': err}), 400

        normalized_deadline = (
            deadline.replace('T', ' ') + ':00'
            if deadline
            else datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )

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
            'assistant': assistant,
        })

        _invalidate_task_caches()

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

@tasks_bp.route('/api/update_task/<int:task_id>', methods=['POST'])
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
        _invalidate_task_caches()

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

@tasks_bp.route('/api/close_task/<int:task_id>', methods=['POST'])
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
        notify_task_completed(task_id, dict(updated))

        _invalidate_task_caches()

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

@tasks_bp.route('/api/task/<int:task_id>/take', methods=['POST'])
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
        notify_task_taken(task_id, dict(updated))

        _invalidate_task_caches()

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
# УДАЛЕНИЕ (жёсткое, только админ)
# ============================================================

@tasks_bp.route('/api/delete_task/<int:task_id>', methods=['DELETE'])
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

        _invalidate_task_caches()

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} удалена',
        })
    except Exception as e:
        log.exception('Ошибка удаления заявки')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# МАССОВЫЕ ОПЕРАЦИИ
# ============================================================

@tasks_bp.route('/api/tasks/bulk', methods=['POST'])
@role_required(ROLE_ADMIN, ROLE_TECH)
def bulk_tasks():
    """
    Массовые операции над заявками.
    Тело:
      {
        action: 'close' | 'assign' | 'priority' | 'delete',
        ids: [1, 2, 3],
        executor: 'Петров П.П.',    # для action=assign
        priority: 'Высокий'         # для action=priority
      }
    """
    try:
        data = get_json_safe()
        action = (data.get('action') or '').strip()

        raw_ids = data.get('ids') or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return jsonify({
                'success': False,
                'error': 'Пустой список ID',
            }), 400

        ids = []
        for i in raw_ids:
            try:
                ids.append(int(i))
            except (TypeError, ValueError):
                pass

        if not ids:
            return jsonify({
                'success': False,
                'error': 'Нет валидных ID',
            }), 400

        if len(ids) > 500:
            return jsonify({
                'success': False,
                'error': 'Максимум 500 заявок за раз',
            }), 400

        updated = 0

        # ---------- Закрытие ----------
        if action == 'close':
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    cur = tx._cur.execute('''
                        UPDATE tasks
                        SET status = ?, completed_date = ?
                        WHERE id = ?
                          AND deleted_at IS NULL
                          AND status NOT IN (?, ?)
                    ''', [
                        STATUS_COMPLETED, now, tid,
                        STATUS_COMPLETED, STATUS_CANCELLED,
                    ])
                    if cur.rowcount:
                        updated += 1

        # ---------- Назначение ----------
        elif action == 'assign':
            executor = (data.get('executor') or '').strip()
            if not executor:
                return jsonify({
                    'success': False,
                    'error': 'Не указан исполнитель',
                }), 400

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('''
                        UPDATE tasks SET executor = ?
                        WHERE id = ? AND deleted_at IS NULL
                    ''', [executor, tid])
            updated = len(ids)

        # ---------- Приоритет ----------
        elif action == 'priority':
            priority = data.get('priority')
            if priority not in ALL_PRIORITIES:
                return jsonify({
                    'success': False,
                    'error': 'Недопустимый приоритет',
                }), 400

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('''
                        UPDATE tasks SET priority = ?
                        WHERE id = ? AND deleted_at IS NULL
                    ''', [priority, tid])
            updated = len(ids)

        # ---------- Удаление ----------
        elif action == 'delete':
            if session.get('user_role') != ROLE_ADMIN:
                return jsonify({
                    'success': False,
                    'error': 'Только администратор',
                }), 403

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('DELETE FROM notifications WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_history WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_comments WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_attachments WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM tasks WHERE id = ?', [tid])
            updated = len(ids)

        else:
            return jsonify({
                'success': False,
                'error': 'Неизвестное действие',
            }), 400

        _invalidate_task_caches()

        try:
            log_action('bulk', 'task', None, {
                'action': action,
                'count': len(ids),
            })
        except Exception:
            pass

        log.info(f'Bulk action={action} над {len(ids)} заявками')

        return jsonify({
            'success': True,
            'updated': updated,
            'message': f'Обновлено: {updated}',
        })
    except Exception as e:
        log.exception('bulk_tasks error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ФИЛЬТРЫ
# ============================================================

@tasks_bp.route('/api/filters')
@login_required
@cache.cached(timeout=120, key_prefix='filters_data')
def get_filters():
    try:
        work_types = [
            r['name'] for r in db.query(
                'SELECT name FROM problem_types '
                'WHERE is_active = 1 ORDER BY name'
            )
        ]
        cabinets = [
            r['cabinet_number'] for r in db.query(
                'SELECT cabinet_number FROM cabinets '
                'WHERE is_active = 1 ORDER BY cabinet_number'
            )
        ]
        statuses = [
            STATUS_NEW, STATUS_IN_PROGRESS,
            STATUS_COMPLETED, STATUS_CANCELLED,
        ]
        priorities = ['Высокий', 'Средний', 'Низкий']
        users = [
            r['full_name'] for r in db.query(
                'SELECT full_name FROM users '
                'WHERE is_active = 1 AND deleted_at IS NULL '
                'ORDER BY full_name'
            )
        ]

        return jsonify({
            'work_types': work_types,
            'cabinets': cabinets,
            'statuses': statuses,
            'priorities': priorities,
            'users': users,
        })
    except Exception as e:
        log.exception('Ошибка получения фильтров')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500