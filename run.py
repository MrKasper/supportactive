# run.py
from app import app
from database import Database
import os

if __name__ == '__main__':
    # Инициализируем базу данных, если её нет
    if not os.path.exists('database.db'):
        print("Создание базы данных...")
        db = Database()
        print("База данных успешно подключена!")

    print("Запуск Support Active...")
    print("Откройте браузер и перейдите по адресу: http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)