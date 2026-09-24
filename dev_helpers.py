# dev_helpers.py
"""
Общие константы и хелперы для dev-консоли.
"""
import os
import re

# ============================================================
# ЗАЩИЩЁННЫЕ ТАБЛИЦЫ
# ============================================================
_PROTECTED_TABLES = {
    'schema_version',
    'sqlite_sequence',
    'sqlite_stat1',
    'users',
    'login_attempts',
    'audit_log',
    'task_history',
    'notifications',
    'push_subscriptions',
}

_TABLE_NAME_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,63}$')

_FORBIDDEN_SQL_KEYWORDS = (
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'REPLACE', 'ATTACH', 'DETACH', 'PRAGMA',
    'VACUUM', 'REINDEX',
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')
BACKUP_DIR = os.path.join(BASE_DIR, 'backups')


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def is_protected(table_name):
    """Проверяет, защищена ли таблица от изменений."""
    if table_name in _PROTECTED_TABLES:
        return True
    if table_name.startswith('sqlite_'):
        return True
    return False


def validate_table_name(table_name):
    """Проверка синтаксиса имени таблицы."""
    return bool(_TABLE_NAME_RE.match(table_name))


def human_size(b):
    """Человекочитаемый размер: '1.2 МБ'."""
    if not b:
        return '0 Б'
    k = 1024
    sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
    i = 0
    v = float(b)
    while v >= k and i < len(sizes) - 1:
        v /= k
        i += 1
    return f'{int(v)} {sizes[i]}' if i == 0 else f'{v:.1f} {sizes[i]}'


def coerce_value(raw_value, col_type):
    """
    Приводит JSON-значение к типу колонки SQLite.
    Возвращает (ok, value, error).
    """
    col_type = (col_type or 'TEXT').upper()

    if raw_value is None or raw_value == '':
        return True, None, None

    if 'INT' in col_type:
        try:
            return True, int(raw_value), None
        except (TypeError, ValueError):
            return False, None, f'Ожидается целое число: {raw_value!r}'

    if 'REAL' in col_type or 'FLOAT' in col_type or 'DOUBLE' in col_type:
        try:
            return True, float(raw_value), None
        except (TypeError, ValueError):
            return False, None, f'Ожидается число: {raw_value!r}'

    return True, str(raw_value), None