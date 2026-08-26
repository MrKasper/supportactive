# login.py
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import Database
from datetime import datetime

# Создаем Blueprint для авторизации
auth_bp = Blueprint('auth', __name__)

# Инициализация базы данных
db = Database()

# Словарь для отслеживания неудачных попыток входа
# Ключ: логин, Значение: {"count": количество попыток, "last_attempt": время последней попытки}
failed_attempts = {}


# ============= МАРШРУТЫ СТРАНИЦ АВТОРИЗАЦИИ =============

@auth_bp.route('/login')
def login():
    """Страница входа в систему"""
    # Если пользователь уже авторизован, перенаправляем на главную
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@auth_bp.route('/logout')
def logout():
    """Выход из системы"""
    session.clear()
    return redirect(url_for('auth.login'))


# ============= API ДЛЯ АВТОРИЗАЦИИ ПО ЛОГИНУ/ПАРОЛЮ =============

@auth_bp.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Авторизация по логину и паролю с защитой от перебора"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        login = data.get('login', '').strip()
        password = data.get('password', '').strip()
        remember = data.get('remember', False)

        if not login or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        # Сначала ищем пользователя
        user = db.query(
            'SELECT * FROM users WHERE login = ?',
            [login],
            one=True
        )

        # Если пользователь не найден
        if not user:
            return jsonify({
                'success': False,
                'error': f'Пользователь с логином "{login}" не найден в системе'
            }), 401

        # Проверяем, активен ли пользователь
        if not user['is_active']:
            return jsonify({
                'success': False,
                'error': 'Учетная запись заблокирована. Обратитесь к администратору.'
            }), 403

        # Проверяем таймер блокировки ТОЛЬКО для не-администраторов
        if user['role'] != 'Администратор':
            if login in failed_attempts:
                attempts = failed_attempts[login]
                time_diff = (datetime.now() - attempts["last_attempt"]).total_seconds()
                if attempts["count"] >= 3 and time_diff < 900:  # 900 секунд = 15 минут
                    remaining = int(900 - time_diff) // 60
                    return jsonify({
                        'success': False,
                        'error': f'Учетная запись временно заблокирована. Повторите через {remaining} мин.'
                    }), 429
                elif time_diff >= 900:
                    # Сбрасываем счетчик после 15 минут
                    failed_attempts[login] = {"count": 0, "last_attempt": datetime.now()}

        # Проверяем пароль
        if user['password'] != password:
            # Для администратора просто показываем ошибку без блокировки и без счетчика
            if user['role'] == 'Администратор':
                return jsonify({
                    'success': False,
                    'error': 'Неверный пароль. Попробуйте еще раз.'
                }), 401

            # Для остальных пользователей увеличиваем счетчик
            if login not in failed_attempts:
                failed_attempts[login] = {"count": 0, "last_attempt": datetime.now()}
            failed_attempts[login]["count"] += 1
            failed_attempts[login]["last_attempt"] = datetime.now()

            remaining = 3 - failed_attempts[login]["count"]

            # Блокируем учетную запись после 3 неверных попыток
            if failed_attempts[login]["count"] >= 3:
                db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user['id']])
                # Сбрасываем счетчик после блокировки
                del failed_attempts[login]
                return jsonify({
                    'success': False,
                    'error': 'Учетная запись заблокирована из-за 3 неверных попыток входа. Обратитесь к администратору.'
                }), 403

            return jsonify({
                'success': False,
                'error': f'Неверный пароль. Осталось попыток: {remaining}'
            }), 401

        # Успешный вход - сбрасываем счетчик неудачных попыток
        if login in failed_attempts:
            del failed_attempts[login]

        # Сохраняем данные пользователя в сессии
        session['user_id'] = user['id']
        session['user_name'] = user['full_name']
        session['user_role'] = user['role']
        session['user_avatar'] = user['avatar']
        session['user_email'] = user['email']
        session['user_phone'] = user['phone']
        session['user_department'] = user['department']
        session['user_login'] = user['login']
        session['login_time'] = datetime.now().isoformat()

        # Если "Запомнить меня" - делаем сессию постоянной
        if remember:
            session.permanent = True

        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'full_name': user['full_name'],
                'role': user['role'],
                'login': user['login']
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500


# Старый API для входа (оставлен для совместимости)
@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    """API для входа в систему (по ID пользователя)"""
    try:
        data = request.get_json()
        if not data or 'user_id' not in data:
            return jsonify({'success': False, 'error': 'Не указан ID пользователя'}), 400

        user_id = data['user_id']
        user = db.query('SELECT * FROM users WHERE id = ? AND is_active = 1', [user_id], one=True)

        if user:
            # Сохраняем данные пользователя в сессии
            session['user_id'] = user['id']
            session['user_name'] = user['full_name']
            session['user_role'] = user['role']
            session['user_avatar'] = user['avatar']
            session['user_email'] = user['email']
            session['user_phone'] = user['phone']
            session['user_department'] = user['department']
            session['user_login'] = user['login']
            session['login_time'] = datetime.now().isoformat()

            return jsonify({
                'success': True,
                'user': {
                    'id': user['id'],
                    'full_name': user['full_name'],
                    'role': user['role']
                }
            })

        return jsonify({'success': False, 'error': 'Пользователь не найден или неактивен'}), 404

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500