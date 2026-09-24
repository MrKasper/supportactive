# dev_impersonate.py
"""
Dev-консоль: страница /dev + impersonation (вход под другим пользователем).
"""
from flask import Blueprint, jsonify, session, render_template

from database import Database
from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER

log = get_logger(__name__)
db = Database()

dev_impersonate_bp = Blueprint('dev_impersonate', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


@dev_impersonate_bp.route('/dev')
@role_required(*DEV_ROLES)
def dev_console_page():
    return render_template('dev_console.html')


@dev_impersonate_bp.route('/api/dev/users')
@role_required(*DEV_ROLES)
def dev_users_list():
    try:
        rows = db.query('''
            SELECT id, full_name, role, login, is_active, department
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY full_name
        ''')
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('dev_users_list error')
        return jsonify({'error': str(e)}), 500


@dev_impersonate_bp.route(
    '/api/dev/impersonate/<int:user_id>', methods=['POST']
)
@role_required(ROLE_DEVELOPER)
def dev_impersonate(user_id):
    try:
        target = db.query(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True,
        )
        if not target:
            return jsonify({
                'success': False,
                'error': 'Пользователь не найден',
            }), 404

        if not target['is_active']:
            return jsonify({
                'success': False,
                'error': 'Пользователь заблокирован',
            }), 400

        if target['id'] == session.get('user_id'):
            return jsonify({
                'success': False,
                'error': 'Вы уже находитесь под этой учётной записью',
            }), 400

        if not session.get('original_dev_user_id'):
            session['original_dev_user_id'] = session.get('user_id')
            session['original_dev_data'] = {
                'user_name': session.get('user_name'),
                'user_role': session.get('user_role'),
                'user_avatar': session.get('user_avatar'),
                'user_email': session.get('user_email'),
                'user_phone': session.get('user_phone'),
                'user_department': session.get('user_department'),
                'user_login': session.get('user_login'),
            }

        session['user_id'] = target['id']
        session['user_name'] = target['full_name']
        session['user_role'] = target['role']
        session['user_avatar'] = target['avatar']
        session['user_email'] = target['email']
        session['user_phone'] = target['phone']
        session['user_department'] = target['department']
        session['user_login'] = target['login']
        session['impersonating'] = True

        log.info(
            f'[IMPERSONATE] '
            f'{session.get("original_dev_data", {}).get("user_login")} '
            f'вошёл как {target["login"]} ({target["role"]})'
        )

        return jsonify({
            'success': True,
            'redirect': '/',
            'message': f'Вы вошли как {target["full_name"]}',
        })
    except Exception as e:
        log.exception('dev_impersonate error')
        return jsonify({'success': False, 'error': str(e)}), 500


@dev_impersonate_bp.route('/api/dev/impersonate/back', methods=['POST'])
def dev_impersonate_back():
    try:
        original_id = session.get('original_dev_user_id')
        if not original_id:
            return jsonify({
                'success': False,
                'error': 'Нет активной подмены пользователя',
            }), 400

        original = session.get('original_dev_data') or {}

        session['user_id'] = original_id
        session['user_name'] = original.get('user_name', '')
        session['user_role'] = original.get('user_role', '')
        session['user_avatar'] = original.get('user_avatar', '')
        session['user_email'] = original.get('user_email', '')
        session['user_phone'] = original.get('user_phone', '')
        session['user_department'] = original.get('user_department', '')
        session['user_login'] = original.get('user_login', '')

        session.pop('original_dev_user_id', None)
        session.pop('original_dev_data', None)
        session.pop('impersonating', None)

        log.info(f'[IMPERSONATE] Возврат к {original.get("user_login", "?")}')

        return jsonify({
            'success': True,
            'redirect': '/dev',
            'message': 'Возврат к сессии разработчика',
        })
    except Exception as e:
        log.exception('dev_impersonate_back error')
        return jsonify({'success': False, 'error': str(e)}), 500