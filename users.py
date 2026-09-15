# users.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required, role_required

users_bp = Blueprint('users', __name__)
db = Database()


# ============= API ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ =============

@users_bp.route('/api/users')
@login_required
def get_users():
    """Список пользователей (доступно всем авторизованным для фильтров)."""
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
    try:
        user = db.query('SELECT * FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404

        user_stats = db.query('''
            SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'Выполнено' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status IN ('Новое', 'В работе') THEN 1 ELSE 0 END) as active
            FROM tasks
            WHERE executor = ?
        ''', [user['full_name']], one=True)

        user_dict = dict(user)
        user_dict.pop('password', None)
        user_dict['statistics'] = dict(user_stats) if user_stats else {}

        return jsonify(user_dict)
    except Exception as e:
        return jsonify({'error': f'Ошибка получения пользователя: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    """
    Обновление профиля.
    - Свой профиль может редактировать любой.
    - Чужой — только Администратор.
    - Роль и is_active меняет только Администратор.
    """
    try:
        is_self = session.get('user_id') == user_id
        is_admin = session.get('user_role') == 'Администратор'

        if not is_self and not is_admin:
            return jsonify({'success': False, 'error': 'Недостаточно прав для редактирования'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных для обновления'}), 400

        user = db.query('SELECT * FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        # Значения по умолчанию — текущие из БД
        new_full_name = data.get('full_name', user['full_name'])
        new_role = user['role']
        new_login = data.get('login', user['login'])
        # Пароль обновляем ТОЛЬКО если передан непустой
        new_password = user['password']
        if data.get('password') and str(data['password']).strip():
            new_password = str(data['password']).strip()
        new_is_active = user['is_active']

        # Роль и is_active — только администратор
        if is_admin:
            new_role = data.get('role', user['role'])
            new_is_active = data.get('is_active', user['is_active'])

        # Проверка уникальности логина
        if new_login and new_login != user['login']:
            existing = db.query(
                'SELECT id FROM users WHERE login = ? AND id != ?',
                [new_login, user_id], one=True
            )
            if existing:
                return jsonify({
                    'success': False,
                    'error': 'Пользователь с таким логином уже существует'
                }), 400

        db.execute('''
            UPDATE users
            SET full_name = ?, role = ?, avatar = ?, email = ?, phone = ?, department = ?,
                login = ?, password = ?, is_active = ?
            WHERE id = ?
        ''', [
            new_full_name,
            new_role,
            data.get('avatar', user['avatar']),
            data.get('email', user['email']),
            data.get('phone', user['phone']),
            data.get('department', user['department']),
            new_login,
            new_password,
            new_is_active,
            user_id
        ])

        # Обновление сессии, если правит сам себя
        if is_self:
            session['user_name'] = new_full_name
            session['user_role'] = new_role
            session['user_avatar'] = data.get('avatar', user['avatar'])
            session['user_email'] = data.get('email', user['email'])
            session['user_phone'] = data.get('phone', user['phone'])
            session['user_department'] = data.get('department', user['department'])
            session['user_login'] = new_login

        return jsonify({'success': True, 'message': 'Профиль успешно обновлен'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления профиля: {str(e)}'}), 500


@users_bp.route('/api/users', methods=['POST'])
@role_required('Администратор')
def create_user():
    """Создание нового пользователя — только администратор."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        full_name = (data.get('full_name') or '').strip()
        login = (data.get('login') or '').strip()
        password = (data.get('password') or '').strip()
        role = (data.get('role') or 'Пользователь').strip()
        email = (data.get('email') or '').strip()
        phone = (data.get('phone') or '').strip()
        department = (data.get('department') or '').strip()

        if not full_name:
            return jsonify({'success': False, 'error': 'Введите ФИО'}), 400
        if not login or len(login) < 3:
            return jsonify({'success': False, 'error': 'Логин должен содержать минимум 3 символа'}), 400
        if not password or len(password) < 6:
            return jsonify({'success': False, 'error': 'Пароль должен содержать минимум 6 символов'}), 400

        if db.query('SELECT id FROM users WHERE login = ?', [login], one=True):
            return jsonify({'success': False, 'error': 'Пользователь с таким логином уже существует'}), 400

        user_id = db.execute('''
            INSERT INTO users (full_name, role, login, password, email, phone, department, avatar, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [full_name, role, login, password, email, phone, department, 'default.png', 1])

        return jsonify({
            'success': True,
            'user_id': user_id,
            'message': 'Пользователь успешно создан'
        }), 201
    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка создания пользователя: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>/toggle', methods=['POST'])
@role_required('Администратор')
def toggle_user_status(user_id):
    try:
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
@role_required('Администратор')
def delete_user(user_id):
    try:
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Нельзя удалить свою учетную запись'}), 400

        user = db.query('SELECT id, full_name FROM users WHERE id = ?', [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        db.execute('DELETE FROM users WHERE id = ?', [user_id])
        return jsonify({'success': True, 'message': f'Пользователь {user["full_name"]} успешно удален'})
    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>/credentials')
@role_required('Администратор')
def get_user_credentials(user_id):
    try:
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