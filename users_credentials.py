# users_credentials.py
"""
Учётные данные пользователей: просмотр, сброс пароля.
"""
from flask import Blueprint, jsonify, session

from database import Database
from utils import role_required
from passwords import hash_password, generate_password
from logger import get_logger

log = get_logger(__name__)
users_credentials_bp = Blueprint('users_credentials', __name__)
db = Database()


@users_credentials_bp.route('/api/users/<int:user_id>/credentials')
@role_required('Администратор')
def get_user_credentials(user_id):
    try:
        user = db.query(
            'SELECT id, full_name, login FROM users '
            'WHERE id = ? AND deleted_at IS NULL',
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


@users_credentials_bp.route(
    '/api/users/<int:user_id>/reset-password', methods=['POST']
)
@role_required('Администратор')
def reset_user_password(user_id):
    try:
        user = db.query(
            'SELECT id, full_name, login FROM users '
            'WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True
        )
        if not user:
            return jsonify({'success': False, 'error': 'Пользователь не найден'}), 404

        new_plain = generate_password(10)

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE users SET password = ? WHERE id = ?',
                [hash_password(new_plain), user_id],
            )

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