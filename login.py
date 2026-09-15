# login.py
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import Database
from datetime import datetime
from utils import get_client_ip

auth_bp = Blueprint('auth', __name__)
db = Database()

# Ключ: login, Значение: {"count": int, "last_attempt": datetime}
failed_attempts = {}

MAX_ATTEMPTS = 3
BLOCK_MINUTES = 15


def _reset_attempts_if_expired(login):
    """Сбрасывает счётчик, если прошло больше BLOCK_MINUTES минут."""
    if login in failed_attempts:
        elapsed = (datetime.now() - failed_attempts[login]["last_attempt"]).total_seconds()
        if elapsed >= BLOCK_MINUTES * 60:
            del failed_attempts[login]


@auth_bp.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))


@auth_bp.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Авторизация по логину и паролю с защитой от перебора."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        login = (data.get('login') or '').strip()
        password = (data.get('password') or '').strip()
        remember = bool(data.get('remember', False))

        if not login or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        user = db.query('SELECT * FROM users WHERE login = ?', [login], one=True)

        if not user:
            return jsonify({
                'success': False,
                'error': f'Пользователь с логином "{login}" не найден в системе'
            }), 401

        if not user['is_active']:
            return jsonify({
                'success': False,
                'error': 'Учетная запись заблокирована. Обратитесь к администратору.'
            }), 403

        # Для не-администраторов — проверка таймера блокировки
        if user['role'] != 'Администратор':
            _reset_attempts_if_expired(login)
            if login in failed_attempts and failed_attempts[login]["count"] >= MAX_ATTEMPTS:
                elapsed = (datetime.now() - failed_attempts[login]["last_attempt"]).total_seconds()
                remaining = int((BLOCK_MINUTES * 60 - elapsed) // 60) + 1
                return jsonify({
                    'success': False,
                    'error': f'Учетная запись временно заблокирована. Повторите через {remaining} мин.'
                }), 429

        # Проверка пароля
        if user['password'] != password:
            if user['role'] == 'Администратор':
                return jsonify({
                    'success': False,
                    'error': 'Неверный пароль. Попробуйте еще раз.'
                }), 401

            if login not in failed_attempts:
                failed_attempts[login] = {"count": 0, "last_attempt": datetime.now()}
            failed_attempts[login]["count"] += 1
            failed_attempts[login]["last_attempt"] = datetime.now()

            remaining = MAX_ATTEMPTS - failed_attempts[login]["count"]

            if failed_attempts[login]["count"] >= MAX_ATTEMPTS:
                # Блокируем учётную запись
                db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user['id']])
                del failed_attempts[login]
                ip = get_client_ip()
                print(f"[SECURITY] Учётная запись '{login}' заблокирована после {MAX_ATTEMPTS} "
                      f"неверных попыток (IP: {ip})")
                return jsonify({
                    'success': False,
                    'error': 'Учетная запись заблокирована из-за 3 неверных попыток входа. Обратитесь к администратору.'
                }), 403

            return jsonify({
                'success': False,
                'error': f'Неверный пароль. Осталось попыток: {remaining}'
            }), 401

        # Успешный вход — сбрасываем счётчик
        failed_attempts.pop(login, None)

        # Сохраняем в сессии
        session['user_id'] = user['id']
        session['user_name'] = user['full_name']
        session['user_role'] = user['role']
        session['user_avatar'] = user['avatar']
        session['user_email'] = user['email']
        session['user_phone'] = user['phone']
        session['user_department'] = user['department']
        session['user_login'] = user['login']
        session['login_time'] = datetime.now().isoformat()

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


# Старый API (совместимость) — оставлен, но требует авторизации
@auth_bp.route('/api/login', methods=['POST'])
def api_login():
    """Вход по ID пользователя (legacy)."""
    try:
        data = request.get_json()
        if not data or 'user_id' not in data:
            return jsonify({'success': False, 'error': 'Не указан ID пользователя'}), 400

        user_id = data['user_id']
        user = db.query('SELECT * FROM users WHERE id = ? AND is_active = 1', [user_id], one=True)

        if user:
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