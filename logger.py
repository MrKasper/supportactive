# logger.py
"""
Централизованная настройка логирования.
Пишет в консоль и в файл с ротацией по дням.
"""
import os
import logging
from logging.handlers import RotatingFileHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')


def setup_logging(app=None, log_level=logging.INFO):
    """Настраивает логирование для всего приложения."""
    os.makedirs(LOG_DIR, exist_ok=True)

    # Формат
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # ---- Root logger ----
    root = logging.getLogger()
    root.setLevel(log_level)

    # Убираем дефолтные хендлеры, если они есть
    for h in list(root.handlers):
        root.removeHandler(h)

    # ---- Консоль ----
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    console.setLevel(log_level)
    root.addHandler(console)

    # ---- Файл (общий) ----
    app_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, 'app.log'),
        maxBytes=5 * 1024 * 1024,   # 5 МБ
        backupCount=10,
        encoding='utf-8'
    )
    app_handler.setFormatter(formatter)
    app_handler.setLevel(log_level)
    root.addHandler(app_handler)

    # ---- Файл (ошибки отдельно) ----
    error_handler = RotatingFileHandler(
        os.path.join(LOG_DIR, 'errors.log'),
        maxBytes=5 * 1024 * 1024,
        backupCount=10,
        encoding='utf-8'
    )
    error_handler.setFormatter(formatter)
    error_handler.setLevel(logging.ERROR)
    root.addHandler(error_handler)

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