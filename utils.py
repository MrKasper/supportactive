# utils.py
"""
Общие утилиты: декораторы авторизации, защита от CSV-инъекций.
"""
from functools import wraps
from flask import session, jsonify


def login_required(f):
    """Декоратор: требует авторизации."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Необходима авторизация'}), 401
        return f(*args, **kwargs)
    return decorated_function


def role_required(*allowed_roles):
    """
    Декоратор: требует одну из указанных ролей.
    Использование:
        @role_required('Администратор')
        @role_required('Администратор', 'Техник')
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'error': 'Необходима авторизация'}), 401
            if session.get('user_role') not in allowed_roles:
                return jsonify({'error': 'Недостаточно прав'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# Опасные символы, с которых начинается формула в Excel/LibreOffice
_CSV_DANGEROUS_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '\n')


def sanitize_csv_value(value):
    """
    Защита от CSV-инъекций (formula injection).
    Excel/LibreOffice исполняют значения, начинающиеся с =, +, -, @.
    Экранируем их апострофом в начале.
    """
    if value is None:
        return ''
    s = str(value)
    if s and s[0] in _CSV_DANGEROUS_PREFIXES:
        s = "'" + s
    return s


def get_client_ip():
    """IP клиента с учётом X-Forwarded-For (за Nginx/прокси)."""
    from flask import request
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'