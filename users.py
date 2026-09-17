# users.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required, role_required
from passwords import hash_password, generate_password
from logger import get_logger
import os
import sqlite3
import tempfile
import traceback

log = get_logger(__name__)

users_bp = Blueprint('users', __name__)
db = Database()


# ============================================================
# СПИСОК ПОЛЬЗОВАТЕЛЕЙ
# ============================================================

@users_bp.route('/api/users')
@login_required
def get_users():
    try:
        users = db.query('''
            SELECT id, full_name, role, avatar, email, phone, department, login, is_active
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY full_name
        ''')
        return jsonify([dict(user) for user in users])
    except Exception as e:
        log.exception('Ошибка получения пользователей')
        return jsonify({'error': f'Ошибка получения пользователей: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>')
@login_required
def get_user(user_id):
    try:
        user = db.query(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True
        )
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
        user_dict.pop('password', None)  # никогда не отдаём хеш
        user_dict['statistics'] = dict(user_stats) if user_stats else {}

        return jsonify(user_dict)
    except Exception as e:
        log.exception('Ошибка получения пользователя')
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ОБНОВЛЕНИЕ
# ============================================================

@users_bp.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    try:
        is_self = session.get('user_id') == user_id
        is_admin = session.get('user_role') == 'Администратор'

        if not is_self and not is_admin:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        user = db.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
                        [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        new_full_name = data.get('full_name', user['full_name'])
        new_role = user['role']
        new_login = data.get('login', user['login'])
        new_password = user['password']  # текущий хеш
        password_changed = False

        # Пароль обновляем только если передан непустой
        if data.get('password') and str(data['password']).strip():
            new_password = hash_password(str(data['password']).strip())
            password_changed = True

        new_is_active = user['is_active']

        if is_admin:
            new_role = data.get('role', user['role'])
            new_is_active = data.get('is_active', user['is_active'])

        # Проверка уникальности логина
        if new_login and new_login != user['login']:
            existing = db.query(
                'SELECT id FROM users WHERE login = ? AND id != ? AND deleted_at IS NULL',
                [new_login, user_id], one=True
            )
            if existing:
                return jsonify({
                    'success': False,
                    'error': 'Пользователь с таким логином уже существует'
                }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE users
                SET full_name = ?, role = ?, avatar = ?, email = ?, phone = ?,
                    department = ?, login = ?, password = ?, is_active = ?
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

        # Лог в аудит
        try:
            from audit import log_action
            log_action('update', 'user', user_id, {
                'password_changed': password_changed,
                'role': new_role,
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Профиль успешно обновлен'})
    except Exception as e:
        log.exception('Ошибка обновления профиля')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# СОЗДАНИЕ
# ============================================================

@users_bp.route('/api/users', methods=['POST'])
@role_required('Администратор')
def create_user():
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

        with db.transaction(immediate=True) as tx:
            user_id = tx.execute('''
                INSERT INTO users 
                    (full_name, role, login, password, email, phone, department, avatar, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [full_name, role, login, hash_password(password),
                  email, phone, department, 'default.png', 1])

        try:
            from audit import log_action
            log_action('create', 'user', user_id, {'login': login, 'role': role})
        except Exception:
            pass

        return jsonify({
            'success': True,
            'user_id': user_id,
            'message': 'Пользователь успешно создан'
        }), 201
    except Exception as e:
        log.exception('Ошибка создания пользователя')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# БЛОКИРОВКА / РАЗБЛОКИРОВКА
# ============================================================

@users_bp.route('/api/users/<int:user_id>/toggle', methods=['POST'])
@role_required('Администратор')
def toggle_user_status(user_id):
    try:
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Нельзя заблокировать свою учетную запись'}), 400

        user = db.query('SELECT id, full_name, is_active FROM users WHERE id = ? AND deleted_at IS NULL',
                        [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        new_status = 0 if user['is_active'] else 1

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE users SET is_active = ? WHERE id = ?', [new_status, user_id])

        status_text = 'разблокирован' if new_status else 'заблокирован'

        try:
            from audit import log_action
            log_action('update', 'user', user_id, {'action': 'toggle', 'new_status': new_status})
        except Exception:
            pass

        return jsonify({
            'success': True,
            'is_active': new_status,
            'message': f'Пользователь {user["full_name"]} {status_text}'
        })
    except Exception as e:
        log.exception('Ошибка toggle_user_status')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# УДАЛЕНИЕ
# ============================================================

@users_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@role_required('Администратор')
def delete_user(user_id):
    try:
        if session.get('user_id') == user_id:
            return jsonify({'success': False, 'error': 'Нельзя удалить свою учетную запись'}), 400

        user = db.query('SELECT id, full_name FROM users WHERE id = ? AND deleted_at IS NULL',
                        [user_id], one=True)
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        # Мягкое удаление
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE users SET deleted_at = ? WHERE id = ?', [now, user_id])

        try:
            from audit import log_action
            log_action('delete', 'user', user_id, {'full_name': user['full_name'], 'soft': True})
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': f'Пользователь {user["full_name"]} удалён'
        })
    except Exception as e:
        log.exception('Ошибка удаления пользователя')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# УЧЁТНЫЕ ДАННЫЕ
# ============================================================

@users_bp.route('/api/users/<int:user_id>/credentials')
@role_required('Администратор')
def get_user_credentials(user_id):
    """
    Возвращает логин пользователя.
    Пароль недоступен — хранится в виде необратимого хеша.
    Для получения нового пароля используйте /reset-password.
    """
    try:
        user = db.query(
            'SELECT id, full_name, login FROM users WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True
        )
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        return jsonify({
            'success': True,
            'credentials': {
                'full_name': user['full_name'],
                'login': user['login'],
                'password': None,
                'available': False,
                'message': 'Пароль хранится в виде хеша и не может быть восстановлен. '
                           'Для получения нового пароля нажмите «Сбросить».'
            }
        })
    except Exception as e:
        log.exception('Ошибка get_user_credentials')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


@users_bp.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
@role_required('Администратор')
def reset_user_password(user_id):
    """
    Сброс пароля: генерирует новый, сохраняет только хеш,
    возвращает новый пароль один раз в открытом виде.
    """
    try:
        user = db.query(
            'SELECT id, full_name, login FROM users WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True
        )
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        new_plain = generate_password(10)

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE users SET password = ? WHERE id = ?',
                       [hash_password(new_plain), user_id])

        try:
            from audit import log_action
            log_action('update', 'user', user_id, {'action': 'reset_password'})
        except Exception:
            pass

        log.info(f'Сброшен пароль пользователя {user["login"]} (ID={user_id})')

        return jsonify({
            'success': True,
            'credentials': {
                'full_name': user['full_name'],
                'login': user['login'],
                'password': new_plain
            },
            'message': 'Пароль сброшен'
        })
    except Exception as e:
        log.exception('Ошибка reset_user_password')
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


# ============================================================
# ИМПОРТ ИЗ ДРУГОЙ БД
# ============================================================

def _normalize_role(raw_role, raw_type_access=''):
    s = f"{raw_role or ''} {raw_type_access or ''}".strip().lower()
    if any(k in s for k in ['admin', 'админ', 'root', 'administrator', 'super']):
        return 'Администратор'
    if any(k in s for k in ['tech', 'техник', 'мастер', 'engineer', 'support']):
        return 'Техник'
    return 'Пользователь'


def _build_full_name(ext_user):
    direct = (ext_user.get('full_name') or '').strip()
    if direct:
        return direct

    family = (ext_user.get('family') or ext_user.get('surname') or ext_user.get('last_name') or '').strip()
    name = (ext_user.get('name') or ext_user.get('first_name') or '').strip()
    father = (ext_user.get('father') or ext_user.get('patronymic') or ext_user.get('middle_name') or '').strip()

    parts = [p for p in (family, name, father) if p]
    if parts:
        return ' '.join(parts)
    return ''


@users_bp.route('/api/users/import', methods=['POST'])
@role_required('Администратор')
def import_users():
    tmp_path = None
    try:
        if 'database_file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        file = request.files['database_file']
        if not file or file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in ('db', 'sqlite', 'sqlite3'):
            return jsonify({
                'success': False,
                'error': 'Поддерживаются только .db, .sqlite, .sqlite3'
            }), 400

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        tmp_path = tmp.name
        tmp.close()
        file.save(tmp_path)

        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        all_tables = [r['name'] for r in cursor.fetchall()]
        users_table = None
        for t in all_tables:
            if t.lower() == 'users':
                users_table = t
                break

        if not users_table:
            conn.close()
            return jsonify({
                'success': False,
                'error': f'В файле нет таблицы users. Найдены: {", ".join(all_tables) or "нет"}'
            }), 400

        cursor.execute(f'SELECT * FROM "{users_table}"')
        external_users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not external_users:
            return jsonify({
                'success': True, 'imported': 0, 'skipped': 0, 'total': 0,
                'errors': ['Таблица users пуста'], 'message': 'Таблица users пуста'
            })

        first_row_keys = set(k.lower() for k in external_users[0].keys())
        is_legacy = ('family' in first_row_keys or 'father' in first_row_keys) and \
                    'full_name' not in first_row_keys

        imported = 0
        skipped = 0
        errors = []

        for ext_user in external_users:
            u = {k.lower(): v for k, v in ext_user.items()}
            full_name = _build_full_name(u)

            initials = (u.get('initials') or '').strip()
            if initials and initials not in full_name:
                full_name = f'{full_name} ({initials})'.strip()

            login = (u.get('login') or '').strip()

            if not login:
                skipped += 1
                errors.append(f'Пропущен: нет логина (ID={u.get("id")})')
                continue
            if not full_name:
                skipped += 1
                errors.append(f'Пропущен: не удалось собрать ФИО (логин={login})')
                continue

            existing = db.query('SELECT id FROM users WHERE login = ?', [login], one=True)
            if existing:
                skipped += 1
                continue

            password = str(u.get('password') or u.get('pass') or '').strip()
            if not password:
                password = 'changeme123'
                errors.append(f'{login}: пароль не найден, установлен временный')

            raw_role = u.get('role') or u.get('groupuser') or u.get('group_user') or ''
            raw_type_access = u.get('typeaccess') or u.get('type_access') or ''
            role = _normalize_role(raw_role, raw_type_access)

            department = (u.get('department') or u.get('depart') or '').strip()
            position = (u.get('position') or '').strip()
            if position and position not in department:
                department = f'{department} / {position}' if department else position

            email = (u.get('email') or '').strip()
            phone = (u.get('phone') or u.get('number') or '').strip()
            avatar = (u.get('avatar') or u.get('image') or '').strip() or 'default.png'

            is_active = u.get('is_active')
            if is_active is None:
                is_active = 1
            else:
                try:
                    is_active = 1 if int(is_active) else 0
                except (ValueError, TypeError):
                    is_active = 1

            try:
                with db.transaction(immediate=True) as tx:
                    tx.execute('''
                        INSERT INTO users 
                            (full_name, role, avatar, email, phone, department, login, password, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', [
                        full_name, role, avatar, email, phone, department, login,
                        hash_password(password), is_active
                    ])
                imported += 1
            except Exception as e:
                skipped += 1
                errors.append(f'{login}: {str(e)}')

        try:
            from audit import log_action
            log_action('import', 'user', None, {'imported': imported, 'skipped': skipped})
        except Exception:
            pass

        schema_note = 'legacy' if is_legacy else 'support_active'
        return jsonify({
            'success': True,
            'imported': imported,
            'skipped': skipped,
            'total': len(external_users),
            'schema': schema_note,
            'errors': errors[:30],
            'message': f'Схема: {schema_note}. Импортировано: {imported}, пропущено: {skipped}'
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Ошибка импорта: {str(e)}'}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass