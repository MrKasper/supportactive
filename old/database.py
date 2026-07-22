# database.py
import sqlite3
from datetime import datetime, timedelta


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

    def insert_test_data(self):
        """Вставка тестовых данных"""
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

            # Добавляем заявки
            now = datetime.now()
            tasks = [
                (
                    now.strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Петров П.П.',
                    'Кабинет 301',
                    'Замена картриджа в принтере HP LaserJet P1102',
                    'Новое',
                    'Иванов И.И.',
                    '',
                    'Замена картриджа',
                    'Высокий',
                    1,
                    None
                ),
                (
                    (now - timedelta(hours=3)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(hours=4)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Сидоров С.С.',
                    'Кабинет 205',
                    'Установка Windows 10 и настройка рабочего ПО',
                    'В работе',
                    'Петров П.П.',
                    'Сидоров С.С.',
                    'Установка ПО',
                    'Средний',
                    1,
                    None
                ),
                (
                    (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Козлова А.С.',
                    'Кабинет 102',
                    'Не работает монитор, необходима диагностика и ремонт',
                    'Новое',
                    '',
                    '',
                    'Не работает принтер',
                    'Высокий',
                    1,
                    None
                ),
                (
                    (now - timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Морозов Д.А.',
                    'Кабинет 405',
                    'Замена жесткого диска на SSD 500GB',
                    'Выполнено',
                    'Петров П.П.',
                    'Сидоров С.С.',
                    'Замена устройства',
                    'Средний',
                    1,
                    (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
                ),
                (
                    (now - timedelta(hours=5)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Иванов И.И.',
                    'Кабинет 302',
                    'Подготовка оборудования для презентации',
                    'Новое',
                    '',
                    '',
                    'Проведение мероприятия',
                    'Низкий',
                    1,
                    None
                ),
                (
                    (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(hours=6)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Козлова А.С.',
                    'Кабинет 305',
                    'Настройка корпоративной почты на ноутбуке',
                    'В работе',
                    'Морозов Д.А.',
                    '',
                    'Настройка ПО',
                    'Средний',
                    1,
                    None
                ),
                (
                    (now - timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Петров П.П.',
                    'Кабинет 201',
                    'Замена клавиатуры на компьютере',
                    'Выполнено',
                    'Сидоров С.С.',
                    '',
                    'Ремонт оборудования',
                    'Высокий',
                    1,
                    (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
                ),
                (
                    (now - timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S'),
                    (now + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S'),
                    'Соколова М.И.',
                    'Кабинет 403',
                    'Настройка сетевого оборудования в лаборатории',
                    'Новое',
                    '',
                    '',
                    'Настройка оборудования',
                    'Высокий',
                    1,
                    None
                )
            ]

            cursor.executemany('''INSERT INTO tasks 
                                (created_date, deadline, from_user, cabinet, description, 
                                 status, executor, assistant, work_type, priority, created_by, completed_date) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', tasks)

            # Добавляем картриджи
            cartridges = [
                ('Кабинет 301', 'Иванов И.И.', 'HP LaserJet P1102', 'HP CE285A',
                 f'{(now - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=180)).strftime("%Y-%m-%d %H:%M:%S")}',
                 'Плановая замена'),
                ('Кабинет 205', 'Петров П.П.', 'HP LaserJet M125', 'HP CF283A',
                 f'{(now - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=120)).strftime("%Y-%m-%d %H:%M:%S")}',
                 'Закончился тонер'),
                ('Кабинет 102', 'Сидоров С.С.', 'Canon LBP6000', 'Canon 725',
                 f'{(now - timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S")}',
                 ''),
                ('Кабинет 403', 'Морозов Д.А.', 'Samsung M2020', 'Samsung MLT-D111S',
                 f'{(now - timedelta(days=20)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=150)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=300)).strftime("%Y-%m-%d %H:%M:%S")}',
                 'Совместимый картридж'),
                ('Кабинет 301', 'Иванов И.И.', 'HP LaserJet P1102', 'HP CE285A',
                 f'{(now - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")}',
                 ''),
                ('Кабинет 205', 'Петров П.П.', 'HP LaserJet M125', 'HP CF283A',
                 None,
                 'Ожидает замены'),
                ('Кабинет 304', 'Соколова М.И.', 'Kyocera FS-1040', 'Kyocera TK-1110',
                 f'{(now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=200)).strftime("%Y-%m-%d %H:%M:%S")}',
                 'Срочная замена'),
                ('Кабинет 101', 'Волков А.Н.', 'Brother HL-1110R', 'Brother TN-1075',
                 f'{(now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")},{(now - timedelta(days=60)).strftime("%Y-%m-%d %H:%M:%S")}',
                 '')
            ]
            cursor.executemany('''INSERT INTO cartridges 
                                (cabinet, full_name, printer, cartridge, replacement_dates, notes) 
                                VALUES (?, ?, ?, ?, ?, ?)''', cartridges)

            # Добавляем лицензии
            licenses = [
                ('Кабинет 301', 'Microsoft Office 2021', 'Корпоративная', 'Установлен на 3 ПК'),
                ('Кабинет 205', 'Windows 10 Pro', 'OEM', 'Предустановленная'),
                ('Кабинет 102', 'Adobe Acrobat Pro', 'Подписка', 'Годовая подписка'),
                ('Кабинет 403', 'Kaspersky Endpoint Security', 'Корпоративная', ''),
                ('Кабинет 301', 'AutoCAD 2024', 'Временная', 'До конца года'),
                ('Кабинет 304', '1С:Предприятие 8', 'Корпоративная', ''),
                ('Кабинет 101', 'Photoshop CC', 'Подписка', ''),
                ('Кабинет 205', 'Microsoft Office 2021', 'Корпоративная', ''),
                ('Кабинет 201', 'Visual Studio 2022', 'Бессрочная', ''),
                ('Кабинет 203', 'Windows Server 2022', 'Корпоративная', 'Серверная лицензия')
            ]
            cursor.executemany('''INSERT INTO licenses 
                                (cabinet, software_name, license_type, notes) 
                                VALUES (?, ?, ?, ?)''', licenses)

            # Добавляем контакты
            contacts = [
                ('Поставщики', 'ООО "ТехноСервис"', 'Иванов Алексей', 'Директор', '+7-999-111-22-33',
                 'alex@technoservice.ru', 'Поставщик оборудования'),
                ('Сервис', 'ИП "Ремонт ПК"', 'Смирнов Павел', 'Мастер', '+7-999-222-33-44', 'pavel@remontpc.ru',
                 'Ремонт компьютерной техники'),
                ('Поставщики', 'ООО "СофтПро"', 'Козлова Елена', 'Менеджер', '+7-999-333-44-55', 'elena@softpro.ru',
                 'Поставщик ПО и лицензий'),
                ('Клиенты', 'АО "ПромТех"', 'Николаев Сергей', 'IT-директор', '+7-999-444-55-66',
                 'nikolaev@promtech.ru', ''),
                ('Партнеры', 'ЗАО "ИнфоСистемы"', 'Федорова Ольга', 'Руководитель отдела', '+7-999-555-66-77',
                 'fedorova@infosys.ru', 'Совместный проект'),
                ('Госорганы', 'Управление ИТ', 'Семенов Виктор', 'Начальник отдела', '+7-999-666-77-88',
                 'semenov@gov.ru', 'Государственный контракт'),
                ('Сервис', 'ООО "СервисПлюс"', 'Григорьев Денис', 'Инженер', '+7-999-777-88-99',
                 'grigoriev@serviceplus.ru', 'Обслуживание оргтехники'),
                ('Поставщики', 'ООО "КанцТорг"', 'Васильева Анна', 'Менеджер по продажам', '+7-999-888-99-00',
                 'vasileva@kanctorg.ru', 'Канцелярские товары')
            ]
            cursor.executemany('''INSERT INTO external_contacts 
                                (category, company_name, contact_person, position, phone, email, notes) 
                                VALUES (?, ?, ?, ?, ?, ?, ?)''', contacts)

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
    import os

    if os.path.exists('database.db'):
        os.remove('database.db')
        print("Старая база данных удалена")

    db = Database()
    db.init_db()
    db.insert_test_data()

    # Проверка
    tasks_count = db.query('SELECT COUNT(*) as count FROM tasks', one=True)['count']
    users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
    cabinets_count = db.query('SELECT COUNT(*) as count FROM cabinets', one=True)['count']
    cartridges_count = db.query('SELECT COUNT(*) as count FROM cartridges', one=True)['count']
    licenses_count = db.query('SELECT COUNT(*) as count FROM licenses', one=True)['count']
    contacts_count = db.query('SELECT COUNT(*) as count FROM external_contacts', one=True)['count']
    problem_types_count = db.query('SELECT COUNT(*) as count FROM problem_types', one=True)['count']

    print(f"\nПроверка базы данных:")
    print(f"  Пользователей: {users_count}")
    print(f"  Кабинетов: {cabinets_count}")
    print(f"  Заявок: {tasks_count}")
    print(f"  Картриджей: {cartridges_count}")
    print(f"  Лицензий: {licenses_count}")
    print(f"  Контактов: {contacts_count}")
    print(f"  Типов проблем: {problem_types_count}")

    # Показываем логины пользователей
    users = db.query('SELECT full_name, login, password, role FROM users')
    print(f"\nДанные для входа:")
    for u in users:
        print(f"  {u['full_name']} | Логин: {u['login']} | Пароль: {u['password']} | Роль: {u['role']}")

    print("\nГотово! База данных создана и заполнена тестовыми данными.")