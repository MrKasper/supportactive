# audit.py
"""
Журнал аудита действий пользователей + история изменений заявок.
"""
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required, role_required, get_client_ip
from logger import get_logger
import json
import re

log = get_logger(__name__)

audit_bp = Blueprint('audit', __name__)
db = Database()

# ============================================================
# 🛡 БЕЗОПАСНОСТЬ: ограничения и санитизация details
# ============================================================

# Максимальная длина JSON-строки details
MAX_DETAILS_LENGTH = 2000
# Максимальная длина одного значения внутри details
MAX_VALUE_LENGTH = 200
# Максимальная глубина вложенности
MAX_DEPTH = 3


def _sanitize_value(v, depth=0):
    """
    Рекурсивно санитизирует значение:
      - обрезает слишком длинные строки
      - удаляет опасные символы
      - ограничивает глубину вложенности
    """
    if depth > MAX_DEPTH:
        return '[truncated:depth]'

    if v is None:
        return None

    if isinstance(v, (int, float, bool)):
        return v

    if isinstance(v, str):
        # Удаляем управляющие символы и нулевые байты
        v = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', v)
        # Ограничиваем длину
        if len(v) > MAX_VALUE_LENGTH:
            v = v[:MAX_VALUE_LENGTH] + '...'
        return v

    if isinstance(v, dict):
        # Разрешённые ключи (латиница, цифры, _, -)
        result = {}
        for k, val in list(v.items())[:20]:  # макс. 20 ключей
            if not isinstance(k, str):
                k = str(k)
            # Убираем опасные ключи
            if k.startswith('$') or k.startswith('_'):
                continue
            k_clean = re.sub(r'[^a-zA-Z0-9_\-\u0400-\u04FF]', '', k)[:50]
            if k_clean:
                result[k_clean] = _sanitize_value(val, depth + 1)
        return result

    if isinstance(v, (list, tuple)):
        return [_sanitize_value(x, depth + 1) for x in list(v)[:20]]

    # Прочее — преобразуем в строку
    try:
        return _sanitize_value(str(v), depth + 1)
    except Exception:
        return '[unserializable]'


def _sanitize_details(details):
    """
    Возвращает безопасную JSON-строку для записи в аудит.
    Ограничивает общую длину.
    """
    if details is None:
        return None

    try:
        # Уже dict / list — санитизируем
        if isinstance(details, (dict, list)):
            sanitized = _sanitize_value(details)
            s = json.dumps(sanitized, ensure_ascii=False, separators=(',', ':'))
        else:
            # Строку просто обрезаем
            s = str(details)
            if len(s) > MAX_DETAILS_LENGTH:
                s = s[:MAX_DETAILS_LENGTH] + '...'

        # Обрезаем итоговую строку
        if len(s) > MAX_DETAILS_LENGTH:
            s = s[:MAX_DETAILS_LENGTH] + '...[truncated]'

        return s
    except Exception as e:
        log.warning(f'Ошибка санитизации details: {e}')
        return '[invalid]'


# ============================================================
# ЗАПИСЬ ДЕЙСТВИЙ
# ============================================================

def log_action(action, entity, entity_id=None, details=None, user_id=None, user_login=None):
    """Записывает действие в журнал аудита."""
    try:
        if user_id is None:
            user_id = session.get('user_id')
        if user_login is None:
            user_login = session.get('user_login', '')

        safe_details = _sanitize_details(details)
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

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
            safe_details,
            get_client_ip(),
            (request.headers.get('User-Agent') or '')[:300],
            now
        ])
    except Exception as e:
        log.exception(f'Ошибка записи в audit_log: {e}')


