# validators.py
"""
Валидация входных данных: единые правила для API.
Возвращает (ok: bool, error_msg: str | None).
"""
import re


EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
LOGIN_RE = re.compile(r'^[a-zA-Z0-9_\-\.]{3,50}$')
IP_RE = re.compile(r'^(\d{1,3}\.){3}\d{1,3}$')
PHONE_RE = re.compile(r'^[\d\s\+\-\(\)]{5,20}$')


def validate_login(login):
    """Проверка логина: 3–50 символов, латиница/цифры/_-. """
    if not login or not login.strip():
        return False, 'Логин обязателен'
    login = login.strip()
    if len(login) < 3:
        return False, 'Логин должен содержать минимум 3 символа'
    if len(login) > 50:
        return False, 'Логин не должен превышать 50 символов'
    if not LOGIN_RE.match(login):
        return False, 'Логин может содержать только латиницу, цифры, _ - .'
    return True, None


def validate_password(password, min_length=6):
    """Проверка пароля."""
    if not password:
        return False, 'Пароль обязателен'
    if len(password) < min_length:
        return False, f'Пароль должен содержать минимум {min_length} символов'
    if len(password) > 200:
        return False, 'Пароль слишком длинный'
    return True, None


def validate_email(email):
    """Проверка email. Пустая строка — допустимо (необязательное поле)."""
    if not email:
        return True, None
    if not EMAIL_RE.match(email.strip()):
        return False, 'Некорректный email'
    return True, None


def validate_phone(phone):
    """Проверка телефона. Пустая строка — допустимо."""
    if not phone:
        return True, None
    if not PHONE_RE.match(phone.strip()):
        return False, 'Некорректный телефон'
    return True, None


def validate_ip(ip):
    """Проверка IPv4. Пустая строка — допустимо."""
    if not ip:
        return True, None
    ip = ip.strip()
    if not IP_RE.match(ip):
        return False, 'Некорректный IP-адрес'
    parts = ip.split('.')
    if any(int(p) > 255 for p in parts):
        return False, 'Некорректный IP-адрес'
    return True, None


def validate_required(value, field_name='Поле'):
    """Общая проверка на непустое значение."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return False, f'{field_name} обязательно для заполнения'
    return True, None


def validate_length(value, field_name, min_len=0, max_len=None):
    """Проверка длины строки."""
    if value is None:
        value = ''
    length = len(str(value))
    if length < min_len:
        return False, f'{field_name} должен содержать минимум {min_len} символов'
    if max_len and length > max_len:
        return False, f'{field_name} не должен превышать {max_len} символов'
    return True, None


def validate_choice(value, allowed, field_name='Значение'):
    """Проверка, что значение входит в список допустимых."""
    if value not in allowed:
        return False, f'{field_name} содержит недопустимое значение'
    return True, None


def validate_file_extension(filename, allowed_ext):
    """Проверка расширения файла."""
    if not filename or '.' not in filename:
        return False, 'Файл без расширения'
    ext = filename.rsplit('.', 1)[1].lower()
    if ext not in allowed_ext:
        return False, f'Недопустимый формат. Разрешены: {", ".join(sorted(allowed_ext))}'
    return True, None