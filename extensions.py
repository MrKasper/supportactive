# extensions.py
"""
Flask-расширения: CSRF, Rate limit, Cache.
Инициализируются через init_app() в app.py.

⚠️ При импорте этого модуля выполняется проверка доступности Redis.
Если Redis указан в ENV, но недоступен — автоматический откат
на memory:// / SimpleCache. Это защищает от падения на первом запросе.
"""
import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from flask_caching import Cache

from logger import get_logger

log = get_logger(__name__)


# ============================================================
# ПРОВЕРКА REDIS
# ============================================================
def _redis_available(url, timeout=2):
    """
    Проверяет доступность Redis по URL.
    Возвращает True, если:
      • модуль redis установлен
      • удалось подключиться
      • сервер ответил на PING

    Никогда не бросает исключение — только True/False.
    """
    if not url:
        return False

    try:
        import redis
    except ImportError:
        log.warning(
            'Модуль redis не установлен. '
            'Установите: pip install redis — или откатитесь на '
            'SESSION_TYPE=filesystem, CACHE_TYPE=SimpleCache'
        )
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


# ============================================================
# CSRF
# ============================================================
csrf = CSRFProtect()


# ============================================================
# RATE LIMIT
# ============================================================
_ratelimit_url = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')

if _ratelimit_url.startswith('redis'):
    if _redis_available(_ratelimit_url):
        log.info(f'Rate limit: Redis ({_ratelimit_url})')
    else:
        log.warning(
            f'Redis недоступен для rate limit ({_ratelimit_url}). '
            f'Используем memory:// — данные не сохраняются между '
            f'перезапусками и не шарятся между воркерами.'
        )
        _ratelimit_url = 'memory://'
else:
    log.info(f'Rate limit: {_ratelimit_url}')

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_ratelimit_url,
)


# ============================================================
# CACHE
# ============================================================
_cache_type = os.environ.get('CACHE_TYPE', 'SimpleCache')
_cache_redis_url = os.environ.get('CACHE_REDIS_URL', '')

if _cache_type == 'RedisCache':
    if _redis_available(_cache_redis_url):
        log.info(f'Cache: RedisCache ({_cache_redis_url})')
    else:
        log.warning(
            f'Redis недоступен для кеша ({_cache_redis_url}). '
            f'Используем SimpleCache (в памяти).'
        )
        _cache_type = 'SimpleCache'
        _cache_redis_url = ''
else:
    log.info(f'Cache: {_cache_type}')

_cache_config = {
    'CACHE_TYPE': _cache_type,
    'CACHE_DEFAULT_TIMEOUT': int(
        os.environ.get('CACHE_DEFAULT_TIMEOUT', 300)
    ),
    'CACHE_NO_NULL_WARNING': True,
}
if _cache_redis_url:
    _cache_config['CACHE_REDIS_URL'] = _cache_redis_url

cache = Cache(config=_cache_config)


# ============================================================
# КЛЮЧИ КЕША
# ============================================================
class CacheKeys:
    API_CABINETS = 'api_cabinets'
    API_EXECUTORS = 'api_executors'
    FILTERS_DATA = 'filters_data'
    CARTRIDGES_STATS = 'cartridges_stats'
    CARTRIDGES_MONTHLY = 'cartridges_monthly_stats'
    DIRECTORY_CABINETS = 'directory_cabinets'
    DIRECTORY_PROBLEM_TYPES = 'directory_problem_types'


# ============================================================
# ИНВАЛИДАЦИЯ КЕША
# ============================================================
def _delete_keys(*keys):
    """Удаляет ключи, игнорируя ошибки."""
    for key in keys:
        try:
            cache.delete(key)
        except Exception as e:
            log.debug(f'cache.delete({key}) failed: {e}')


def invalidate_cabinet_caches():
    """Сбрасывает кеши, зависящие от кабинетов."""
    _delete_keys(
        CacheKeys.API_CABINETS,
        CacheKeys.DIRECTORY_CABINETS,
        CacheKeys.FILTERS_DATA,
    )


def invalidate_problem_type_caches():
    """Сбрасывает кеши, зависящие от типов проблем."""
    _delete_keys(
        CacheKeys.DIRECTORY_PROBLEM_TYPES,
        CacheKeys.FILTERS_DATA,
    )


def invalidate_executor_caches():
    """Сбрасывает кеш исполнителей."""
    _delete_keys(CacheKeys.API_EXECUTORS)


def invalidate_cartridge_caches():
    """Сбрасывает кеши картриджей."""
    _delete_keys(
        CacheKeys.CARTRIDGES_STATS,
        CacheKeys.CARTRIDGES_MONTHLY,
    )


def invalidate_all_caches():
    """Полный сброс кеша."""
    try:
        cache.clear()
    except Exception as e:
        log.warning(f'cache.clear() failed: {e}')