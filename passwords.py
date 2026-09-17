# passwords.py
"""
Хеширование паролей + опциональное хранение plain-копии.
"""
import os
from werkzeug.security import generate_password_hash, check_password_hash

# Читаем флаг из ENV
STORE_PLAIN = os.environ.get('STORE_PLAIN_PASSWORDS', 'true').lower() == 'true'


def hash_password(plain):
    """Возвращает хеш пароля."""
    if not plain:
        return ''
    return generate_password_hash(str(plain), method='pbkdf2:sha256', salt_length=16)


def verify_password(stored, plain):
    """
    Проверяет пароль.
    Возвращает (ok: bool, need_rehash: bool).
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
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


# ============================================================
# PLAIN-КОПИЯ (для внутренней системы)
# ============================================================

def save_plain(db, user_id, plain):
    """Сохраняет plain-копию пароля (если включено в .env)."""
    if not STORE_PLAIN or not plain:
        return
    try:
        # Таблица создаётся в миграции v12
        existing = db.query(
            'SELECT id FROM user_password_plain WHERE user_id = ?',
            [user_id], one=True
        )
        from datetime import datetime
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if existing:
            db.execute(
                'UPDATE user_password_plain SET plain = ?, updated_at = ? WHERE user_id = ?',
                [str(plain), now, user_id]
            )
        else:
            db.execute(
                'INSERT INTO user_password_plain (user_id, plain, updated_at) VALUES (?, ?, ?)',
                [user_id, str(plain), now]
            )
    except Exception as e:
        print(f'[passwords] Не удалось сохранить plain-копию: {e}')


def get_plain(db, user_id):
    """Возвращает plain-копию пароля или None."""
    if not STORE_PLAIN:
        return None
    try:
        row = db.query(
            'SELECT plain FROM user_password_plain WHERE user_id = ?',
            [user_id], one=True
        )
        return row['plain'] if row else None
    except Exception:
        return None