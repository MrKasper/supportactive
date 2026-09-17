# comments.py
"""
Комментарии к заявкам.
"""
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required
from logger import get_logger

log = get_logger(__name__)

comments_bp = Blueprint('comments', __name__)
db = Database()


@comments_bp.route('/api/tasks/<int:task_id>/comments', methods=['GET'])
@login_required
def list_comments(task_id):
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'error': 'Заявка не найдена'}), 404
        if session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
            return jsonify({'error': 'Недостаточно прав'}), 403

        rows = db.query('''
            SELECT * FROM task_comments
            WHERE task_id = ? AND deleted_at IS NULL
            ORDER BY created_at ASC, id ASC
        ''', [task_id])

        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('Ошибка получения комментариев')
        return jsonify({'error': str(e)}), 500


@comments_bp.route('/api/tasks/<int:task_id>/comments', methods=['POST'])
@login_required
def create_comment(task_id):
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        if session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'Пустой комментарий'}), 400
        if len(text) > 5000:
            return jsonify({'success': False, 'error': 'Максимум 5000 символов'}), 400

        is_internal = 1 if (data.get('is_internal')
                            and session.get('user_role') in ('Администратор', 'Техник')) else 0

        comment_id = db.execute('''
            INSERT INTO task_comments
                (task_id, user_id, user_name, text, created_at, is_internal)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', [
            task_id,
            session.get('user_id'),
            session.get('user_name', ''),
            text,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            is_internal
        ])

        try:
            from audit import log_action
            log_action('create', 'comment', comment_id, {'task_id': task_id})
        except Exception:
            pass

        # === Уведомления о новом комментарии ===
        try:
            from notifications import notify_new_comment
            notify_new_comment(comment_id, task_id, dict(task),
                               session.get('user_id'), text)
        except Exception as notify_err:
            log.warning(f'Ошибка отправки уведомлений о комментарии: {notify_err}')

        return jsonify({
            'success': True,
            'comment_id': comment_id,
            'message': 'Комментарий добавлен'
        }), 201
    except Exception as e:
        log.exception('Ошибка добавления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


@comments_bp.route('/api/comments/<int:comment_id>', methods=['PUT'])
@login_required
def update_comment(comment_id):
    try:
        c = db.query('SELECT * FROM task_comments WHERE id = ?', [comment_id], one=True)
        if not c:
            return jsonify({'success': False, 'error': 'Комментарий не найден'}), 404
        if c['user_id'] != session.get('user_id'):
            return jsonify({'success': False, 'error': 'Можно редактировать только свои'}), 403

        data = request.get_json() or {}
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'Пустой комментарий'}), 400
        if len(text) > 5000:
            return jsonify({'success': False, 'error': 'Слишком длинный'}), 400

        db.execute('UPDATE task_comments SET text = ? WHERE id = ?', [text, comment_id])
        return jsonify({'success': True, 'message': 'Обновлено'})
    except Exception as e:
        log.exception('Ошибка редактирования комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


@comments_bp.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    try:
        c = db.query('SELECT * FROM task_comments WHERE id = ?', [comment_id], one=True)
        if not c:
            return jsonify({'success': False, 'error': 'Комментарий не найден'}), 404

        is_admin = session.get('user_role') == 'Администратор'
        is_author = c['user_id'] == session.get('user_id')
        if not (is_admin or is_author):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        # Мягкое удаление — можно восстановить
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db.execute('UPDATE task_comments SET deleted_at = ? WHERE id = ?', [now, comment_id])

        try:
            from audit import log_action
            log_action('delete', 'comment', comment_id, {'task_id': c['task_id'], 'soft': True})
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Комментарий удалён',
            'restore_url': f'/api/comments/{comment_id}/restore'
        })
    except Exception as e:
        log.exception('Ошибка удаления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


@comments_bp.route('/api/comments/<int:comment_id>/restore', methods=['POST'])
@login_required
def restore_comment(comment_id):
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
        db.execute('UPDATE task_comments SET deleted_at = NULL WHERE id = ?', [comment_id])
        return jsonify({'success': True, 'message': 'Комментарий восстановлен'})
    except Exception as e:
        log.exception('Ошибка восстановления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500