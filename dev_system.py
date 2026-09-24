# dev_system.py
"""
Dev-консоль: системная информация и очистка кеша.
"""
import os
import platform
import sys

from flask import Blueprint, jsonify, session, current_app

from database import Database
from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER
from dev_helpers import BASE_DIR, LOG_DIR, BACKUP_DIR

log = get_logger(__name__)
db = Database()

dev_system_bp = Blueprint('dev_system', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


@dev_system_bp.route('/api/dev/system-info')
@role_required(*DEV_ROLES)
def system_info():
    try:
        packages = []
        try:
            from importlib.metadata import distributions
            for dist in distributions():
                name = dist.metadata['Name']
                if name and name.lower() in (
                    'flask', 'werkzeug', 'flask-session', 'flask-wtf',
                    'flask-limiter', 'flask-caching', 'jinja2',
                    'python-dotenv', 'openpyxl', 'pywebpush', 'py-vapid',
                    'cryptography', 'gunicorn', 'redis', 'puremagic',
                    'qrcode', 'weasyprint',
                ):
                    packages.append({
                        'name': name,
                        'version': dist.version,
                    })
        except Exception:
            pass

        packages.sort(key=lambda x: x['name'].lower())

        safe_env_keys = (
            'FLASK_ENV', 'FLASK_DEBUG', 'SESSION_TYPE', 'CACHE_TYPE',
            'RATELIMIT_STORAGE_URI', 'DISABLE_PING_SCHEDULER',
            'PING_INTERVAL_SEC', 'ENABLE_SSE',
        )
        env_values = {
            k: os.environ.get(k, '—') for k in safe_env_keys
        }

        return jsonify({
            'python': {
                'version': sys.version.split()[0],
                'executable': sys.executable,
                'platform': platform.platform(),
            },
            'flask': {
                'version': __import__('flask').__version__,
                'debug': current_app.config.get('DEBUG', False),
                'session_type': current_app.config.get('SESSION_TYPE'),
                'cache_type': current_app.config.get('CACHE_TYPE'),
            },
            'packages': packages,
            'env': env_values,
            'paths': {
                'base_dir': BASE_DIR,
                'db_path': db.db_name,
                'logs_dir': LOG_DIR,
                'backups_dir': BACKUP_DIR,
            },
        })
    except Exception as e:
        log.exception('system_info error')
        return jsonify({'error': str(e)}), 500


@dev_system_bp.route('/api/dev/cache/clear', methods=['POST'])
@role_required(*DEV_ROLES)
def cache_clear():
    try:
        from extensions import cache
        try:
            cache.clear()
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'cache.clear() failed: {e}',
            }), 500

        try:
            from audit import log_action
            log_action('clear', 'cache', None, {'action': 'dev_clear'})
        except Exception:
            pass

        log.info(f'[{session.get("user_login")}] Кеш очищен')
        return jsonify({'success': True, 'message': 'Кеш очищен'})
    except Exception as e:
        log.exception('cache_clear error')
        return jsonify({'success': False, 'error': str(e)}), 500