# run.py
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')

try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH, override=True)
except ImportError:
    pass

from logger import setup_logging, get_logger
setup_logging()
log = get_logger(__name__)

log.info(f'Запуск из: {BASE_DIR}')

from database import Database
from migrations import run_migrations

db = Database()
run_migrations(db.db_name)

users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
if users_count == 0:
    log.info('БД пуста. Добавляем тестовые данные...')
    db.insert_test_data()

from app import app

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)