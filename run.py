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
    # 🔒 DEBUG только из ENV, по умолчанию — выключен
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    if debug_mode:
        log.warning('=' * 60)
        log.warning('⚠️  Сервер запущен в DEBUG-режиме!')
        log.warning('⚠️  Не используйте в продакшене!')
        log.warning('=' * 60)

    log.info('=' * 60)
    log.info(f'Support Active System v2.5')
    log.info(f'Режим: {"DEBUG" if debug_mode else "PRODUCTION"}')
    log.info(f'Сервер: http://localhost:5000')
    log.info('=' * 60)

    app.run(
        debug=debug_mode,
        host='0.0.0.0',
        port=5000,
        use_reloader=debug_mode
    )