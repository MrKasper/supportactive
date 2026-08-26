# database.py
import sqlite3
from datetime import datetime, timedelta


class Database:
    def __init__(self, db_name='database.db'):
        self.db_name = db_name

    def init_db(self):
        """Инициализация всех таблиц базы данных с миграцией"""
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

        # Таблица уведомлений
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                task_id INTEGER,
                title TEXT,
                message TEXT,
                notification_type TEXT,
                is_read INTEGER DEFAULT 0,
                created_date TEXT
            )
        ''')

        conn.commit()
        conn.close()
        print("База данных успешно инициализирована (новые таблицы добавлены при необходимости)")

    def insert_test_data(self):
        """Вставка тестовых данных (если БД пустая)"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        # Проверяем, есть ли уже данные
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            print("Добавление тестовых данных...")

            # Добавляем пользователей
            users = [
                ('Иванов Иван Иванович', 'Администратор', 'admin.png',
                 'ivanov@company.ru', '+7-999-123-45-67', 'IT отдел', 'admin', 'admin123', 1),
                ('Петров Петр Петрович', 'Техник', 'tech1.png',
                 'petrov@company.ru', '+7-999-234-56-78', 'IT отдел', 'petrov', 'petrov123', 1),
                ('Сидоров Сидор Сидорович', 'Техник', 'tech2.png',
                 'sidorov@company.ru', '+7-999-345-67-89', 'IT отдел', 'sidorov', 'sidorov123', 1),
                ('Козлова Анна Сергеевна', 'Пользователь', 'manager1.png',
                 'kozlova@company.ru', '+7-999-456-78-90', 'Отдел продаж', 'kozlova', 'kozlova123', 1),
                ('Морозов Дмитрий Александрович', 'Техник', 'senior1.png',
                 'morozov@company.ru', '+7-999-567-89-01', 'IT отдел', 'morozov', 'morozov123', 1),
                ('Соколова Мария Игоревна', 'Техник', 'tech3.png',
                 'sokolova@company.ru', '+7-999-678-90-12', 'IT отдел', 'sokolova', 'sokolova123', 1),
                ('Волков Андрей Николаевич', 'Администратор', 'admin2.png',
                 'volkov@company.ru', '+7-999-789-01-23', 'IT отдел', 'volkov', 'volkov123', 1)
            ]
            cursor.executemany('''INSERT INTO users 
                                (full_name, role, avatar, email, phone, department, login, password, is_active) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', users)

            # Добавляем кабинеты
            cabinets = [
                ('Кабинет 101', '1 этаж', 'Корпус А', 'Приемная', 'Иванов И.И.', '+7-999-101-10-10', 1),
                ('Кабинет 102', '1 этаж', 'Корпус А', 'Отдел продаж', 'Козлова А.С.', '+7-999-102-20-20', 1),
                ('Кабинет 103', '1 этаж', 'Корпус А', 'Бухгалтерия', '', '+7-999-103-30-30', 1),
                ('Кабинет 201', '2 этаж', 'Корпус А', 'Отдел разработки', 'Петров П.П.', '+7-999-201-10-10', 1),
                ('Кабинет 202', '2 этаж', 'Корпус А', 'Отдел тестирования', 'Сидоров С.С.', '+7-999-202-20-20', 1),
                ('Кабинет 203', '2 этаж', 'Корпус А', 'Серверная', 'Морозов Д.А.', '+7-999-203-30-30', 1),
                ('Кабинет 204', '2 этаж', 'Корпус А', 'IT отдел', 'Иванов И.И.', '+7-999-204-40-40', 1),
                ('Кабинет 205', '2 этаж', 'Корпус А', 'Переговорная', '', '+7-999-205-50-50', 1),
                ('Кабинет 301', '3 этаж', 'Корпус А', 'Кабинет директора', 'Иванов И.И.', '+7-999-301-10-10', 1),
                ('Кабинет 302', '3 этаж', 'Корпус А', 'Конференц-зал', '', '+7-999-302-20-20', 1),
                ('Кабинет 303', '3 этаж', 'Корпус А', 'Архив', '', '+7-999-303-30-30', 1),
                ('Кабинет 304', '3 этаж', 'Корпус А', 'Отдел кадров', 'Соколова М.И.', '+7-999-304-40-40', 1),
                ('Кабинет 305', '3 этаж', 'Корпус А', 'Учебный класс', 'Волков А.Н.', '+7-999-305-50-50', 1),
                ('Кабинет 401', '4 этаж', 'Корпус Б', 'Склад', '', '+7-999-401-10-10', 1),
                ('Кабинет 402', '4 этаж', 'Корпус Б', 'Технический отдел', 'Петров П.П.', '+7-999-402-20-20', 1),
                ('Кабинет 403', '4 этаж', 'Корпус Б', 'Лаборатория', 'Морозов Д.А.', '+7-999-403-30-30', 1),
                ('Кабинет 404', '4 этаж', 'Корпус Б', 'Отдел закупок', '', '+7-999-404-40-40', 1),
                ('Кабинет 405', '4 этаж', 'Корпус Б', 'Резервный кабинет', '', '+7-999-405-50-50', 1),
                ('Кабинет 501', '5 этаж', 'Корпус Б', 'Столовая', '', '+7-999-501-10-10', 1),
                ('Кабинет 502', '5 этаж', 'Корпус Б', 'Комната отдыха', '', '+7-999-502-20-20', 1)
            ]
            cursor.executemany('''INSERT INTO cabinets 
                                (cabinet_number, floor, building, description, responsible_person, phone, is_active) 
                                VALUES (?, ?, ?, ?, ?, ?, ?)''', cabinets)

            # Добавляем типы проблем
            problem_types = [
                ('Не включается компьютер', 'Компьютер не реагирует на кнопку включения', 1),
                ('Нет интернета', 'Отсутствует подключение к сети Интернет', 1),
                ('Не работает принтер', 'Принтер не печатает, выдает ошибку', 1),
                ('Зависает программа', 'Программа не отвечает, зависает', 1),
                ('Нет доступа к сетевой папке', 'Отсутствует доступ к общим ресурсам', 1),
                ('Вирус', 'Подозрение на заражение вирусом', 1),
                ('Медленная работа', 'Компьютер работает медленно', 1),
                ('Не устанавливается ПО', 'Ошибка при установке программного обеспечения', 1),
                ('Ремонт оборудования', 'Ремонт компьютерной техники', 1),
                ('Установка ПО', 'Установка приложений', 1),
                ('Настройка ПО', 'Настройка приложений', 1),
                ('Замена картриджа', 'Замена картриджа', 1),
                ('Замена устройства', 'Замена устройства', 1),
                ('Проведение мероприятия', 'Проведение мероприятия', 1),
                ('Консультация', 'Консультация', 1),
                ('Диагностика', 'Диагностика', 1),
                ('Настройка оборудования', 'Настройка оборудования', 1)
            ]
            cursor.executemany('''INSERT INTO problem_types (name, description, is_active) VALUES (?, ?, ?)''',
                               problem_types)

            print("Тестовые данные успешно добавлены")
        else:
            print("База данных уже содержит данные, пропускаем добавление тестовых данных")

        conn.commit()
        conn.close()

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
    db = Database()
    db.init_db()

    # Проверка существующих таблиц
    tables = db.query("SELECT name FROM sqlite_master WHERE type='table'")
    print(f"\nСуществующие таблицы в базе данных:")
    for table in tables:
        print(f"  - {table['name']}")

    # Если БД пустая - предлагаем добавить тестовые данные
    users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
    if users_count == 0:
        print("\nБаза данных пуста. Хотите добавить тестовые данные?")
        print("Запустите: python database.py --add-test-data")
    else:
        print(f"\nВ базе данных {users_count} пользователей.")