# app.py
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, g
from flask_session import Session
from flask_wtf.csrf import CSRFError, generate_csrf
from database import Database
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import os

# ---------- .env ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, '.env')
try:
    from dotenv import load_dotenv
    if os.path.exists(ENV_PATH):
        load_dotenv(ENV_PATH, override=True)
except ImportError:
    pass

# ---------- Логирование ----------
from logger import setup_logging, get_logger
setup_logging()
log = get_logger(__name__)

# ---------- Миграции ----------
from migrations import run_migrations

# ---------- Расширения ----------
from extensions import csrf, limiter, cache

# ---------- Blueprints ----------
from login import auth_bp
from tasks import tasks_bp
from users import users_bp
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
from equipment import equipment_bp, start_ping_scheduler

app = Flask(__name__)

# ---------- Регистрация Blueprint ----------
app.register_blueprint(auth_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(users_bp)
app.register_blueprint(cartridges_bp)
app.register_blueprint(licenses_bp)
app.register_blueprint(contacts_bp)
app.register_blueprint(directory_bp)
app.register_blueprint(excel_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(webpush_bp)
app.register_blueprint(audit_bp)
app.register_blueprint(attachments_bp)
app.register_blueprint(comments_bp)
app.register_blueprint(equipment_bp)


# ---------- Секретный ключ ----------
_secret = os.environ.get('SECRET_KEY')
if not _secret:
    _secret = os.urandom(32).hex()
    log.warning('⚠️ SECRET_KEY не задан в .env. Сгенерирован временный ключ.')
app.secret_key = _secret


# ---------- Сессии ----------
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(BASE_DIR, 'flask_session')
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_KEY_PREFIX'] = 'support_active_'
app.config['SESSION_FILE_THRESHOLD'] = 500
app.config['SESSION_COOKIE_NAME'] = 'support_active_session'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_PATH'] = '/'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# ---------- Лимит загрузки ----------
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024

# ---------- CSRF ----------
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_TIME_LIMIT'] = None
app.config['WTF_CSRF_HEADERS'] = ['X-CSRFToken', 'X-CSRF-Token']
csrf.init_app(app)

# ---------- Rate Limiting ----------
app.config['RATELIMIT_STORAGE_URI'] = 'memory://'
app.config['RATELIMIT_HEADERS_ENABLED'] = True
app.config['RATELIMIT_DEFAULT'] = '1000 per hour;200 per minute'
limiter.init_app(app)

# ---------- 🆕 Кеширование ----------
# TTL из ENV или 300 сек по умолчанию
_default_cache_timeout = int(os.environ.get('CACHE_DEFAULT_TIMEOUT', 300))

app.config['CACHE_TYPE'] = os.environ.get('CACHE_TYPE', 'SimpleCache')
app.config['CACHE_DEFAULT_TIMEOUT'] = _default_cache_timeout
app.config['CACHE_NO_NULL_WARNING'] = True  # убираем предупреждение про NullCache

cache.init_app(app)
log.info(f'Кеш: {app.config["CACHE_TYPE"]}, TTL по умолчанию: {_default_cache_timeout} сек')


# ---------- Папки ----------
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads', 'avatars')
ALLOWED_AVATAR_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)
Session(app)


def allowed_avatar(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_AVATAR_EXT


# ---------- БД + миграции ----------
db = Database()
log.info('Применяем миграции БД...')
run_migrations(db.db_name)

users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
if users_count == 0:
    log.info('База пуста. Добавляем тестовые данные...')
    db.insert_test_data()

# ---------- Планировщик пинга ----------
try:
    start_ping_scheduler()
except Exception as _ping_err:
    log.warning(f'Не удалось запустить планировщик пинга: {_ping_err}')


# ---------- CSRF-токен в шаблоны ----------
@app.context_processor
def inject_csrf_token():
    return dict(csrf_token=generate_csrf)


# ---------- Обработчики ошибок ----------
@app.errorhandler(CSRFError)
def handle_csrf_error(e):
    log.warning(f'CSRF-ошибка: {e.description} | IP={request.remote_addr} | path={request.path}')
    if request.path.startswith('/api/'):
        return jsonify({'error': 'CSRF-токен отсутствует или недействителен'}), 400
    return render_template('500.html'), 400


@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Ресурс не найден'}), 404
    return render_template('404.html'), 404


@app.errorhandler(413)
def too_large_error(error):
    log.warning(f'Файл слишком большой: {request.path} IP={request.remote_addr}')
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'Файл слишком большой (макс. 20 МБ)'}), 413
    return jsonify({'error': 'Файл слишком большой'}), 413


