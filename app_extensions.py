# app_extensions.py
"""
Инициализация Flask-расширений и сессий.
С обработкой graceful fallback при недоступном Redis.
"""
import os

from flask import Flask
from flask_session import Session

from logger import get_logger

log = get_logger(__name__)


def redis_available(url, timeout=2):
    """Проверяет доступность Redis. Никогда не бросает исключение."""
    if not url:
        return False

    try:
        import redis
    except ImportError:
        log.warning('Модуль redis не установлен')
        return False

    try:
        client = redis.from_url(
            url,
            socket_connect_timeout=timeout,
            socket_timeout=timeout,
        )
        client.ping()
        return True
    except Exception as e:
        log.debug(f'Redis ping failed ({url}): {e}')
        return False


def init_sessions(app):
    """Инициализирует Flask-Session с Redis или fallback на filesystem."""
    session_type = app.config.get('SESSION_TYPE', 'filesystem')
    session_redis_url = app.config.get('SESSION_REDIS', '')

    if session_type == 'redis' and session_redis_url:
        if redis_available(session_redis_url):
            try:
                import redis
                app.config['SESSION_REDIS'] = redis.from_url(session_redis_url)
                Session(app)
                log.info(f'Сессии: Redis ({session_redis_url})')
                return
            except Exception as e:
                log.warning(
                    f'Не удалось инициализировать Redis-сессии: {e}. '
                    f'Откат на filesystem.'
                )
        else:
            log.warning(
                f'Redis недоступен по адресу {session_redis_url} — '
                f'откат на файловые сессии.'
            )

        # Обновляем config ДО Session(app)
        app.config['SESSION_TYPE'] = 'filesystem'
        app.config['SESSION_REDIS'] = ''

    Session(app)
    log.info(f'Сессии: {app.config["SESSION_TYPE"]}')


def start_ping_scheduler_if_needed():
    """Запускает фоновый планировщик пинга, если он не отключён."""
    if os.environ.get('DISABLE_PING_SCHEDULER', 'false').lower() == 'true':
        log.info('Планировщик пинга отключён (DISABLE_PING_SCHEDULER=true)')
        return

    try:
        from services.ping import start_ping_scheduler
        start_ping_scheduler()
    except Exception as e:
        log.warning(f'Планировщик пинга не запущен: {e}')