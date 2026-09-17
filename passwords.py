# passwords.py
"""
Хеширование паролей и проверка. Пароли НЕ хранятся в открытом виде.
"""
import os
import secrets
import string
from werkzeug.security import generate_password_hash, check_password_hash


def hash_password(plain):
    """Возвращает хеш пароля (pbkdf2:sha256)."""
    if not plain:
        return ''
    return generate_password_hash(str(plain), method='pbkdf2:sha256', salt_length=16)


def verify_password(stored, plain):
    """
    Проверяет пароль. Возвращает (ok: bool, need_rehash: bool).
    need_rehash=True, если в БД ещё лежит plaintext — нужно перехешировать.
    """
    if not stored or plain is None:
        return False, False

    stored_s = str(stored)
    is_hashed = stored_s.startswith('pbkdf2:') or stored_s.startswith('scrypt:')

    if is_hashed:
        try:
            ok = check_password_hash(stored_s, str(plain))
            return ok, False
        except Exception:
            return False, False
    else:
        ok = (stored_s == str(plain))
        return ok, ok


def generate_password(length=10):
    """Генерирует читаемый случайный пароль."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))