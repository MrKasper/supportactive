# users.py
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import Database
from datetime import datetime

# Создаем Blueprint для пользователей
users_bp = Blueprint('users', __name__)

# Инициализация базы данных
db = Database()


# ============= ДЕКОРАТОР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ =============
def login_required(f):
    """Декоратор для проверки авторизации пользователя"""
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Необходима авторизация'}), 401
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function


# ============= API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ =============

@users_bp.route('/api/users')
@login_required
def get_users():
    """Получение списка всех пользователей"""
    try:
        users = db.query('''
            SELECT id, full_name, role, avatar, email, phone, department, login, is_active 
            FROM users 
            ORDER BY full_name
        ''')
        return jsonify([dict(user) for user in users])

    except Exception as e:
        return jsonify({'error': f'Ошибка получения пользователей: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>')
@login_required
def get_user(user_id):
    """Получение информации о конкретном пользователе"""
    try:
        user = db.query('SELECT * FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        # Получаем статистику пользователя
        user_stats = db.query('''
            SELECT 
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'Выполнено' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('Новое', 'В работе') THEN 1 ELSE 0 END) as active
            FROM tasks 
            WHERE executor = ?
        ''', [user['full_name']], one=True)

        user_dict = dict(user)
        # Убираем пароль из ответа для безопасности
        if 'password' in user_dict:
            del user_dict['password']
        user_dict['statistics'] = dict(user_stats) if user_stats else {}

        return jsonify(user_dict)

    except Exception as e:
        return jsonify({'error': f'Ошибка получения пользователя: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    """Обновление данных пользователя"""
    try:
        # Проверяем, что пользователь редактирует только свой профиль или является админом
        if session.get('user_id') != user_id and session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав для редактирования'}), 403

        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных для обновления'}), 400

        # Проверяем существование пользователя
        user = db.query('SELECT * FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        # Обновляем данные
        db.execute('''
            UPDATE users 
            SET full_name = ?, role = ?, avatar = ?, email = ?, phone = ?, department = ?, 
                login = ?, password = ?, is_active = ?
            WHERE id = ?
        ''', [
            data.get('full_name', user['full_name']),
            data.get('role', user['role']),
            data.get('avatar', user['avatar']),
            data.get('email', user['email']),
            data.get('phone', user['phone']),
            data.get('department', user['department']),
            data.get('login', user['login']),
            data.get('password', user['password']),
            data.get('is_active', user['is_active']),
            user_id
        ])

        # Обновляем данные в сессии, если пользователь редактирует свой профиль
        if session.get('user_id') == user_id:
            session['user_name'] = data.get('full_name', user['full_name'])
            session['user_role'] = data.get('role', user['role'])
            session['user_avatar'] = data.get('avatar', user['avatar'])
            session['user_email'] = data.get('email', user['email'])
            session['user_phone'] = data.get('phone', user['phone'])
            session['user_department'] = data.get('department', user['department'])
            session['user_login'] = data.get('login', user['login'])

        return jsonify({
            'success': True,
            'message': 'Профиль успешно обновлен'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления профиля: {str(e)}'}), 500


@users_bp.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Создание нового пользователя (только для администраторов)"""
    try:
        # Проверяем права
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав для создания пользователя'}), 403

        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        # Валидация полей
        full_name = data.get('full_name', '').strip()
        login = data.get('login', '').strip()
        password = data.get('password', '').strip()
        role = data.get('role', 'Пользователь').strip()
        email = data.get('email', '').strip()
        phone = data.get('phone', '').strip()
        department = data.get('department', '').strip()

        if not full_name:
            return jsonify({'success': False, 'error': 'Введите ФИО'}), 400

        if not login or len(login) < 3:
            return jsonify({'success': False, 'error': 'Логин должен содержать минимум 3 символа'}), 400

        if not password or len(password) < 6:
            return jsonify({'success': False, 'error': 'Пароль должен содержать минимум 6 символов'}), 400

        # Проверяем, не занят ли логин
        existing_user = db.query(
            'SELECT id FROM users WHERE login = ?',
            [login],
            one=True
        )

        if existing_user:
            return jsonify({'success': False, 'error': 'Пользователь с таким логином уже существует'}), 400

        # Создаем пользователя
        user_id = db.execute('''
            INSERT INTO users (full_name, role, login, password, email, phone, department, avatar, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            full_name,
            role,
            login,
            password,
            email,
            phone,
            department,
            'default.png',
            1
        ])

        return jsonify({
            'success': True,
            'user_id': user_id,
            'message': 'Пользователь успешно создан'
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка создания пользователя: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>/toggle', methods=['POST'])
@login_required
def toggle_user_status(user_id):
    """Блокировка/разблокировка пользователя (только для администраторов)"""
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        # Нельзя заблокировать самого себя
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Нельзя заблокировать свою учетную запись'}), 400

        user = db.query('SELECT id, full_name, is_active FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        new_status = 0 if user['is_active'] else 1
        db.execute('UPDATE users SET is_active = ? WHERE id = ?', [new_status, user_id])

        status_text = 'разблокирован' if new_status else 'заблокирован'

        return jsonify({
            'success': True,
            'is_active': new_status,
            'message': f'Пользователь {user["full_name"]} {status_text}'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Удаление пользователя (только для администраторов)"""
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        # Нельзя удалить самого себя
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Нельзя удалить свою учетную запись'}), 400

        user = db.query('SELECT id, full_name FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        # Удаляем пользователя
        db.execute('DELETE FROM users WHERE id = ?', [user_id])

        return jsonify({
            'success': True,
            'message': f'Пользователь {user["full_name"]} успешно удален'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>/credentials')
@login_required
def get_user_credentials(user_id):
    """Получение логина и пароля пользователя для печати (только для администраторов)"""
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        user = db.query('SELECT id, full_name, login, password FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        return jsonify({
            'success': True,
            'credentials': {
                'full_name': user['full_name'],
                'login': user['login'],
                'password': user['password']
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500