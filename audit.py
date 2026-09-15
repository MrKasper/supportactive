# audit.py
"""
Журнал аудита действий пользователей.
Также используется для истории изменений заявок (task_history).
"""
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required, role_required, get_client_ip
from logger import get_logger

log = get_logger(__name__)

audit_bp = Blueprint('audit', __name__)
db = Database()


# ============= ЗАПИСЬ ДЕЙСТВИЙ =============

def log_action(action, entity, entity_id=None, details=None, user_id=None, user_login=None):
    """
    Записывает действие в журнал аудита.

    action: create / update / delete / login / logout / view / import
    entity: task / user / cabinet / cartridge / license / contact / problem_type
    entity_id: ID изменённого объекта
    details: dict или str с деталями (сохраняется как JSON)
    """
    try:
        import json

        if user_id is None:
            user_id = session.get('user_id')
        if user_login is None:
            user_login = session.get('user_login', '')

        if isinstance(details, dict):
            details = json.dumps(details, ensure_ascii=False)
        elif details is not None:
            details = str(details)

        db.execute('''
            INSERT INTO audit_log
                (user_id, user_login, action, entity, entity_id,
                 details, ip, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            user_id,
            user_login,
            action,
            entity,
            entity_id,
            details,
            get_client_ip(),
            (request.headers.get('User-Agent') or '')[:300],
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])
    except Exception as e:
        log.exception(f'Ошибка записи в audit_log: {e}')


def log_task_change(task_id, field_name, old_value, new_value):
    """
    Записывает изменение конкретного поля заявки в task_history.
    """
    try:
        db.execute('''
            INSERT INTO task_history
                (task_id, user_id, user_name, field_name, old_value, new_value, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [
            task_id,
            session.get('user_id'),
            session.get('user_name', ''),
            field_name,
            str(old_value) if old_value is not None else '',
            str(new_value) if new_value is not None else '',
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])
    except Exception as e:
        log.exception(f'Ошибка записи task_history: {e}')


def diff_task(old_task, new_data):
    """
    Сравнивает старую заявку с новыми данными,
    возвращает список изменений [(field, old, new), ...].
    """
    fields_map = {
        'deadline': 'Срок',
        'from_user': 'От кого',
        'cabinet': 'Кабинет',
        'description': 'Описание',
        'status': 'Статус',
        'executor': 'Исполнитель',
        'assistant': 'Помощник',
        'work_type': 'Тип работы',
        'priority': 'Приоритет',
    }
    changes = []
    for key, ru_name in fields_map.items():
        if key in new_data:
            old_val = old_task.get(key)
            new_val = new_data.get(key)
            if str(old_val or '') != str(new_val or ''):
                changes.append((ru_name, old_val, new_val))
    return changes


# ============= API =============

@audit_bp.route('/api/audit')
@role_required('Администратор')
def get_audit_log():
    """Список записей аудита с фильтрами и пагинацией."""
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(200, max(10, int(request.args.get('per_page', 50))))
        offset = (page - 1) * per_page

        user_login = request.args.get('user_login', '').strip()
        action = request.args.get('action', '').strip()
        entity = request.args.get('entity', '').strip()
        date_from = request.args.get('date_from', '').strip()
        date_to = request.args.get('date_to', '').strip()

        where = 'WHERE 1=1'
        params = []

        if user_login:
            where += ' AND user_login LIKE ?'
            params.append(f'%{user_login}%')
        if action:
            where += ' AND action = ?'
            params.append(action)
        if entity:
            where += ' AND entity = ?'
            params.append(entity)
        if date_from:
            where += ' AND created_at >= ?'
            params.append(date_from + ' 00:00:00')
        if date_to:
            where += ' AND created_at <= ?'
            params.append(date_to + ' 23:59:59')

        total = db.query(
            f'SELECT COUNT(*) as count FROM audit_log {where}',
            params, one=True
        )['count']

        rows = db.query(f'''
            SELECT * FROM audit_log
            {where}
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
        ''', params + [per_page, offset])

        return jsonify({
            'items': [dict(r) for r in rows],
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        })

    except Exception as e:
        log.exception('Ошибка получения audit_log')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


@audit_bp.route('/api/audit/stats')
@role_required('Администратор')
def get_audit_stats():
    """Сводная статистика журнала."""
    try:
        total = db.query('SELECT COUNT(*) as count FROM audit_log', one=True)['count']
        today = datetime.now().strftime('%Y-%m-%d')

        today_count = db.query(
            'SELECT COUNT(*) as count FROM audit_log WHERE created_at LIKE ?',
            [f'{today}%'], one=True
        )['count']

        by_action = db.query('''
            SELECT action, COUNT(*) as count
            FROM audit_log
            GROUP BY action
            ORDER BY count DESC
        ''')

        by_entity = db.query('''
            SELECT entity, COUNT(*) as count
            FROM audit_log
            GROUP BY entity
            ORDER BY count DESC
        ''')

        top_users = db.query('''
            SELECT user_login, COUNT(*) as count
            FROM audit_log
            WHERE user_login != ''
            GROUP BY user_login
            ORDER BY count DESC
            LIMIT 10
        ''')

        return jsonify({
            'total': total,
            'today': today_count,
            'by_action': [dict(r) for r in by_action],
            'by_entity': [dict(r) for r in by_entity],
            'top_users': [dict(r) for r in top_users]
        })
    except Exception as e:
        log.exception('Ошибка получения статистики аудита')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


@audit_bp.route('/api/audit/entity/<entity>/<int:entity_id>')
@role_required('Администратор')
def get_entity_history(entity, entity_id):
    """История изменений конкретного объекта (например, заявки)."""
    try:
        if entity == 'task':
            rows = db.query('''
                SELECT * FROM task_history
                WHERE task_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 200
            ''', [entity_id])
            return jsonify({
                'items': [dict(r) for r in rows],
                'entity': 'task',
                'entity_id': entity_id
            })

        rows = db.query('''
            SELECT * FROM audit_log
            WHERE entity = ? AND entity_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 200
        ''', [entity, entity_id])
        return jsonify({
            'items': [dict(r) for r in rows],
            'entity': entity,
            'entity_id': entity_id
        })
    except Exception as e:
        log.exception('Ошибка получения истории объекта')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500