def log_task_change(task_id, field_name, old_value, new_value):
    """Записывает изменение поля заявки в task_history."""
    try:
        # Санитизируем значения
        old_s = _sanitize_value(old_value)
        new_s = _sanitize_value(new_value)

        db.execute('''
            INSERT INTO task_history
                (task_id, user_id, user_name, field_name, old_value, new_value, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [
            task_id,
            session.get('user_id'),
            session.get('user_name', ''),
            str(field_name)[:100],
            str(old_s) if old_s is not None else '',
            str(new_s) if new_s is not None else '',
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])
    except Exception as e:
        log.exception(f'Ошибка записи task_history: {e}')


def diff_task(old_task, new_data):
    """Сравнивает старую заявку с новыми данными."""
    fields_map = {
        'deadline': 'Срок', 'from_user': 'От кого', 'cabinet': 'Кабинет',
        'description': 'Описание', 'status': 'Статус', 'executor': 'Исполнитель',
        'assistant': 'Помощник', 'work_type': 'Тип работы', 'priority': 'Приоритет',
    }
    changes = []
    for key, ru_name in fields_map.items():
        if key in new_data:
            old_val = old_task.get(key)
            new_val = new_data.get(key)
            if str(old_val or '') != str(new_val or ''):
                changes.append((ru_name, old_val, new_val))
    return changes


# ============================================================
# API
# ============================================================

@audit_bp.route('/api/audit')
@role_required('Администратор')
def get_audit_log():
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
            where += ' AND user_login LIKE ?'; params.append(f'%{user_login}%')
        if action:
            where += ' AND action = ?'; params.append(action)
        if entity:
            where += ' AND entity = ?'; params.append(entity)
        if date_from:
            where += ' AND created_at >= ?'; params.append(date_from + ' 00:00:00')
        if date_to:
            where += ' AND created_at <= ?'; params.append(date_to + ' 23:59:59')

        total = db.query(f'SELECT COUNT(*) as count FROM audit_log {where}', params, one=True)['count']
        rows = db.query(f'''
            SELECT * FROM audit_log {where}
            ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
        ''', params + [per_page, offset])

        return jsonify({
            'items': [dict(r) for r in rows],
            'total': total, 'page': page, 'per_page': per_page,
            'pages': (total + per_page - 1) // per_page
        })
    except Exception as e:
        log.exception('Ошибка получения audit_log')
        return jsonify({'error': str(e)}), 500


@audit_bp.route('/api/audit/stats')
@role_required('Администратор')
def get_audit_stats():
    try:
        total = db.query('SELECT COUNT(*) as count FROM audit_log', one=True)['count']
        today = datetime.now().strftime('%Y-%m-%d')
        today_count = db.query('SELECT COUNT(*) as count FROM audit_log WHERE created_at LIKE ?',
                               [f'{today}%'], one=True)['count']

        by_action = db.query('SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC')
        by_entity = db.query('SELECT entity, COUNT(*) as count FROM audit_log GROUP BY entity ORDER BY count DESC')
        top_users = db.query('''SELECT user_login, COUNT(*) as count FROM audit_log
                                WHERE user_login != '' GROUP BY user_login ORDER BY count DESC LIMIT 10''')

        return jsonify({
            'total': total, 'today': today_count,
            'by_action': [dict(r) for r in by_action],
            'by_entity': [dict(r) for r in by_entity],
            'top_users': [dict(r) for r in top_users]
        })
    except Exception as e:
        log.exception('Ошибка get_audit_stats')
        return jsonify({'error': str(e)}), 500


@audit_bp.route('/api/audit/entity/<entity>/<int:entity_id>')
@role_required('Администратор')
def get_entity_history(entity, entity_id):
    try:
        if entity == 'task':
            rows = db.query('''SELECT * FROM task_history WHERE task_id = ?
                               ORDER BY created_at DESC, id DESC LIMIT 200''', [entity_id])
            return jsonify({'items': [dict(r) for r in rows], 'entity': 'task', 'entity_id': entity_id})

        rows = db.query('''SELECT * FROM audit_log WHERE entity = ? AND entity_id = ?
                          ORDER BY created_at DESC, id DESC LIMIT 200''', [entity, entity_id])
        return jsonify({'items': [dict(r) for r in rows], 'entity': entity, 'entity_id': entity_id})
    except Exception as e:
        log.exception('Ошибка get_entity_history')
        return jsonify({'error': str(e)}), 500