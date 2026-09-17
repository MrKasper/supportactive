# app.py
"""
Support Active System — точка создания Flask-приложения.
Фабричный паттерн: create_app(config).

Graceful fallback:
  • Если Redis указан в ENV, но недоступен — сессии переключаются
    на filesystem, кеш и rate limit — на memory.
  • Это защищает от падения на первом запросе при недоступном Redis.
"""
from flask import (
    Flask, render_template, request, jsonify,
    session, redirect, url_for, g,
)
from flask_session import Session
from flask_wtf.csrf import CSRFError, generate_csrf
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import os
import secrets
import logging as _logging

# ---------- .env ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')
try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH, override=True)
except ImportError:
    pass

# ---------- Конфиг ----------
from config import get_config

# ---------- Логирование ----------
from logger import setup_logging, get_logger
setup_logging()
log = get_logger(__name__)

# ---------- Расширения ----------
# ⚠️ При импорте extensions.py происходит проверка Redis
# и, при необходимости, автоматический откат на memory:// / SimpleCache
from extensions import csrf, limiter, cache

# ---------- БД и миграции ----------
from database import Database
from migrations import run_migrations

# ---------- Утилиты ----------
from utils import login_required


# ============================================================
# CSP
# ============================================================
CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' "
        "https://code.jquery.com "
        "https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' "
        "https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "media-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
]


# ============================================================
# ПРОВЕРКА REDIS
# ============================================================
def _redis_available(url, timeout=2):
    """Проверяет доступность Redis. Никогда не бросает исключение."""
    if not url:
        return False

    try:
        import redis
    except ImportError:
        log.warning('Модуль redis не установлен — pip install redis')
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
# ФАБРИКА ПРИЛОЖЕНИЯ
# ============================================================
def create_app(config_class=None):
    """Создаёт и настраивает Flask-приложение."""
    app = Flask(__name__)

    # ---------- Конфигурация ----------
    if config_class is None:
        config_class = get_config()

    for key in dir(config_class):
        if key.isupper():
            app.config[key] = getattr(config_class, key)

    # ---------- SECRET_KEY ----------
    if not app.config.get('SECRET_KEY'):
        app.config['SECRET_KEY'] = os.urandom(32).hex()
        log.warning(
            '⚠️ SECRET_KEY не задан в .env. Сгенерирован временный ключ. '
            'ВСЕ СЕССИИ БУДУТ СБРОШЕНЫ ПРИ ПЕРЕЗАПУСКЕ!'
        )

    # ---------- Папки ----------
    for folder_key in (
        'SESSION_FILE_DIR',
        'UPLOAD_FOLDER_AVATARS',
        'ATTACHMENTS_FOLDER',
        'DOCUMENTS_FOLDER',
        'LOG_DIR',
    ):
        path = app.config.get(folder_key)
        if path:
            try:
                os.makedirs(path, exist_ok=True)
            except OSError as e:
                log.warning(f'Не удалось создать папку {path}: {e}')

    # ---------- Расширения ----------
    csrf.init_app(app)
    limiter.init_app(app)
    cache.init_app(app)

    # ---------- Сессии ----------
    _init_sessions(app)

    # ---------- БД + миграции ----------
    db = Database(app.config['DB_PATH'])
    log.info(f'База данных: {db.db_name}')
    log.info('Применяем миграции...')
    run_migrations(db.db_name)

    # ---------- Тестовые данные ----------
    try:
        users_count = db.query(
            'SELECT COUNT(*) AS count FROM users', one=True
        )['count']
        if users_count == 0:
            log.info('База пуста. Добавляем тестовые данные...')
            db.insert_test_data()
    except Exception as e:
        log.warning(f'Не удалось проверить/добавить тестовые данные: {e}')

    # ---------- Одноразовая чистка старых уведомлений ----------
    try:
        db.execute("""
            DELETE FROM notifications
            WHERE created_date < datetime('now', '-60 days')
        """)
        log.info('Очистка старых уведомлений (>60 дней) выполнена')
    except Exception as e:
        log.warning(f'Не удалось очистить уведомления: {e}')

    # ---------- Планировщик пинга ----------
    _start_ping_scheduler_if_needed()

    # ---------- Blueprints ----------
    _register_blueprints(app)

    # ---------- Контекст-процессоры ----------
    _register_context_processors(app)

    # ---------- Обработчики ошибок ----------
    _register_error_handlers(app)

    # ---------- Хуки запроса ----------
    _register_request_hooks(app)

    # ---------- Базовые маршруты ----------
    _register_base_routes(app)

    # ---------- Информация ----------
    log.info(
        f'Кеш: {app.config["CACHE_TYPE"]}, '
        f'TTL: {app.config["CACHE_DEFAULT_TIMEOUT"]} сек'
    )
    log.info(f'Режим: {"DEBUG" if app.config.get("DEBUG") else "PRODUCTION"}')

    # DEBUG: список QR-роутов
    qr_routes = [
        rule for rule in app.url_map.iter_rules()
        if '/qr/' in rule.rule
    ]
    if qr_routes:
        for rule in sorted(qr_routes, key=lambda r: r.rule):
            log.info(f'QR-роут: {rule.rule} → {rule.endpoint}')
    else:
        log.warning('⚠️ QR-роуты не зарегистрированы!')

    return app


