# run.py
import os

try:
    from dotenv import load_dotenv
    # Загружаем .env из корня проекта — до импорта app.py
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except ImportError:
    print("⚠️  python-dotenv не установлен. pip install python-dotenv")

from database import Database

db = Database()
db.init_db()

users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
if users_count == 0:
    print("База данных пуста. Добавление тестовых данных...")
    db.insert_test_data()

# Импорт app — для gunicorn
from app import app

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)