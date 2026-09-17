# config.py
"""
Конфигурация приложения: все значения читаются из ENV один раз.
Позволяет не разбрасывать os.environ по всему коду.
"""
import os
from datetime import timedelta


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _env_bool(key, default=False):
    return os.environ.get(key, str(default)).lower() in ('1', 'true', 'yes', 'on')


def _env_int(key, default):
    try:
        return int(os.environ.get(key, default))
    except (ValueError, TypeError):
        return default


class Config:
    """Базовая конфигурация."""

    # --- Основное ---
    BASE_DIR = BASE_DIR
    SECRET_KEY = os.environ.get('SECRET_KEY')
    DEBUG = _env_bool('FLASK_DEBUG', False)

    # --- База данных ---
    DB_PATH = os.environ.get('DB_PATH') or os.path.join(BASE_DIR, 'database.db')

    # --- Сессии ---
    # SESSION_TYPE=redis (продакшн) или filesystem (локально)
    SESSION_TYPE = os.environ.get('SESSION_TYPE', 'filesystem')
    SESSION_FILE_DIR = os.path.join(BASE_DIR, 'flask_session')
    SESSION_REDIS = os.environ.get('SESSION_REDIS', '')
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = 'support_active_'
    SESSION_FILE_THRESHOLD = 500
    SESSION_COOKIE_NAME = 'support_active_session'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_PATH = '/'
    SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', False)
    PERMANENT_SESSION_LIFETIME = timedelta(days=_env_int('SESSION_LIFETIME_DAYS', 7))

    # --- Загрузки ---
    MAX_CONTENT_LENGTH = _env_int('MAX_CONTENT_LENGTH_MB', 20) * 1024 * 1024

    # --- CSRF ---
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
    WTF_CSRF_HEADERS = ['X-CSRFToken', 'X-CSRF-Token']

    # --- Rate limiting ---
    RATELIMIT_STORAGE_URI = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_DEFAULT = '1000 per hour;200 per minute'

    # --- Кеш ---
    CACHE_TYPE = os.environ.get('CACHE_TYPE', 'SimpleCache')
    CACHE_DEFAULT_TIMEOUT = _env_int('CACHE_DEFAULT_TIMEOUT', 300)
    CACHE_NO_NULL_WARNING = True
    CACHE_REDIS_URL = os.environ.get('CACHE_REDIS_URL', '')

    # --- Пинг ---
    PING_INTERVAL_SEC = _env_int('PING_INTERVAL_SEC', 300)
    PING_TIMEOUT_SEC = _env_int('PING_TIMEOUT_SEC', 2)
    PING_MAX_WORKERS = _env_int('PING_MAX_WORKERS', 10)

    # --- Web Push ---
    VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
    VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
    VAPID_ADMIN_EMAIL = os.environ.get('VAPID_ADMIN_EMAIL', 'admin@example.com')

    # --- Папки ---
    UPLOAD_FOLDER_AVATARS = os.path.join(BASE_DIR, 'static', 'uploads', 'avatars')
    PRIVATE_UPLOADS = os.path.join(BASE_DIR, 'private_uploads')
    ATTACHMENTS_FOLDER = os.path.join(PRIVATE_UPLOADS, 'attachments')
    DOCUMENTS_FOLDER = os.path.join(PRIVATE_UPLOADS, 'documents')
    LOG_DIR = os.path.join(BASE_DIR, 'logs')


class DevelopmentConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    WTF_CSRF_ENABLED = True


class ProductionConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', True)


def get_config():
    """Возвращает конфиг по FLASK_ENV."""
    env = os.environ.get('FLASK_ENV', 'production').lower()
    if env == 'development':
        return DevelopmentConfig
    return ProductionConfig