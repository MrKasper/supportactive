# run.py
import os
from database import Database

# Инициализация базы данных
db = Database()
db.init_db()

# Проверяем наличие данных
users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
if users_count == 0:
    print("База данных пуста. Добавление тестовых данных...")
    db.insert_test_data()

# Импортируем app - это нужно для gunicorn
from app import app

# Для запуска через python run.py
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)