# login.py
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import Database
from datetime import datetime, timedelta
from utils import get_client_ip
from extensions import limiter
from logger import get_logger
from passwords import verify_password, hash_password

log = get_logger(__name__)

auth_bp = Blueprint('auth', __name__)
db = Database()

MAX_ATTEMPTS = 3
MAX_ATTEMPTS_ADMIN = 10
BLOCK_MINUTES = 15


# ============================================================
# РАБОТА СО СЧЁТЧИКОМ ПОПЫТОК (в БД)
# ============================================================

def _get_attempt(login, ip):
    """Возвращает запись счётчика или None."""
    return db.query(
        'SELECT * FROM login_attempts WHERE login = ? AND ip = ?',
        [login, ip], one=True
    )


def _reset_attempt(login, ip):
    """Сбрасывает счётчик после успешного входа."""
    db.execute('DELETE FROM login_attempts WHERE login = ? AND ip = ?', [login, ip])


def _is_blocked(login, ip):
    """Проверяет, заблокирован ли доступ. Возвращает (blocked: bool, minutes_left: int)."""
    a = _get_attempt(login, ip)
    if not a or not a['blocked_until']:
        return False, 0

    try:
        blocked_until = datetime.strptime(a['blocked_until'], '%Y-%m-%d %H:%M:%S')
    except Exception:
        return False, 0

    if blocked_until > datetime.now():
        delta = blocked_until - datetime.now()
        return True, max(1, int(delta.total_seconds() // 60) + 1)

    # Время блокировки истекло — сбрасываем
    db.execute('DELETE FROM login_attempts WHERE id = ?', [a['id']])
    return False, 0


def _register_failure(login, ip, max_attempts):
    """
    Регистрирует неудачную попытку.
    Возвращает (blocked: bool, attempts_left: int).
    """
    now = datetime.now()
    a = _get_attempt(login, ip)

    if not a:
        # Первая попытка — создаём запись
        db.execute('''
            INSERT INTO login_attempts (login, ip, failed_count, last_attempt, created_at)
            VALUES (?, ?, 1, ?, ?)
        ''', [login, ip, now.strftime('%Y-%m-%d %H:%M:%S'), now.strftime('%Y-%m-%d %H:%M:%S')])
        return False, max_attempts - 1

    new_count = (a['failed_count'] or 0) + 1

    if new_count >= max_attempts:
        # Блокируем
        blocked_until = now + timedelta(minutes=BLOCK_MINUTES)
        db.execute('''
            UPDATE login_attempts
            SET failed_count = ?, last_attempt = ?, blocked_until = ?
            WHERE id = ?
        ''', [
            new_count,
            now.strftime('%Y-%m-%d %H:%M:%S'),
            blocked_until.strftime('%Y-%m-%d %H:%M:%S'),
            a['id']
        ])
        return True, 0
    else:
        db.execute('''
            UPDATE login_attempts
            SET failed_count = ?, last_attempt = ?
            WHERE id = ?
        ''', [new_count, now.strftime('%Y-%m-%d %H:%M:%S'), a['id']])
        return False, max_attempts - new_count


# ============================================================
# СТРАНИЦЫ
# ============================================================

@auth_bp.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')


@auth_bp.route('/logout')
def logout():
    user_login = session.get('user_login', 'unknown')
    session.clear()
    log.info(f'Выход из системы: {user_login} | IP={get_client_ip()}')
    return redirect(url_for('auth.login'))


# ============================================================
# ВХОД
# ============================================================

@auth_bp.route('/api/auth/login', methods=['POST'])
@limiter.limit('10 per minute')
@limiter.limit('30 per 5 minute')
def auth_login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        login = (data.get('login') or '').strip()
        password = (data.get('password') or '').strip()
        remember = bool(data.get('remember', False))
        ip = get_client_ip() or 'unknown'

        if not login or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

        # Проверка блокировки в БД
        blocked, minutes_left = _is_blocked(login, ip)
        if blocked:
            log.warning(f'Попытка входа в заблокированную учётку: {login} | IP={ip}')
            return jsonify({
                'success': False,
                'error': f'Слишком много попыток. Повторите через {minutes_left} мин.'
            }), 429

        user = db.query('SELECT * FROM users WHERE login = ?', [login], one=True)

        if not user:
            log.warning(f'Попытка входа с несуществующим логином: {login} | IP={ip}')
            return jsonify({
                'success': False,
                'error': f'Пользователь с логином "{login}" не найден в системе'
            }), 401

        if not user['is_active']:
            log.warning(f'Попытка входа в заблокированную учётку: {login} | IP={ip}')
            return jsonify({
                'success': False,
                'error': 'Учетная запись заблокирована. Обратитесь к администратору.'
            }), 403

        max_attempts = MAX_ATTEMPTS_ADMIN if user['role'] == 'Администратор' else MAX_ATTEMPTS

        # Проверка пароля
        ok, need_rehash = verify_password(user['password'], password)

        if not ok:
            blocked, attempts_left = _register_failure(login, ip, max_attempts)

            if blocked:
                log.error(f'Учётка временно заблокирована: {login} | IP={ip}')
                return jsonify({
                    'success': False,
                    'error': f'Слишком много попыток входа. Повторите через {BLOCK_MINUTES} мин.'
                }), 429

            log.warning(f'Неверный пароль: {login} (осталось: {attempts_left}) | IP={ip}')
            return jsonify({
                'success': False,
                'error': f'Неверный пароль. Осталось попыток: {attempts_left}'
            }), 401

        # Успех — сбрасываем счётчик
        _reset_attempt(login, ip)

        # Автомиграция plaintext → hash
        if need_rehash:
            try:
                db.execute('UPDATE users SET password = ? WHERE id = ?',
                           [hash_password(password), user['id']])
                log.info(f'Пароль пользователя {login} перехеширован')
            except Exception as e:
                log.warning(f'Не удалось перехешировать пароль: {e}')

        # Сессия
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

        log.info(f'Успешный вход: {login} ({user["role"]}) | IP={ip}')

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
        log.exception('Ошибка при логине')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500


@auth_bp.route('/api/login', methods=['POST'])
@limiter.limit('10 per minute')
def api_login():
    """Legacy — вход по ID."""
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

            log.info(f'Вход по ID (legacy): {user["login"]} | IP={get_client_ip()}')
            return jsonify({
                'success': True,
                'user': {'id': user['id'], 'full_name': user['full_name'], 'role': user['role']}
            })

        return jsonify({'success': False, 'error': 'Пользователь не найден или неактивен'}), 404
    except Exception as e:
        log.exception('Ошибка api_login')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500