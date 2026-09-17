# database.py
import sqlite3
import os
from datetime import datetime, timedelta


class Database:
    def __init__(self, db_name=None):
        if db_name is None:
            db_name = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                'database.db'
            )
        self.db_name = db_name

    def init_db(self):
        """Устаревшая инициализация — теперь всё делают миграции."""
        from migrations import run_migrations
        run_migrations(self.db_name)

    def insert_test_data(self):
        """Вставка тестовых данных (если БД пустая)."""
        from passwords import hash_password

        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            print("Добавление тестовых данных...")

            users = [
                ('Иванов Иван Иванович', 'Администратор', 'admin.png',
                 'ivanov@company.ru', '+7-999-123-45-67', 'IT отдел',
                 'admin', hash_password('admin123'), 1),
                ('Петров Петр Петрович', 'Техник', 'tech1.png',
                 'petrov@company.ru', '+7-999-234-56-78', 'IT отдел',
                 'petrov', hash_password('petrov123'), 1),
                ('Сидоров Сидор Сидорович', 'Техник', 'tech2.png',
                 'sidorov@company.ru', '+7-999-345-67-89', 'IT отдел',
                 'sidorov', hash_password('sidorov123'), 1),
                ('Козлова Анна Сергеевна', 'Пользователь', 'manager1.png',
                 'kozlova@company.ru', '+7-999-456-78-90', 'Отдел продаж',
                 'kozlova', hash_password('kozlova123'), 1),
                ('Морозов Дмитрий Александрович', 'Техник', 'senior1.png',
                 'morozov@company.ru', '+7-999-567-89-01', 'IT отдел',
                 'morozov', hash_password('morozov123'), 1),
                ('Соколова Мария Игоревна', 'Техник', 'tech3.png',
                 'sokolova@company.ru', '+7-999-678-90-12', 'IT отдел',
                 'sokolova', hash_password('sokolova123'), 1),
                ('Волков Андрей Николаевич', 'Администратор', 'admin2.png',
                 'volkov@company.ru', '+7-999-789-01-23', 'IT отдел',
                 'volkov', hash_password('volkov123'), 1)
            ]
            cursor.executemany('''INSERT INTO users 
                                (full_name, role, avatar, email, phone, department, login, password, is_active) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', users)

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
            cursor.executemany(
                '''INSERT INTO problem_types (name, description, is_active) VALUES (?, ?, ?)''',
                problem_types)

            print("Тестовые данные успешно добавлены")
        else:
            print("База данных уже содержит данные, пропускаем")

        conn.commit()
        conn.close()

    def query(self, query, args=(), one=False):
        conn = sqlite3.connect(self.db_name)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(query, args)
        rv = cur.fetchall()
        conn.close()
        return (rv[0] if rv else None) if one else rv

    def execute(self, query, args=()):
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

    tables = db.query("SELECT name FROM sqlite_master WHERE type='table'")
    print(f"\nСуществующие таблицы в базе данных:")
    for table in tables:
        print(f"  - {table['name']}")

    users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
    print(f"\nПользователей в базе: {users_count}")