# tasks_list.py
"""
Список заявок: статистика, фильтры, пагинация, Kanban для Техника.

Особенности видимости для Техника:
  • get_tasks() с параметром for_technician=<ФИО>
    → возвращает только «мои» + «Новое без исполнителя»
  • get_tasks_kanban() возвращает то же самое для доски
"""
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, get_pagination_params
from extensions import cache
from logger import get_logger
from constants import (
    STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED,
    EDITOR_ROLES,
)

log = get_logger(__name__)
tasks_list_bp = Blueprint('tasks_list', __name__)
db = Database()

_ALLOWED_SORT_FIELDS = (
    'created_date', 'deadline', 'status', 'priority', 'from_user', 'cabinet',
)


# ============================================================
# СТАТИСТИКА
# ============================================================

@tasks_list_bp.route('/api/statistics')
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
# СПИСОК ЗАЯВОК (табличный вид)
# ============================================================

@tasks_list_bp.route('/api/tasks')
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
        for_technician = request.args.get('for_technician', '').strip()
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

        # ---------- Специальный фильтр для Техника ----------
        # Техник видит:
        #   • свои заявки (executor = он)
        #   • «Новое» без назначенного исполнителя (чтобы мог взять)
        if for_technician:
            where += (
                " AND (executor = ?"
                " OR (status = ? AND (executor IS NULL OR executor = '')))"
            )
            params.extend([for_technician, STATUS_NEW])

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
# KANBAN — задачи для Техника
# ============================================================

@tasks_list_bp.route('/api/tasks/kanban')
@login_required
def get_tasks_kanban():
    """
    Kanban-доска для Техника:
      • «Новое» — только те, где нет исполнителя, ИЛИ назначено на меня
      • «В работе» — только мои
      • «Выполнено» — только мои за последние 30 дней

    Другие техники не видны.
    """
    try:
        if session.get('user_role') not in EDITOR_ROLES:
            return jsonify({'error': 'Недостаточно прав'}), 403

        user_name = session.get('user_name')

        # ---------- Новые заявки: без исполнителя ИЛИ назначенные на меня ----------
        new_tasks = db.query('''
            SELECT * FROM tasks
            WHERE status = ? AND deleted_at IS NULL
              AND (executor IS NULL OR executor = '' OR executor = ?)
            ORDER BY
                CASE priority
                    WHEN 'Высокий' THEN 1
                    WHEN 'Средний' THEN 2
                    ELSE 3
                END,
                created_date DESC
            LIMIT 200
        ''', [STATUS_NEW, user_name])

        # ---------- Мои: в работе + выполненные за 30 дней ----------
        my_tasks = db.query('''
            SELECT * FROM tasks
            WHERE executor = ?
              AND deleted_at IS NULL
              AND (
                  status = ?
                  OR (status = ?
                      AND completed_date >= datetime('now', '-30 days'))
              )
            ORDER BY
                CASE status
                    WHEN ? THEN 1
                    WHEN ? THEN 2
                    ELSE 3
                END,
                deadline ASC
            LIMIT 300
        ''', [
            user_name,
            STATUS_IN_PROGRESS,
            STATUS_COMPLETED,
            STATUS_IN_PROGRESS,
            STATUS_COMPLETED,
        ])

        # ---------- Объединяем, убираем дубли ----------
        seen = set()
        result = []

        for t in list(new_tasks) + list(my_tasks):
            if t['id'] in seen:
                continue
            seen.add(t['id'])

            d = dict(t)

            if (
                d['status'] not in (STATUS_COMPLETED, STATUS_CANCELLED)
                and d['deadline']
            ):
                try:
                    dl = datetime.strptime(
                        d['deadline'], '%Y-%m-%d %H:%M:%S'
                    )
                    d['is_overdue'] = dl < datetime.now()
                except Exception:
                    d['is_overdue'] = False
            else:
                d['is_overdue'] = False

            result.append(d)

        return jsonify({
            'items': result,
            'total': len(result),
        })
    except Exception as e:
        log.exception('Kanban: ошибка получения задач')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ФИЛЬТРЫ
# ============================================================

@tasks_list_bp.route('/api/filters')
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