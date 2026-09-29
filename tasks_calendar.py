# tasks_calendar.py
"""
Календарь заявок — задачи, сгруппированные по датам срока.

Эндпоинт /api/tasks/calendar возвращает данные для отображения
в виде сетки месяц/неделя/день. Учитывает роль пользователя:
Техник видит только свои + новые без исполнителя.
"""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required
from constants import (
    STATUS_NEW, STATUS_COMPLETED, STATUS_CANCELLED,
    EDITOR_ROLES,
)
from logger import get_logger

log = get_logger(__name__)
db = Database()

tasks_calendar_bp = Blueprint('tasks_calendar', __name__)


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _parse_date(s, default=None):
    if not s:
        return default
    try:
        return datetime.strptime(s[:10], '%Y-%m-%d')
    except (ValueError, TypeError):
        return default


def _iso(d):
    return d.strftime('%Y-%m-%d')


def _load_tags_map(task_ids):
    """Возвращает {task_id: [ {id, name, color}, ... ]}."""
    if not task_ids:
        return {}
    placeholders = ','.join('?' * len(task_ids))
    rows = db.query(f'''
        SELECT tt.task_id, t.id, t.name, t.color
        FROM task_tags tt
        JOIN tags t ON t.id = tt.tag_id
        WHERE tt.task_id IN ({placeholders})
          AND t.deleted_at IS NULL
        ORDER BY t.name
    ''', task_ids)
    result = {}
    for r in rows:
        result.setdefault(r['task_id'], []).append({
            'id': r['id'],
            'name': r['name'],
            'color': r['color'],
        })
    return result


# ============================================================
# КАЛЕНДАРЬ
# ============================================================

@tasks_calendar_bp.route('/api/tasks/calendar')
@login_required
def tasks_calendar():
    """
    Параметры:
      from, to         — YYYY-MM-DD (обязательные)
      date_field       — deadline | created_date | completed_date
                         (по умолчанию deadline)
      status           — статус (один) или пусто
      statuses         — CSV статусов (альтернатива)
      priority         — приоритет
      executor         — исполнитель (LIKE)
      cabinet          — кабинет (LIKE)
      work_type        — тип работы
      tags             — CSV id тегов
      for_technician   — ФИО (Техник)
    """
    try:
        date_from = _parse_date(request.args.get('from'))
        date_to = _parse_date(request.args.get('to'))

        if not date_from or not date_to:
            # По умолчанию — текущий месяц
            today = datetime.now()
            date_from = today.replace(day=1)
            next_month = (date_from + timedelta(days=32)).replace(day=1)
            date_to = next_month - timedelta(days=1)

        if date_to < date_from:
            date_from, date_to = date_to, date_from

        # Ограничиваем диапазон, чтобы не тянуть всё
        if (date_to - date_from).days > 366:
            date_to = date_from + timedelta(days=366)

        date_field = (request.args.get('date_field') or 'deadline').strip()
        if date_field not in ('deadline', 'created_date', 'completed_date'):
            date_field = 'deadline'

        where = f"WHERE deleted_at IS NULL AND {date_field} IS NOT NULL"
        params = []

        # Диапазон по дню
        where += f' AND date({date_field}) >= date(?) '
        params.append(_iso(date_from))
        where += f' AND date({date_field}) <= date(?) '
        params.append(_iso(date_to))

        status = (request.args.get('status') or '').strip()
        statuses_csv = (request.args.get('statuses') or '').strip()
        priority = (request.args.get('priority') or '').strip()
        executor = (request.args.get('executor') or '').strip()
        cabinet = (request.args.get('cabinet') or '').strip()
        work_type = (request.args.get('work_type') or '').strip()
        tags_csv = (request.args.get('tags') or '').strip()
        for_technician = (request.args.get('for_technician') or '').strip()

        if status:
            where += ' AND status = ?'
            params.append(status)
        elif statuses_csv:
            items = [s.strip() for s in statuses_csv.split(',') if s.strip()]
            if items:
                ph = ','.join('?' * len(items))
                where += f' AND status IN ({ph})'
                params.extend(items)

        if priority:
            where += ' AND priority = ?'
            params.append(priority)

        if executor:
            where += ' AND (executor LIKE ? OR assistant LIKE ?)'
            params.extend([f'%{executor}%', f'%{executor}%'])

        if cabinet:
            where += ' AND cabinet LIKE ?'
            params.append(f'%{cabinet}%')

        if work_type:
            where += ' AND work_type = ?'
            params.append(work_type)

        if for_technician:
            where += (
                " AND (executor = ?"
                " OR (status = ? AND (executor IS NULL OR executor = '')))"
            )
            params.extend([for_technician, STATUS_NEW])

        # Теги
        tag_ids = []
        if tags_csv:
            for x in tags_csv.split(','):
                x = x.strip()
                if x.isdigit():
                    tag_ids.append(int(x))
        if tag_ids:
            ph = ','.join('?' * len(tag_ids))
            where += (
                f' AND id IN (SELECT task_id FROM task_tags '
                f'WHERE tag_id IN ({ph}))'
            )
            params.extend(tag_ids)

        rows = db.query(f'''
            SELECT id, created_date, deadline, completed_date,
                   from_user, cabinet, description, work_type,
                   status, priority, executor, assistant,
                   duration_minutes
            FROM tasks
            {where}
            ORDER BY {date_field} ASC, id ASC
            LIMIT 3000
        ''', params)

        # Группируем по дню
        task_ids = [r['id'] for r in rows]
        tags_map = _load_tags_map(task_ids)

        days = {}
        for r in rows:
            d = dict(r)
            raw_date = d.get(date_field) or ''
            day = raw_date[:10] if raw_date else ''
            if not day:
                continue
            d['tags'] = tags_map.get(d['id'], [])
            days.setdefault(day, []).append(d)

        return jsonify({
            'from': _iso(date_from),
            'to': _iso(date_to),
            'date_field': date_field,
            'days': days,
            'total': len(rows),
        })
    except Exception as e:
        log.exception('tasks_calendar error')
        return jsonify({'error': str(e)}), 500