# login.py
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from database import Database
from datetime import datetime
from utils import get_client_ip
from extensions import limiter
from logger import get_logger
from passwords import verify_password, hash_password, save_plain

log = get_logger(__name__)

auth_bp = Blueprint('auth', __name__)
db = Database()

# Ключ: login, Значение: {"count": int, "last_attempt": datetime}
# ⚠️ В памяти процесса. Для multi-worker (Gunicorn) нужно хранить в Redis/БД.
failed_attempts = {}

MAX_ATTEMPTS = 3               # для обычных пользователей и техников
MAX_ATTEMPTS_ADMIN = 10        # для админов — мягче, но всё равно ограничено
BLOCK_MINUTES = 15


def _reset_attempts_if_expired(login):
    """Сбрасывает счётчик, если прошло больше BLOCK_MINUTES минут."""
    if login in failed_attempts:
        elapsed = (datetime.now() - failed_attempts[login]["last_attempt"]).total_seconds()
        if elapsed >= BLOCK_MINUTES * 60:
            del failed_attempts[login]


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
# API: ВХОД ПО ЛОГИНУ/ПАРОЛЮ
# ============================================================

@auth_bp.route('/api/auth/login', methods=['POST'])
@limiter.limit('10 per minute')
@limiter.limit('30 per 5 minute')
def auth_login():
    """Авторизация по логину и паролю с защитой от перебора."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        login = (data.get('login') or '').strip()
        password = (data.get('password') or '').strip()
        remember = bool(data.get('remember', False))
        ip = get_client_ip()

        if not login or not password:
            return jsonify({'success': False, 'error': 'Введите логин и пароль'}), 400

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

        # Определяем лимит попыток в зависимости от роли
        max_attempts = MAX_ATTEMPTS_ADMIN if user['role'] == 'Администратор' else MAX_ATTEMPTS

        # Проверяем блокировку по счётчику попыток
        _reset_attempts_if_expired(login)
        if login in failed_attempts and failed_attempts[login]["count"] >= max_attempts:
            elapsed = (datetime.now() - failed_attempts[login]["last_attempt"]).total_seconds()
            remaining = int((BLOCK_MINUTES * 60 - elapsed) // 60) + 1
            log.warning(f'Попытка входа в заблокированную (по попыткам) учётку: {login} | IP={ip}')
            return jsonify({
                'success': False,
                'error': f'Слишком много попыток. Повторите через {remaining} мин.'
            }), 429

        # Проверка пароля (с авто-миграцией plaintext → hash)
        ok, need_rehash = verify_password(user['password'], password)

        if not ok:
            # Счётчик неудачных попыток — для всех, включая админов
            if login not in failed_attempts:
                failed_attempts[login] = {"count": 0, "last_attempt": datetime.now()}
            failed_attempts[login]["count"] += 1
            failed_attempts[login]["last_attempt"] = datetime.now()

            remaining = max_attempts - failed_attempts[login]["count"]

            if failed_attempts[login]["count"] >= max_attempts:
                log.error(
                    f'Учётка временно заблокирована после {max_attempts} неверных попыток: '
                    f'{login} | IP={ip}'
                )
                # ⚠️ НЕ отключаем is_active — только временная блокировка через счётчик
                return jsonify({
                    'success': False,
                    'error': f'Слишком много попыток входа. '
                             f'Повторите через {BLOCK_MINUTES} мин.'
                }), 429

            log.warning(f'Неверный пароль: {login} (осталось: {remaining}) | IP={ip}')
            return jsonify({
                'success': False,
                'error': f'Неверный пароль. Осталось попыток: {remaining}'
            }), 401

        # ---- Успешный вход ----
        failed_attempts.pop(login, None)

        # Автомиграция plaintext → hash (если в БД был старый plain-пароль)
        if need_rehash:
            try:
                new_hash = hash_password(password)
                db.execute('UPDATE users SET password = ? WHERE id = ?',
                           [new_hash, user['id']])
                save_plain(db, user['id'], password)
                log.info(f'Пароль пользователя {login} перехеширован (миграция)')
            except Exception as e:
                log.warning(f'Не удалось перехешировать пароль: {e}')

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


# ============================================================
# API: ВХОД ПО ID (legacy)
# ============================================================

@auth_bp.route('/api/login', methods=['POST'])
@limiter.limit('10 per minute')
def api_login():
    """Вход по ID пользователя (устаревший, оставлен для совместимости)."""
    try:
        data = request.get_json()
        if not data or 'user_id' not in data:
            return jsonify({'success': False, 'error': 'Не указан ID пользователя'}), 400

        user_id = data['user_id']
        user = db.query('SELECT * FROM users WHERE id = ? AND is_active = 1',
                        [user_id], one=True)

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
                'user': {
                    'id': user['id'],
                    'full_name': user['full_name'],
                    'role': user['role']
                }
            })

        return jsonify({
            'success': False,
            'error': 'Пользователь не найден или неактивен'
        }), 404

    except Exception as e:
        log.exception('Ошибка api_login')
        return jsonify({'success': False, 'error': f'Ошибка сервера: {str(e)}'}), 500