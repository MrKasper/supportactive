# extensions.py
"""
Инициализация расширений Flask.
Вынесено отдельно, чтобы избежать циклических импортов.
"""
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect
from flask_caching import Cache

# CSRF
csrf = CSRFProtect()

# Rate limiting
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri='memory://'
)

# Кеш
cache = Cache(config={
    'CACHE_TYPE': os.environ.get('CACHE_TYPE', 'SimpleCache'),
    'CACHE_DEFAULT_TIMEOUT': int(os.environ.get('CACHE_DEFAULT_TIMEOUT', 300)),
})