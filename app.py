# app.py
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_session import Session
from database import Database
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import os

# Подгружаем .env, если установлен python-dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Импортируем Blueprint
from login import auth_bp
from tasks import tasks_bp
from users import users_bp
from cartridges import cartridges_bp
from licenses import licenses_bp
from contacts import contacts_bp
from directory import directory_bp
from excel import excel_bp
from notifications import notifications_bp

# ---------- Базовые пути ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Создаем экземпляр Flask приложения
app = Flask(__name__)

# Регистрируем Blueprint
app.register_blueprint(auth_bp)
app.register_blueprint(tasks_bp)
app.register_blueprint(users_bp)
app.register_blueprint(cartridges_bp)
app.register_blueprint(licenses_bp)
app.register_blueprint(contacts_bp)
app.register_blueprint(directory_bp)
app.register_blueprint(excel_bp)
app.register_blueprint(notifications_bp)

# ---------- Конфигурация безопасности ----------
# SECRET_KEY берём из ENV. Если нет — генерируем и предупреждаем.
_secret = os.environ.get('SECRET_KEY')
if not _secret:
    _secret = os.urandom(32).hex()
    print("⚠️  SECRET_KEY не задан в ENV. Сгенерирован временный ключ.")
    print("    Задайте SECRET_KEY в .env — иначе сессии сбросятся при перезапуске.")
app.secret_key = _secret

# Защита cookie сессии
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_FILE_DIR'] = os.path.join(BASE_DIR, 'flask_session')
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_KEY_PREFIX'] = 'support_active_'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# Secure=True только по HTTPS (включается через ENV на проде)
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Лимит размера загрузки (5 МБ)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024

# ---------- Загрузка аватаров ----------
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads', 'avatars')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_MIME_PREFIX = 'image/'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Инициализация сессий
os.makedirs(app.config['SESSION_FILE_DIR'], exist_ok=True)
Session(app)


def allowed_file(filename):
    """Проверка допустимого расширения файла."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ---------- Инициализация БД ----------
db = Database()
db.init_db()

users_count = db.query('SELECT COUNT(*) as count FROM users', one=True)['count']
if users_count == 0:
    print("База данных пуста. Добавление тестовых данных...")
    db.insert_test_data()


# ============= ДЕКОРАТОР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ =============
# Импортируем из общего модуля (устранили дублирование)
from utils import login_required


# ============= МАРШРУТЫ СТРАНИЦ =============

@app.route('/')
def index():
    """Главная страница приложения."""
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    return render_template('index.html')


# ============= API ДЛЯ ПОЛУЧЕНИЯ ДАННЫХ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ =============

@app.route('/api/current_user')
@login_required
def get_current_user():
    """Получение данных текущего пользователя."""
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
        return jsonify({'error': f'Ошибка получения данных: {str(e)}'}), 500


# ============= API ДЛЯ ЗАГРУЗКИ АВАТАРА =============

@app.route('/api/upload_avatar', methods=['POST'])
@login_required
def upload_avatar():
    """Загрузка аватара пользователя."""
    try:
        if 'avatar_file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400

        file = request.files['avatar_file']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        if not file or not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Недопустимый формат файла'}), 400

        # Дополнительная проверка MIME (грубая, но отсекает явные не-картинки)
        if not (file.mimetype or '').startswith(ALLOWED_MIME_PREFIX):
            return jsonify({'success': False, 'error': 'Файл не является изображением'}), 400

        user_id = session.get('user_id')
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f'user_{user_id}_{datetime.now().strftime("%Y%m%d%H%M%S")}.{ext}'
        filename = secure_filename(filename)

        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        avatar_path = f'static/uploads/avatars/{filename}'

        return jsonify({'success': True, 'avatar_path': avatar_path})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка загрузки: {str(e)}'}), 500


# ============= API ДЛЯ КАБИНЕТОВ =============

@app.route('/api/cabinets')
@login_required
def get_cabinets():
    """Получение списка всех кабинетов."""
    try:
        cabinets = db.query('''
            SELECT id, cabinet_number, floor, building, description, responsible_person, phone
            FROM cabinets
            WHERE is_active = 1
            ORDER BY cabinet_number
        ''')
        return jsonify([dict(cabinet) for cabinet in cabinets])
    except Exception as e:
        return jsonify({'error': f'Ошибка получения кабинетов: {str(e)}'}), 500


@app.route('/api/cabinets/search')
@login_required
def search_cabinets():
    """Поиск кабинетов по номеру или описанию."""
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
        return jsonify([dict(cabinet) for cabinet in cabinets])
    except Exception as e:
        return jsonify({'error': f'Ошибка поиска кабинетов: {str(e)}'}), 500


# ============= API ДЛЯ ИСПОЛНИТЕЛЕЙ =============

@app.route('/api/executors')
@login_required
def get_executors():
    """Получение списка исполнителей (Техники и Администраторы)."""
    try:
        executors = db.query('''
            SELECT id, full_name, role, department
            FROM users
            WHERE is_active = 1
            AND role IN ('Администратор', 'Техник')
            ORDER BY full_name
        ''')
        return jsonify([dict(executor) for executor in executors])
    except Exception as e:
        return jsonify({'error': f'Ошибка получения исполнителей: {str(e)}'}), 500


# ============= ОБРАБОТКА ОШИБОК =============

@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Ресурс не найден'}), 404
    return render_template('404.html'), 404


@app.errorhandler(413)
def too_large_error(error):
    """Файл слишком большой."""
    if request.path.startswith('/api/'):
        return jsonify({'success': False, 'error': 'Файл слишком большой (макс. 5 МБ)'}), 413
    return jsonify({'error': 'Файл слишком большой'}), 413


@app.errorhandler(500)
def internal_error(error):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
    return render_template('500.html'), 500


# ============= ЗАПУСК ПРИЛОЖЕНИЯ =============

if __name__ == '__main__':
    print("=" * 50)
    print("Support Active System v1.3")
    print("=" * 50)
    print("Сервер запущен по адресу: http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)