# ============================================================
# ИНИЦИАЛИЗАЦИЯ СЕССИЙ
# ============================================================
def _init_sessions(app):
    """Инициализирует Flask-Session с Redis или fallback на filesystem."""
    session_type = app.config.get('SESSION_TYPE', 'filesystem')
    session_redis = app.config.get('SESSION_REDIS', '')

    if session_type == 'redis' and session_redis:
        if _redis_available(session_redis):
            try:
                Session(app)
                log.info(f'Сессии: Redis ({session_redis})')
                return
            except Exception as e:
                log.warning(
                    f'Не удалось инициализировать Redis-сессии: {e}. '
                    f'Откат на filesystem.'
                )
        else:
            log.warning(
                f'Redis недоступен по адресу {session_redis} — '
                f'откат на файловые сессии.'
            )

        app.config['SESSION_TYPE'] = 'filesystem'
        app.config['SESSION_REDIS'] = ''

    Session(app)
    log.info(f'Сессии: {app.config["SESSION_TYPE"]}')


# ============================================================
# ПЛАНИРОВЩИК ПИНГА
# ============================================================
def _start_ping_scheduler_if_needed():
    """
    Запускает встроенный планировщик пинга, если он не отключён.
    В продакшене используйте отдельный ping_worker.py
    и DISABLE_PING_SCHEDULER=true.
    """
    if os.environ.get('DISABLE_PING_SCHEDULER', 'false').lower() == 'true':
        log.info('Планировщик пинга отключён (DISABLE_PING_SCHEDULER=true)')
        return

    try:
        from services.ping import start_ping_scheduler
        start_ping_scheduler()
    except Exception as e:
        log.warning(f'Планировщик пинга не запущен: {e}')


# ============================================================
# РЕГИСТРАЦИЯ BLUEPRINTS
# ============================================================
def _register_blueprints(app):
    # Ядро
    from login import auth_bp
    from tasks import tasks_bp
    from users import users_bp

    # Разделы
    from cartridges import cartridges_bp
    from licenses import licenses_bp
    from contacts import contacts_bp
    from directory import directory_bp
    from excel import excel_bp
    from notifications import notifications_bp
    from webpush import webpush_bp
    from audit import audit_bp
    from attachments import attachments_bp
    from comments import comments_bp
    from dashboard import dashboard_bp

    # Публичные страницы для QR
    from public_qr import public_qr_bp

    # Оборудование кабинета
    from equipment_core import bp as equipment_core_bp
    from equipment_network import bp as equipment_network_bp
    from equipment_computers import bp as equipment_computers_bp
    from equipment_printers import bp as equipment_printers_bp
    from equipment_documents import bp as equipment_documents_bp

    all_blueprints = (
        auth_bp,
        tasks_bp,
        users_bp,
        cartridges_bp,
        licenses_bp,
        contacts_bp,
        directory_bp,
        excel_bp,
        notifications_bp,
        webpush_bp,
        audit_bp,
        attachments_bp,
        comments_bp,
        dashboard_bp,
        public_qr_bp,
        equipment_core_bp,
        equipment_network_bp,
        equipment_computers_bp,
        equipment_printers_bp,
        equipment_documents_bp,
    )

    for bp in all_blueprints:
        app.register_blueprint(bp)

    log.info(f'Зарегистрировано blueprint-ов: {len(app.blueprints)}')