@app.errorhandler(429)
def ratelimit_handler(e):
    log.warning(f'Rate limit: {request.path} IP={request.remote_addr}')
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Слишком много запросов. Попробуйте позже.'}), 429
    return 'Too many requests', 429


@app.errorhandler(500)
def internal_error(error):
    log.exception(f'Internal server error на {request.path}')
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
    return render_template('500.html'), 500


# ---------- Логирование + заголовки безопасности ----------
@app.before_request
def log_request_start():
    g.request_start = datetime.now()


@app.after_request
def log_response(response):
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    if request.path.startswith('/static/'):
        return response

    try:
        duration = (datetime.now() - g.request_start).total_seconds() * 1000
    except Exception:
        duration = 0

    level = 'INFO'
    if response.status_code >= 500:
        level = 'ERROR'
    elif response.status_code >= 400:
        level = 'WARNING'

    log.log(
        getattr(__import__('logging'), level),
        f'{request.method} {request.path} -> {response.status_code} '
        f'({duration:.0f}ms) IP={request.remote_addr}'
    )
    return response


from utils import login_required, role_required


# ============================================================
# МАРШРУТЫ СТРАНИЦ
# ============================================================

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    return render_template('index.html')


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
            'login_time': session.get('login_time')
        })
    except Exception as e:
        log.exception('Ошибка в get_current_user')
        return jsonify({'error': f'Ошибка получения данных: {str(e)}'}), 500


@app.route('/api/upload_avatar', methods=['POST'])
@login_required
def upload_avatar():
    try:
        if 'avatar_file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        file = request.files['avatar_file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        if not file or not allowed_avatar(file.filename):
            return jsonify({'success': False, 'error': 'Недопустимый формат'}), 400
        if not (file.mimetype or '').startswith('image/'):
            return jsonify({'success': False, 'error': 'Не изображение'}), 400

        user_id = session.get('user_id')
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename(f'user_{user_id}_{datetime.now().strftime("%Y%m%d%H%M%S")}.{ext}')
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        log.info(f'Загружен аватар: {filename} | user_id={user_id}')
        return jsonify({'success': True, 'avatar_path': f'static/uploads/avatars/{filename}'})
    except Exception as e:
        log.exception('Ошибка загрузки аватара')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# API КАБИНЕТОВ (кешируется)
# ============================================================

@app.route('/api/cabinets')
@login_required
@cache.cached(timeout=300, key_prefix='api_cabinets')
def get_cabinets():
    try:
        cabinets = db.query('''
            SELECT id, cabinet_number, floor, building, description, responsible_person, phone
            FROM cabinets WHERE is_active = 1 ORDER BY cabinet_number
        ''')
        return jsonify([dict(c) for c in cabinets])
    except Exception as e:
        log.exception('Ошибка получения кабинетов')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


@app.route('/api/cabinets/search')
@login_required
def search_cabinets():
    """Поиск не кешируется — параметры динамические."""
    try:
        query = request.args.get('q', '')
        if not query:
            cabinets = db.query('SELECT * FROM cabinets WHERE is_active = 1 ORDER BY cabinet_number')
        else:
            cabinets = db.query('''
                SELECT * FROM cabinets
                WHERE is_active = 1
                AND (cabinet_number LIKE ? OR description LIKE ? OR floor LIKE ? OR building LIKE ?)
                ORDER BY cabinet_number
            ''', [f'%{query}%', f'%{query}%', f'%{query}%', f'%{query}%'])
        return jsonify([dict(c) for c in cabinets])
    except Exception as e:
        log.exception('Ошибка поиска кабинетов')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# API ИСПОЛНИТЕЛЕЙ (кешируется)
# ============================================================

@app.route('/api/executors')
@login_required
@cache.cached(timeout=60, key_prefix='api_executors')
def get_executors():
    try:
        executors = db.query('''
            SELECT id, full_name, role, department FROM users
            WHERE is_active = 1 AND role IN ('Администратор', 'Техник')
              AND deleted_at IS NULL
            ORDER BY full_name
        ''')
        return jsonify([dict(e) for e in executors])
    except Exception as e:
        log.exception('Ошибка получения исполнителей')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    log.info('=' * 60)
    log.info('Support Active System v2.2')
    log.info(f'Режим: {"DEBUG" if debug_mode else "PRODUCTION"}')
    log.info('Сервер запущен: http://localhost:5000')
    log.info('=' * 60)
    app.run(debug=debug_mode, host='0.0.0.0', port=5000, use_reloader=debug_mode)