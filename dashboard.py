# dashboard.py
"""
Дашборд для руководства: агрегированная аналитика по заявкам.
"""
from flask import Blueprint, jsonify, render_template
from database import Database
from utils import role_required
from constants import (
    ROLE_ADMIN, ROLE_TECH,
    STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED, STATUS_CANCELLED,
)
from logger import get_logger
from datetime import datetime, timedelta

log = get_logger(__name__)
dashboard_bp = Blueprint('dashboard', __name__)
db = Database()


# ============================================================
# СТРАНИЦА
# ============================================================

@dashboard_bp.route('/dashboard')
@role_required(ROLE_ADMIN)
def dashboard_page():
    return render_template('dashboard.html')


# ============================================================
# API: сводная статистика
# ============================================================

@dashboard_bp.route('/api/dashboard/summary')
@role_required(ROLE_ADMIN)
def dashboard_summary():
    """KPI верхнего уровня."""
    try:
        # Текущие показатели
        total = db.query(
            'SELECT COUNT(*) AS c FROM tasks WHERE deleted_at IS NULL',
            one=True,
        )['c']

        by_status = db.query('''
            SELECT status, COUNT(*) AS count FROM tasks
            WHERE deleted_at IS NULL
            GROUP BY status
        ''')
        status_map = {r['status']: r['count'] for r in by_status}

        # Среднее время закрытия (в часах)
        avg_close = db.query('''
            SELECT AVG(
                (julianday(completed_date) - julianday(created_date)) * 24
            ) AS avg_hours
            FROM tasks
            WHERE status = ?
              AND completed_date IS NOT NULL
              AND created_date IS NOT NULL
              AND deleted_at IS NULL
        ''', [STATUS_COMPLETED], one=True)
        avg_close_hours = round(avg_close['avg_hours'] or 0, 1)

        # Просроченные
        overdue = db.query('''
            SELECT COUNT(*) AS c FROM tasks
            WHERE status NOT IN (?, ?)
              AND deadline < datetime('now')
              AND deleted_at IS NULL
        ''', [STATUS_COMPLETED, STATUS_CANCELLED], one=True)['c']

        # За сегодня
        today = datetime.now().strftime('%Y-%m-%d')
        today_created = db.query('''
            SELECT COUNT(*) AS c FROM tasks
            WHERE created_date LIKE ?
        ''', [f'{today}%'], one=True)['c']
        today_closed = db.query('''
            SELECT COUNT(*) AS c FROM tasks
            WHERE completed_date LIKE ?
        ''', [f'{today}%'], one=True)['c']

        return jsonify({
            'total': total,
            'new': status_map.get(STATUS_NEW, 0),
            'in_progress': status_map.get(STATUS_IN_PROGRESS, 0),
            'completed': status_map.get(STATUS_COMPLETED, 0),
            'cancelled': status_map.get(STATUS_CANCELLED, 0),
            'overdue': overdue,
            'avg_close_hours': avg_close_hours,
            'today_created': today_created,
            'today_closed': today_closed,
        })
    except Exception as e:
        log.exception('dashboard_summary error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# API: динамика по месяцам (12 месяцев)
# ============================================================

@dashboard_bp.route('/api/dashboard/monthly')
@role_required(ROLE_ADMIN)
def dashboard_monthly():
    try:
        rows = db.query('''
            SELECT strftime('%Y-%m', created_date) AS month,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed
            FROM tasks
            WHERE created_date >= date('now', '-12 months')
              AND deleted_at IS NULL
            GROUP BY month
            ORDER BY month
        ''', [STATUS_COMPLETED])

        # Заполняем пропущенные месяцы нулями
        now = datetime.now()
        months = []
        year, month = now.year, now.month
        sequence = []
        for _ in range(12):
            sequence.append((year, month))
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        sequence.reverse()

        data_map = {r['month']: r for r in rows}
        for y, m in sequence:
            key = f'{y:04d}-{m:02d}'
            row = data_map.get(key)
            months.append({
                'month': key,
                'total': row['total'] if row else 0,
                'completed': row['completed'] if row else 0,
            })

        return jsonify({'months': months})
    except Exception as e:
        log.exception('dashboard_monthly error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# API: топ исполнителей
# ============================================================

@dashboard_bp.route('/api/dashboard/executors')
@role_required(ROLE_ADMIN)
def dashboard_executors():
    try:
        rows = db.query('''
            SELECT executor,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active,
                   AVG(
                       CASE WHEN status = ? AND completed_date IS NOT NULL
                       THEN (julianday(completed_date) - julianday(created_date)) * 24
                       ELSE NULL END
                   ) AS avg_hours
            FROM tasks
            WHERE executor IS NOT NULL AND executor != ''
              AND deleted_at IS NULL
            GROUP BY executor
            ORDER BY completed DESC, total DESC
            LIMIT 15
        ''', [STATUS_COMPLETED, STATUS_NEW, STATUS_IN_PROGRESS, STATUS_COMPLETED])

        return jsonify([
            {
                'executor': r['executor'],
                'total': r['total'],
                'completed': r['completed'],
                'active': r['active'],
                'avg_hours': round(r['avg_hours'] or 0, 1),
            }
            for r in rows
        ])
    except Exception as e:
        log.exception('dashboard_executors error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# API: топ кабинетов и типов
# ============================================================

@dashboard_bp.route('/api/dashboard/cabinets')
@role_required(ROLE_ADMIN)
def dashboard_cabinets():
    try:
        rows = db.query('''
            SELECT cabinet, COUNT(*) AS count
            FROM tasks
            WHERE cabinet IS NOT NULL AND cabinet != ''
              AND deleted_at IS NULL
            GROUP BY cabinet
            ORDER BY count DESC
            LIMIT 10
        ''')
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('dashboard_cabinets error')
        return jsonify({'error': str(e)}), 500


@dashboard_bp.route('/api/dashboard/work-types')
@role_required(ROLE_ADMIN)
def dashboard_work_types():
    try:
        rows = db.query('''
            SELECT work_type, COUNT(*) AS count
            FROM tasks
            WHERE work_type IS NOT NULL AND work_type != ''
              AND deleted_at IS NULL
            GROUP BY work_type
            ORDER BY count DESC
            LIMIT 10
        ''')
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('dashboard_work_types error')
        return jsonify({'error': str(e)}), 500