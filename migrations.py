# migrations.py
"""
Простая система миграций БД.
Каждая миграция — функция migrate_N(conn).
Версия хранится в таблице schema_version.
"""
import os
import sqlite3
import logging

log = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB = os.path.join(BASE_DIR, 'database.db')


# ---------- Таблица версии ----------
def _ensure_version_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL,
            updated_at TEXT
        )
    ''')
    cur = conn.execute('SELECT version FROM schema_version WHERE id = 1')
    row = cur.fetchone()
    if row is None:
        conn.execute(
            'INSERT INTO schema_version (id, version, updated_at) VALUES (1, 0, datetime("now"))'
        )
        conn.commit()
        return 0
    return row[0]


def _set_version(conn, version):
    from datetime import datetime
    conn.execute(
        'UPDATE schema_version SET version = ?, updated_at = ? WHERE id = 1',
        [version, datetime.now().strftime('%Y-%m-%d %H:%M:%S')]
    )
    conn.commit()


# ---------- Миграции ----------
# Каждая функция: (conn) -> None.
# Номер в имени = версия, до которой приводит эта миграция.

def migrate_1_initial(conn):
    """v1: базовые таблицы (если их ещё нет)."""
    cur = conn.cursor()

    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar TEXT DEFAULT 'default.png',
            email TEXT, phone TEXT, department TEXT,
            login TEXT UNIQUE, password TEXT,
            is_active INTEGER DEFAULT 1
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS cabinets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cabinet_number TEXT NOT NULL,
            floor TEXT, building TEXT, description TEXT,
            responsible_person TEXT, phone TEXT,
            is_active INTEGER DEFAULT 1
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_date TEXT, deadline TEXT,
            from_user TEXT, cabinet TEXT, description TEXT,
            status TEXT DEFAULT 'Новое',
            executor TEXT, assistant TEXT,
            work_type TEXT, priority TEXT DEFAULT 'Средний',
            created_by INTEGER, completed_date TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS cartridges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cabinet TEXT, full_name TEXT, printer TEXT,
            cartridge TEXT, replacement_dates TEXT, notes TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cabinet TEXT, software_name TEXT,
            license_type TEXT, notes TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS external_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT, company_name TEXT,
            contact_person TEXT, position TEXT,
            phone TEXT, email TEXT, notes TEXT
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS problem_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, description TEXT,
            is_active INTEGER DEFAULT 1
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER, task_id INTEGER,
            title TEXT, message TEXT, notification_type TEXT,
            is_read INTEGER DEFAULT 0, created_date TEXT
        )
    ''')
    conn.commit()


def migrate_2_push_subscriptions(conn):
    """v2: push-подписки для Web Push."""
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL, auth TEXT NOT NULL,
            user_agent TEXT, created_at TEXT, last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()


def migrate_3_indexes(conn):
    """v3: индексы для ускорения частых запросов."""
    cur = conn.cursor()
    cur.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_tasks_executor ON tasks(executor)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)')
    conn.commit()


def migrate_4_audit_log(conn):
    """v4: журнал аудита действий."""
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_login TEXT,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            entity_id INTEGER,
            details TEXT,
            ip TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)')
    conn.commit()


def migrate_5_task_attachments(conn):
    """v5: вложения к заявкам."""
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS task_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER,
            filename TEXT NOT NULL,
            original_name TEXT,
            file_size INTEGER,
            mime_type TEXT,
            uploaded_at TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_attach_task ON task_attachments(task_id)')
    conn.commit()


def migrate_6_task_comments(conn):
    """v6: комментарии к заявкам."""
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER,
            user_name TEXT,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL,
            is_internal INTEGER DEFAULT 0,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_comment_task ON task_comments(task_id)')
    conn.commit()


def migrate_7_task_history(conn):
    """v7: история изменений заявок."""
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_id INTEGER,
            user_name TEXT,
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_history_task ON task_history(task_id)')
    conn.commit()


def migrate_8_soft_delete_users(conn):
    """v8: поле deleted_at для мягкого удаления пользователей."""
    cur = conn.cursor()
    try:
        cur.execute('ALTER TABLE users ADD COLUMN deleted_at TEXT DEFAULT NULL')
    except sqlite3.OperationalError:
        pass  # уже есть
    conn.commit()


# ---------- Реестр миграций (по порядку) ----------
MIGRATIONS = [
    (1, migrate_1_initial),
    (2, migrate_2_push_subscriptions),
    (3, migrate_3_indexes),
    (4, migrate_4_audit_log),
    (5, migrate_5_task_attachments),
    (6, migrate_6_task_comments),
    (7, migrate_7_task_history),
    (8, migrate_8_soft_delete_users),
]


def run_migrations(db_path=None):
    """Применяет все неприменённые миграции."""
    if db_path is None:
        db_path = DEFAULT_DB

    conn = sqlite3.connect(db_path)
    try:
        current = _ensure_version_table(conn)
        log.info(f'Текущая версия схемы БД: {current}')

        applied = 0
        for version, func in MIGRATIONS:
            if version <= current:
                continue
            log.info(f'Применяется миграция v{version}: {func.__doc__ or func.__name__}')
            try:
                func(conn)
                _set_version(conn, version)
                applied += 1
            except Exception as e:
                log.error(f'ОШИБКА в миграции v{version}: {e}')
                raise

        if applied:
            log.info(f'Применено миграций: {applied}')
        else:
            log.info('Все миграции уже применены')
    finally:
        conn.close()


if __name__ == '__main__':
    import logging as _l
    _l.basicConfig(level=_l.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    run_migrations()