# ============================================================
# КОНТЕКСТ-ПРОЦЕССОРЫ
# ============================================================
def _register_context_processors(app):

    @app.context_processor
    def inject_csrf_token():
        return dict(csrf_token=generate_csrf)

    @app.context_processor
    def inject_csp_nonce():
        if not hasattr(g, 'csp_nonce'):
            g.csp_nonce = secrets.token_urlsafe(16)
        return dict(csp_nonce=g.csp_nonce)

    @app.context_processor
    def inject_app_config():
        return dict(
            ENABLE_SSE=app.config.get('ENABLE_SSE', True),
            APP_VERSION='2.7',
        )


# ============================================================
# ОБРАБОТЧИКИ ОШИБОК
# ============================================================
def _register_error_handlers(app):

    def _is_api():
        return request.path.startswith('/api/')

    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        log.warning(
            f'CSRF: {e.description} | '
            f'IP={request.remote_addr} | {request.path}'
        )
        if _is_api():
            return jsonify({
                'error': 'CSRF-токен отсутствует или недействителен',
            }), 400
        return render_template('500.html'), 400

    @app.errorhandler(404)
    def not_found_error(error):
        if _is_api():
            return jsonify({'error': 'Ресурс не найден'}), 404
        return render_template('404.html'), 404

    @app.errorhandler(413)
    def too_large_error(error):
        log.warning(
            f'Файл слишком большой: {request.path} IP={request.remote_addr}'
        )
        if _is_api():
            return jsonify({
                'success': False,
                'error': 'Файл слишком большой (макс. 20 МБ)',
            }), 413
        return jsonify({'error': 'Файл слишком большой'}), 413

    @app.errorhandler(429)
    def ratelimit_handler(e):
        log.warning(f'Rate limit: {request.path} IP={request.remote_addr}')
        if _is_api():
            return jsonify({
                'error': 'Слишком много запросов. Попробуйте позже.',
            }), 429
        return 'Too many requests', 429

    @app.errorhandler(500)
    def internal_error(error):
        log.exception(f'Internal server error на {request.path}')
        if _is_api():
            return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
        return render_template('500.html'), 500


# ============================================================
# ХУКИ ЗАПРОСА
# ============================================================
def _register_request_hooks(app):

    @app.before_request
    def log_request_start():
        g.request_start = datetime.now()

    @app.after_request
    def security_headers_and_log(response):
        # ---------- Заголовки безопасности ----------
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = (
            'geolocation=(), microphone=(), camera=(), payment=()'
        )
        response.headers['Content-Security-Policy'] = '; '.join(CSP_DIRECTIVES)

        # ---------- Логирование ----------
        if request.path.startswith('/static/'):
            return response
        if request.path == '/api/notifications/stream':
            return response  # не логируем SSE-поток

        try:
            duration = (
                datetime.now() - g.request_start
            ).total_seconds() * 1000
        except Exception:
            duration = 0

        if response.status_code >= 500:
            level = 'ERROR'
        elif response.status_code >= 400:
            level = 'WARNING'
        else:
            level = 'INFO'

        log.log(
            getattr(_logging, level),
            f'{request.method} {request.path} -> {response.status_code} '
            f'({duration:.0f}ms) IP={request.remote_addr}',
        )
        return response


