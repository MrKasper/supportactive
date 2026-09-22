# tasks_filters.py
"""
Справочные данные для фильтров заявок.
Кешируется на 120 сек.

Роут: GET /api/filters
"""
from flask import Blueprint, jsonify

from database import Database
from utils import login_required
from extensions import cache
from logger import get_logger
from constants import (
    STATUS_NEW, STATUS_IN_PROGRESS,
    STATUS_COMPLETED, STATUS_CANCELLED,
)

log = get_logger(__name__)
tasks_filters_bp = Blueprint('tasks_filters', __name__)
db = Database()


@tasks_filters_bp.route('/api/filters')
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