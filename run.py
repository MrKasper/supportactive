# run.py
"""
Support Active System — точка входа для разработки.

Использование:
  • Локально:           python run.py
  • Gunicorn (prod):    gunicorn 'run:app' --workers 1 --threads 8 ...
                        или лучше: gunicorn 'app:create_app()' ...

В этом файле:
  • Загружается .env
  • Инициализируется логирование
  • Создаётся Flask-приложение через фабрику create_app()
  • Экспортируется переменная `app` для WSGI-серверов
  • Запускается dev-сервер при `python run.py`
"""
import os
import sys

# ============================================================
# .env — до всего остального, чтобы ENV был доступен везде
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')

try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH, override=True)
except ImportError:
    # python-dotenv не установлен — работаем без .env
    pass


# ============================================================
# Логирование — до импорта приложения
# ============================================================
from logger import setup_logging, get_logger
setup_logging()
log = get_logger(__name__)

log.info(f'Запуск из: {BASE_DIR}')
log.info(f'Python: {sys.version.split()[0]}')
log.info(f'Process ID: {os.getpid()}')


# ============================================================
# Создание приложения через фабрику
# ============================================================
from app import create_app

# Создаём экземпляр приложения.
# Это нужно для WSGI-серверов (gunicorn, waitress, uwsgi),
# которые импортируют `run:app`.
#
# Логирование, миграции, blueprint-регистрация — всё внутри create_app().
try:
    app = create_app()
except Exception as e:
    log.exception('❌ Не удалось создать приложение')
    raise


# ============================================================
# Точка входа для локального запуска
# ============================================================
if __name__ == '__main__':
    debug_mode = app.config.get('DEBUG', False)
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))

    log.info('=' * 60)
    log.info('Support Active System v2.9')
    log.info(f'Режим: {"DEBUG" if debug_mode else "PRODUCTION"}')
    log.info(f'Сервер: http://{host}:{port}')
    log.info(f'Сессии: {app.config.get("SESSION_TYPE", "filesystem")}')
    log.info(f'Кеш: {app.config.get("CACHE_TYPE", "SimpleCache")}')
    log.info('=' * 60)

    if debug_mode:
        log.warning('⚠️  Запущено в DEBUG-режиме — не используйте в продакшене!')

    app.run(
        debug=debug_mode,
        host=host,
        port=port,
        use_reloader=debug_mode,
        threaded=True,
    )