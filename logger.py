# logger.py
"""
Централизованная настройка логирования.
Пишет в консоль и в файлы с ротацией по дням.

Отдельные файлы:
  • app.log            — общий поток
  • errors.log         — только ERROR и выше
  • slow_requests.log  — запросы дольше SLOW_REQUEST_MS (изолированный logger)
"""
import os
import logging
from logging.handlers import RotatingFileHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')


def setup_logging(app=None, log_level=logging.INFO):
    """Настраивает логирование для всего приложения."""
    os.makedirs(LOG_DIR, exist_ok=True)

    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # ---- Root logger ----
    root = logging.getLogger()
    root.setLevel(log_level)

    for h in list(root.handlers):
        root.removeHandler(h)

    # ---- Консоль ----
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    console.setLevel(log_level)
    root.addHandler(console)

    # ---- app.log ----
    app_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, 'app.log'),
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding='utf-8'
    )
    app_handler.setFormatter(formatter)
    app_handler.setLevel(log_level)
    root.addHandler(app_handler)

    # ---- errors.log ----
    error_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, 'errors.log'),
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding='utf-8'
    )
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)
    root.addHandler(error_handler)

    # ---- slow_requests.log (изолированный logger) ----
    # propagate=False — чтобы запись НЕ дублировалась в app.log
    slow_logger = logging.getLogger('slow_requests')
    slow_logger.setLevel(logging.WARNING)
    slow_logger.propagate = False

    # Убираем старые хендлеры (на случай повторного setup)
    for h in list(slow_logger.handlers):
        slow_logger.removeHandler(h)

    slow_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, 'slow_requests.log'),
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding='utf-8'
    )
    slow_handler.setFormatter(formatter)
    slow_logger.addHandler(slow_handler)

    # ---- Тише от сторонних библиотек ----
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

    logging.info('=' * 60)
    logging.info('Логирование инициализировано')
    logging.info(f'Папка логов: {LOG_DIR}')
    logging.info('=' * 60)


def get_logger(name):
    """Возвращает логгер с указанным именем."""
    return logging.getLogger(name)