# ============================================================
# БАЗОВЫЕ МАРШРУТЫ
# ============================================================
def _register_base_routes(app):

    # ---------- Главная ----------
    @app.route('/')
    def index():
        if 'user_id' not in session:
            return redirect(url_for('auth.login'))
        return render_template('index.html')

    # ---------- Health ----------
    @app.route('/health')
    def health():
        return jsonify({
            'status': 'ok',
            'version': '2.7',
            'session_type': app.config.get('SESSION_TYPE', 'filesystem'),
            'cache_type': app.config.get('CACHE_TYPE'),
            'timestamp': datetime.now().isoformat(),
        }), 200

    # ---------- Текущий пользователь ----------
    @app.route('/api/current_user')
    @login_required
    def get_current_user():
        try:
            return jsonify({
                'id': session.get('user_id'),
                'full_name': session.get('user_name'),
                'role': session.get('user_role'),
                'avatar': session.get('user_avatar'),
                'email': session.get('user_email', ''),
                'phone': session.get('user_phone', ''),
                'department': session.get('user_department', ''),
                'login': session.get('user_login', ''),
                'login_time': session.get('login_time'),
            })
        except Exception as e:
            log.exception('Ошибка в get_current_user')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    # ---------- Загрузка аватара ----------
    @app.route('/api/upload_avatar', methods=['POST'])
    @login_required
    def upload_avatar():
        from constants import ALLOWED_AVATAR_EXT
        from validators import validate_file_extension

        try:
            if 'avatar_file' not in request.files:
                return jsonify({
                    'success': False,
                    'error': 'Файл не найден',
                }), 400

            file = request.files['avatar_file']
            if not file or not file.filename:
                return jsonify({
                    'success': False,
                    'error': 'Файл не выбран',
                }), 400

            ok, err = validate_file_extension(
                file.filename, ALLOWED_AVATAR_EXT
            )
            if not ok:
                return jsonify({'success': False, 'error': err}), 400

            if not (file.mimetype or '').startswith('image/'):
                return jsonify({
                    'success': False,
                    'error': 'Не изображение',
                }), 400

            user_id = session.get('user_id')
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = secure_filename(
                f'user_{user_id}_'
                f'{datetime.now().strftime("%Y%m%d%H%M%S")}.{ext}'
            )
            filepath = os.path.join(
                app.config['UPLOAD_FOLDER_AVATARS'], filename
            )
            file.save(filepath)

            log.info(f'Загружен аватар: {filename} | user_id={user_id}')
            return jsonify({
                'success': True,
                'avatar_path': f'static/uploads/avatars/{filename}',
            })
        except Exception as e:
            log.exception('Ошибка загрузки аватара')
            return jsonify({
                'success': False,
                'error': f'Ошибка: {str(e)}',
            }), 500

    # ---------- Кабинеты (кешируется) ----------
    @app.route('/api/cabinets')
    @login_required
    @cache.cached(timeout=300, key_prefix='api_cabinets')
    def get_cabinets():
        from database import Database
        db = Database(app.config['DB_PATH'])
        try:
            cabinets = db.query('''
                SELECT id, cabinet_number, floor, building, description,
                       responsible_person, phone
                FROM cabinets WHERE is_active = 1
                ORDER BY cabinet_number
            ''')
            return jsonify([dict(c) for c in cabinets])
        except Exception as e:
            log.exception('Ошибка получения кабинетов')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    # ---------- Поиск кабинетов ----------
    @app.route('/api/cabinets/search')
    @login_required
    def search_cabinets():
        from database import Database
        db = Database(app.config['DB_PATH'])
        try:
            query = request.args.get('q', '').strip()
            if not query:
                rows = db.query(
                    'SELECT * FROM cabinets WHERE is_active = 1 '
                    'ORDER BY cabinet_number'
                )
            else:
                like = f'%{query}%'
                rows = db.query('''
                    SELECT * FROM cabinets
                    WHERE is_active = 1
                      AND (cabinet_number LIKE ? OR description LIKE ?
                           OR floor LIKE ? OR building LIKE ?)
                    ORDER BY cabinet_number
                ''', [like, like, like, like])
            return jsonify([dict(c) for c in rows])
        except Exception as e:
            log.exception('Ошибка поиска кабинетов')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    # ---------- Исполнители (кешируется) ----------
    @app.route('/api/executors')
    @login_required
    @cache.cached(timeout=60, key_prefix='api_executors')
    def get_executors():
        from database import Database
        from constants import ROLE_ADMIN, ROLE_TECH
        db = Database(app.config['DB_PATH'])
        try:
            rows = db.query('''
                SELECT id, full_name, role, department FROM users
                WHERE is_active = 1
                  AND role IN (?, ?)
                  AND deleted_at IS NULL
                ORDER BY full_name
            ''', [ROLE_ADMIN, ROLE_TECH])
            return jsonify([dict(e) for e in rows])
        except Exception as e:
            log.exception('Ошибка получения исполнителей')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ТОЧКА ЗАПУСКА
# ============================================================
if __name__ == '__main__':
    app = create_app()
    debug_mode = app.config.get('DEBUG', False)
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))

    log.info('=' * 60)
    log.info('Support Active System v2.7')
    log.info(f'Режим: {"DEBUG" if debug_mode else "PRODUCTION"}')
    log.info(f'Сервер: http://{host}:{port}')
    log.info(f'Сессии: {app.config.get("SESSION_TYPE", "filesystem")}')
    log.info(f'Кеш: {app.config.get("CACHE_TYPE", "SimpleCache")}')
    log.info('=' * 60)

    app.run(
        debug=debug_mode,
        host=host,
        port=port,
        use_reloader=debug_mode,
        threaded=True,
    )