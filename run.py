# run.py
import os
from database import Database


def main():
    """Главная функция запуска приложения"""

    # Инициализация базы данных
    db = Database()
    db.init_db()

    # Если БД пустая - добавляем тестовые данные
    users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
    if users_count == 0:
        print("База данных пуста. Добавление тестовых данных...")
        db.insert_test_data()

    # Запускаем Flask приложение
    from app import app
    app.run(debug=True, host='0.0.0.0', port=5000)


if __name__ == '__main__':
    main()