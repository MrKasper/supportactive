# comments.py
"""
Комментарии к заявкам + @mentions.
Бизнес-логика уведомлений — в services/notifications.py.
"""
import re
from datetime import datetime

from flask import Blueprint, jsonify, session, request

from database import Database
from utils import login_required, get_json_safe
from logger import get_logger
from constants import EDITOR_ROLES, MAX_COMMENT_LENGTH

log = get_logger(__name__)
comments_bp = Blueprint('comments', __name__)
db = Database()


# ============================================================
# @MENTIONS
# ============================================================
MENTION_RE = re.compile(
    r'@([^\s@,;:!?()\[\]{}<>]{2,40}(?:\s+[^\s@,;:!?()\[\]{}<>]{2,40}){0,2})',
    re.UNICODE,
)


def extract_mentions(text):
    """Возвращает уникальные строки упоминаний без @."""
    if not text:
        return []
    found = MENTION_RE.findall(text)
    seen = set()
    result = []
    for m in found:
        key = m.strip().lower()
        if key and key not in seen:
            seen.add(key)
            result.append(m.strip())
    return result


def resolve_mentions(mention_strs):
    """Сопоставляет @... с реальными пользователями."""
    if not mention_strs:
        return []

    users = db.query('''
        SELECT id, full_name, login FROM users
        WHERE is_active = 1 AND deleted_at IS NULL
    ''')
    if not users:
        return []

    resolved = []
    used_ids = set()

    for m in mention_strs:
        m_low = m.lower()
        match = None

        for u in users:
            if (u['login'] or '').lower() == m_low:
                match = u
                break
        if not match:
            for u in users:
                if (u['full_name'] or '').lower() == m_low:
                    match = u
                    break
        if not match:
            for u in users:
                if (u['full_name'] or '').lower().startswith(m_low):
                    match = u
                    break
        if not match:
            for u in users:
                if (u['login'] or '').lower().startswith(m_low):
                    match = u
                    break

        if match and match['id'] not in used_ids:
            used_ids.add(match['id'])
            resolved.append(dict(match))

    return resolved


# ============================================================
# ХЕЛПЕРЫ ДОСТУПА
# ============================================================

def _get_task_or_404(task_id):
    return db.query(
        'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
        [task_id], one=True,
    )


def _can_access_task(task):
    if not task:
        return False
    if session.get('user_role') == 'Пользователь':
        return task['created_by'] == session.get('user_id')
    return True


# ============================================================
# СПИСОК
# ============================================================

@comments_bp.route('/api/tasks/<int:task_id>/comments', methods=['GET'])
@login_required
def list_comments(task_id):
    try:
        task = _get_task_or_404(task_id)
        if not task:
            return jsonify({'error': 'Заявка не найдена'}), 404
        if not _can_access_task(task):
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


# ============================================================
# СОЗДАНИЕ
# ============================================================

@comments_bp.route('/api/tasks/<int:task_id>/comments', methods=['POST'])
@login_required
def create_comment(task_id):
    try:
        task = _get_task_or_404(task_id)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404
        if not _can_access_task(task):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        data = get_json_safe()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'Пустой комментарий'}), 400
        if len(text) > MAX_COMMENT_LENGTH:
            return jsonify({
                'success': False,
                'error': f'Максимум {MAX_COMMENT_LENGTH} символов',
            }), 400

        is_internal = 1 if (
            data.get('is_internal')
            and session.get('user_role') in EDITOR_ROLES
        ) else 0

        with db.transaction(immediate=True) as tx:
            comment_id = tx.execute('''
                INSERT INTO task_comments
                    (task_id, user_id, user_name, text, created_at, is_internal)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', [
                task_id,
                session.get('user_id'),
                session.get('user_name', ''),
                text,
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                is_internal,
            ])

        # ---------- Аудит ----------
        try:
            from audit import log_action
            log_action('create', 'comment', comment_id, {'task_id': task_id})
        except Exception:
            pass

        # ---------- Уведомления ----------
        try:
            from services.notifications import notify_new_comment, notify_mentions

            notify_new_comment(
                comment_id, task_id, dict(task),
                session.get('user_id'), text,
            )

            mention_strs = extract_mentions(text)
            if mention_strs:
                mentioned = resolve_mentions(mention_strs)
                author_id = session.get('user_id')
                target_ids = [u['id'] for u in mentioned if u['id'] != author_id]
                if target_ids:
                    notify_mentions(
                        comment_id, task_id, dict(task),
                        author_id, target_ids, text[:80],
                    )
        except Exception as notify_err:
            log.warning(f'Ошибка отправки уведомлений о комментарии: {notify_err}')

        return jsonify({
            'success': True,
            'comment_id': comment_id,
            'message': 'Комментарий добавлен',
        }), 201
    except Exception as e:
        log.exception('Ошибка добавления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# РЕДАКТИРОВАНИЕ
# ============================================================

@comments_bp.route('/api/comments/<int:comment_id>', methods=['PUT'])
@login_required
def update_comment(comment_id):
    try:
        c = db.query(
            'SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL',
            [comment_id], one=True,
        )
        if not c:
            return jsonify({'success': False, 'error': 'Комментарий не найден'}), 404
        if c['user_id'] != session.get('user_id'):
            return jsonify({
                'success': False,
                'error': 'Можно редактировать только свои',
            }), 403

        data = get_json_safe()
        text = (data.get('text') or '').strip()
        if not text:
            return jsonify({'success': False, 'error': 'Пустой комментарий'}), 400
        if len(text) > MAX_COMMENT_LENGTH:
            return jsonify({'success': False, 'error': 'Слишком длинный'}), 400

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE task_comments SET text = ? WHERE id = ?',
                [text, comment_id],
            )

        return jsonify({'success': True, 'message': 'Обновлено'})
    except Exception as e:
        log.exception('Ошибка редактирования комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ (мягкое)
# ============================================================

@comments_bp.route('/api/comments/<int:comment_id>', methods=['DELETE'])
@login_required
def delete_comment(comment_id):
    try:
        c = db.query(
            'SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL',
            [comment_id], one=True,
        )
        if not c:
            return jsonify({'success': False, 'error': 'Комментарий не найден'}), 404

        is_admin = session.get('user_role') == 'Администратор'
        is_author = c['user_id'] == session.get('user_id')
        if not (is_admin or is_author):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE task_comments SET deleted_at = ? WHERE id = ?',
                [now, comment_id],
            )

        try:
            from audit import log_action
            log_action('delete', 'comment', comment_id, {
                'task_id': c['task_id'], 'soft': True,
            })
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Комментарий удалён',
            'restore_url': f'/api/comments/{comment_id}/restore',
        })
    except Exception as e:
        log.exception('Ошибка удаления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ВОССТАНОВЛЕНИЕ
# ============================================================

@comments_bp.route('/api/comments/<int:comment_id>/restore', methods=['POST'])
@login_required
def restore_comment(comment_id):
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE task_comments SET deleted_at = NULL WHERE id = ?',
                [comment_id],
            )

        try:
            from audit import log_action
            log_action('update', 'comment', comment_id, {'action': 'restore'})
        except Exception:
            pass

        return jsonify({
            'success': True,
            'message': 'Комментарий восстановлен',
        })
    except Exception as e:
        log.exception('Ошибка восстановления комментария')
        return jsonify({'success': False, 'error': str(e)}), 500