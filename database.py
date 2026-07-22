# database.py
import sqlite3


class Database:
    def __init__(self, db_name='database.db'):
        self.db_name = db_name

    def init_db(self):
        """Инициализация всех таблиц базы данных"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        # Таблица пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                avatar TEXT DEFAULT 'default.png',
                email TEXT,
                phone TEXT,
                department TEXT,
                login TEXT UNIQUE,
                password TEXT,
                is_active INTEGER DEFAULT 1
            )
        ''')

        # Таблица кабинетов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cabinets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cabinet_number TEXT NOT NULL,
                floor TEXT,
                building TEXT,
                description TEXT,
                responsible_person TEXT,
                phone TEXT,
                is_active INTEGER DEFAULT 1
            )
        ''')

        # Таблица заявок
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_date TEXT,
                deadline TEXT,
                from_user TEXT,
                cabinet TEXT,
                description TEXT,
                status TEXT DEFAULT 'Новое',
                executor TEXT,
                assistant TEXT,
                work_type TEXT,
                priority TEXT DEFAULT 'Средний',
                created_by INTEGER,
                completed_date TEXT
            )
        ''')

        # Таблица картриджей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS cartridges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cabinet TEXT,
                full_name TEXT,
                printer TEXT,
                cartridge TEXT,
                replacement_dates TEXT,
                notes TEXT
            )
        ''')

        # Таблица лицензий
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cabinet TEXT,
                software_name TEXT,
                license_type TEXT,
                notes TEXT
            )
        ''')

        # Таблица внешних контактов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS external_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT,
                company_name TEXT,
                contact_person TEXT,
                position TEXT,
                phone TEXT,
                email TEXT,
                notes TEXT
            )
        ''')

        # Таблица типов проблем
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS problem_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                is_active INTEGER DEFAULT 1
            )
        ''')

        conn.commit()
        conn.close()
        print("База данных успешно инициализирована")

    def query(self, query, args=(), one=False):
        """Выполнение SELECT запроса"""
        conn = sqlite3.connect(self.db_name)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(query, args)
        rv = cur.fetchall()
        conn.close()
        return (rv[0] if rv else None) if one else rv

    def execute(self, query, args=()):
        """Выполнение INSERT/UPDATE/DELETE запроса"""
        conn = sqlite3.connect(self.db_name)
        cur = conn.cursor()
        cur.execute(query, args)
        conn.commit()
        last_id = cur.lastrowid
        conn.close()
        return last_id


if __name__ == '__main__':
    import os

    if os.path.exists('database.db'):
        os.remove('database.db')
        print("Старая база данных удалена")

    db = Database()
    db.init_db()

    print("\nГотово! База данных создана.")