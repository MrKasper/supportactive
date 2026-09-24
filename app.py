# app.py
"""
Support Active System — фабрика Flask-приложения.
Собирает конфиг, регистрирует расширения, blueprints, хуки.

Дополнительные модули:
  • app_extensions.py — сессии, Redis fallback, ping-планировщик
  • app_routes.py     — базовые маршруты
  • app_security.py   — CSP, обработчики ошибок, hooks
"""
import os

from flask import Flask

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
from logger import get_logger
log = get_logger(__name__)

# ---------- Расширения ----------
from extensions import csrf, limiter, cache

# ---------- БД и миграции ----------
from database import Database
from migrations import run_migrations

# ---------- Служебные модули ----------
from app_extensions import (
    init_sessions,
    start_ping_scheduler_if_needed,
)
from app_routes import register_base_routes
from app_security import (
    register_error_handlers,
    register_request_hooks,
    register_context_processors,
)


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
        'DRIVERS_FOLDER',
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
    init_sessions(app)

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

    # ---------- Одноразовая чистка ----------
    try:
        db.execute("""
            DELETE FROM notifications
            WHERE created_date < datetime('now', '-60 days')
        """)
        log.info('Очистка старых уведомлений (>60 дней) выполнена')
    except Exception as e:
        log.warning(f'Не удалось очистить уведомления: {e}')

    # ---------- Планировщик пинга ----------
    start_ping_scheduler_if_needed()

    # ---------- Blueprints ----------
    _register_blueprints(app)

    # ---------- Контекст-процессоры ----------
    register_context_processors(app)

    # ---------- Обработчики ошибок ----------
    register_error_handlers(app, log)

    # ---------- Хуки запроса ----------
    register_request_hooks(app, log)

    # ---------- Базовые маршруты ----------
    register_base_routes(app)

    # ---------- Информация ----------
    log.info(
        f'Кеш: {app.config["CACHE_TYPE"]}, '
        f'TTL: {app.config["CACHE_DEFAULT_TIMEOUT"]} сек'
    )
    log.info(f'Режим: {"DEBUG" if app.config.get("DEBUG") else "PRODUCTION"}')
    log.info(
        f'Порог медленных запросов: '
        f'{app.config.get("SLOW_REQUEST_MS", 1000)} мс'
    )

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
# РЕГИСТРАЦИЯ BLUEPRINTS
# ============================================================
def _register_blueprints(app):
    # ---------- Ядро ----------
    from login import auth_bp

    # ---------- Заявки ----------
    from tasks_list import tasks_list_bp
    from tasks_crud import tasks_crud_bp
    from tasks_bulk import tasks_bulk_bp

    # ---------- Пользователи ----------
    from users_crud import users_crud_bp
    from users_credentials import users_credentials_bp
    from users_import import users_import_bp

    # ---------- Разделы ----------
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

    # ---------- Публичные страницы для QR ----------
    from public_qr import public_qr_bp

    # ---------- Dev-консоль ----------
    from dev_db_info import dev_db_info_bp
    from dev_db_data import dev_db_data_bp
    from dev_db_query import dev_db_query_bp
    from dev_logs import dev_logs_bp
    from dev_system import dev_system_bp
    from dev_impersonate import dev_impersonate_bp
    from dev_files import dev_files_bp
    from dev_tests import dev_tests_bp
    from dev_slow import dev_slow_bp

    # ---------- Оборудование кабинета ----------
    from equipment_core import bp as equipment_core_bp
    from equipment_network import bp as equipment_network_bp
    from equipment_computers import bp as equipment_computers_bp
    from equipment_printers import bp as equipment_printers_bp
    from equipment_documents import bp as equipment_documents_bp

    all_blueprints = (
        # Ядро
        auth_bp,

        # Заявки
        tasks_list_bp,
        tasks_crud_bp,
        tasks_bulk_bp,

        # Пользователи
        users_crud_bp,
        users_credentials_bp,
        users_import_bp,

        # Разделы
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

        # QR
        public_qr_bp,

        # Dev-консоль
        dev_db_info_bp,
        dev_db_data_bp,
        dev_db_query_bp,
        dev_logs_bp,
        dev_system_bp,
        dev_impersonate_bp,
        dev_files_bp,
        dev_tests_bp,
        dev_slow_bp,

        # Оборудование кабинета
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
# ТОЧКА ЗАПУСКА
# ============================================================
if __name__ == '__main__':
    app = create_app()
    debug_mode = app.config.get('DEBUG', False)
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))

    log.info('=' * 60)
    log.info('Support Active System v3.0')
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