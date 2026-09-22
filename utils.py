# utils.py
"""
Общие утилиты: декораторы авторизации, работа с JSON-запросами,
защита от CSV-инъекций, определение IP клиента, размеры файлов,
безопасное приведение идентификаторов.
"""
from functools import wraps
from flask import session, jsonify, request
from constants import ALL_ROLES


# ============================================================
# ДЕКОРАТОРЫ АВТОРИЗАЦИИ
# ============================================================

def login_required(f):
    """Требует авторизации. Возвращает 401 JSON для API."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Необходима авторизация'}), 401
        return f(*args, **kwargs)
    return decorated_function


def role_required(*allowed_roles):
    """
    Требует одну из указанных ролей.
    Использование: @role_required(ROLE_ADMIN, ROLE_TECH)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                return jsonify({'error': 'Необходима авторизация'}), 401
            role = session.get('user_role')
            if role not in allowed_roles:
                return jsonify({'error': 'Недостаточно прав'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def admin_required(f):
    """Сокращение для @role_required(ROLE_ADMIN)."""
    from constants import ROLE_ADMIN
    return role_required(ROLE_ADMIN)(f)


def editor_required(f):
    """Сокращение для @role_required(ROLE_ADMIN, ROLE_TECH)."""
    from constants import ROLE_ADMIN, ROLE_TECH
    return role_required(ROLE_ADMIN, ROLE_TECH)(f)


# ============================================================
# РАБОТА С ЗАПРОСАМИ
# ============================================================

def get_json_safe():
    """
    Безопасно читает JSON из запроса.
    Возвращает dict или пустой dict, если тело отсутствует/битое.
    """
    return request.get_json(silent=True) or {}


def get_pagination_params(default_per_page=50, max_per_page=200):
    """
    Возвращает (page, per_page, offset) из query-параметров.
    Всегда безопасные значения.
    """
    try:
        page = max(1, int(request.args.get('page', 1)))
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = int(request.args.get('per_page', default_per_page))
        per_page = max(10, min(max_per_page, per_page))
    except (ValueError, TypeError):
        per_page = default_per_page

    offset = (page - 1) * per_page
    return page, per_page, offset


def get_client_ip():
    """IP клиента с учётом X-Forwarded-For (за Nginx/прокси)."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'


# ============================================================
# ЗАЩИТА ОТ CSV-ИНЪЕКЦИЙ
# ============================================================

_CSV_DANGEROUS_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '\n')


def sanitize_csv_value(value):
    """Экранирует значения, начинающиеся с =, +, -, @."""
    if value is None:
        return ''
    s = str(value)
    if s and s[0] in _CSV_DANGEROUS_PREFIXES:
        s = "'" + s
    return s


# ============================================================
# JSON-ОТВЕТЫ
# ============================================================

def json_ok(**kwargs):
    """Стандартный успешный ответ."""
    data = {'success': True}
    data.update(kwargs)
    return jsonify(data)


def json_error(message, status=400):
    """Стандартный ответ с ошибкой."""
    return jsonify({'success': False, 'error': message}), status


def json_list(items):
    """Ответ со списком."""
    return jsonify(items)


# ============================================================
# ПРОЧЕЕ
# ============================================================

def safe_int(value, default=0):
    """Безопасное приведение к int."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_float(value, default=0.0):
    """Безопасное приведение к float."""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


# ============================================================
# ИДЕНТИФИКАТОРЫ
# ============================================================

def normalize_int_id(value):
    """
    Безопасно приводит значение к int для использования как ID.
    Возвращает int или None.

    Пустые и мусорные значения ('', 'null', 'undefined', None, 'abc')
    → None. Строки с числом → int. Уже int → как есть.
    """
    if value in (None, '', 'null', 'undefined'):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ============================================================
# РАЗМЕРЫ ФАЙЛОВ
# ============================================================

def human_size(bytes_count):
    """
    Человекочитаемый размер файла: '1.2 МБ', '512 Б', '0 Б'.
    Используется везде: в dev-консоли, логах, карточках, драйверах.
    """
    if not bytes_count:
        return '0 Б'
    k = 1024
    sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
    i = 0
    val = float(bytes_count)
    while val >= k and i < len(sizes) - 1:
        val /= k
        i += 1
    if i == 0:
        return f'{int(val)} {sizes[i]}'
    return f'{val:.1f} {sizes[i]}'


def mask_secret(value, keep_start=4, keep_end=4):
    """Маскирует секрет для логов: 'abcdef...wxyz'."""
    if not value or len(value) <= keep_start + keep_end:
        return '***'
    return value[:keep_start] + '...' + value[-keep_end:]