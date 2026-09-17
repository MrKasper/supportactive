# run.py
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env.example')

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

from app import create_app


if __name__ == '__main__':
    app = create_app()
    debug_mode = app.config.get('DEBUG', False)

    if debug_mode:
        log.warning('=' * 60)
        log.warning('⚠️  Сервер запущен в DEBUG-режиме!')
        log.warning('⚠️  Не используйте в продакшене!')
        log.warning('=' * 60)

    log.info('=' * 60)
    log.info('Support Active System v2.7')
    log.info(f'Режим: {"DEBUG" if debug_mode else "PRODUCTION"}')
    log.info('Сервер: http://localhost:5000')
    log.info('=' * 60)

    app.run(
        debug=debug_mode,
        host='0.0.0.0',
        port=5000,
        use_reloader=debug_mode,
    )