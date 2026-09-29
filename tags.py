# tags.py
"""
Теги для заявок.

CRUD справочника тегов + привязка тегов к заявке.
"""
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required
from constants import EDITOR_ROLES
from logger import get_logger

log = get_logger(__name__)
tags_bp = Blueprint('tags', __name__)
db = Database()


ALLOWED_COLORS = {
    '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
    '#f59e0b', '#eab308', '#10b981', '#14b8a6', '#0ea5e9',
    '#64748b', '#64748b', '#18181b',
}


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _normalize_tag(row):
    return {
        'id': row['id'],
        'name': row['name'],
        'color': row['color'] or '#6366f1',
        'description': row['description'] or '',
        'created_at': row['created_at'],
    }


# ============================================================
# СПРАВОЧНИК ТЕГОВ
# ============================================================

@tags_bp.route('/api/tags', methods=['GET'])
@login_required
def list_tags():
    """Список всех тегов."""
    try:
        rows = db.query('''
            SELECT id, name, color, description, created_at
            FROM tags
            WHERE deleted_at IS NULL
            ORDER BY name
        ''')
        return jsonify([_normalize_tag(r) for r in rows])
    except Exception as e:
        log.exception('tags.list error')
        return jsonify({'error': str(e)}), 500


@tags_bp.route('/api/tags', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_tag():
    """Создать тег. Доступно Администратору и Технику."""
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название'}), 400
        if len(name) > 50:
            return jsonify({'success': False, 'error': 'Максимум 50 символов'}), 400

        color = (data.get('color') or '#6366f1').strip()
        if color not in ALLOWED_COLORS:
            color = '#6366f1'

        existing = db.query(
            'SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL',
            [name], one=True,
        )
        if existing:
            return jsonify({
                'success': False,
                'error': 'Тег с таким названием уже существует',
            }), 400

        with db.transaction(immediate=True) as tx:
            tag_id = tx.execute('''
                INSERT INTO tags (name, color, description, created_at)
                VALUES (?, ?, ?, ?)
            ''', [name, color, (data.get('description') or '').strip(), _now()])

        return jsonify({
            'success': True, 'tag_id': tag_id, 'message': 'Тег создан',
        }), 201
    except Exception as e:
        log.exception('tags.create error')
        return jsonify({'success': False, 'error': str(e)}), 500


@tags_bp.route('/api/tags/<int:tag_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_tag(tag_id):
    """Обновить тег."""
    try:
        old = db.query(
            'SELECT * FROM tags WHERE id = ? AND deleted_at IS NULL',
            [tag_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Тег не найден'}), 404

        data = request.get_json(silent=True) or {}
        name = (data.get('name') or old['name']).strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название'}), 400

        color = (data.get('color') or old['color'] or '#6366f1').strip()
        if color not in ALLOWED_COLORS:
            color = '#6366f1'

        duplicate = db.query(
            'SELECT id FROM tags WHERE name = ? AND id != ? AND deleted_at IS NULL',
            [name, tag_id], one=True,
        )
        if duplicate:
            return jsonify({
                'success': False,
                'error': 'Тег с таким названием уже существует',
            }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE tags SET name = ?, color = ?, description = ?
                WHERE id = ?
            ''', [
                name, color,
                (data.get('description', old['description']) or '').strip(),
                tag_id,
            ])

        return jsonify({'success': True, 'message': 'Тег обновлён'})
    except Exception as e:
        log.exception('tags.update error')
        return jsonify({'success': False, 'error': str(e)}), 500


@tags_bp.route('/api/tags/<int:tag_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_tag(tag_id):
    """Мягкое удаление тега."""
    try:
        exists = db.query(
            'SELECT id FROM tags WHERE id = ? AND deleted_at IS NULL',
            [tag_id], one=True,
        )
        if not exists:
            return jsonify({'success': False, 'error': 'Тег не найден'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE tags SET deleted_at = ? WHERE id = ?',
                       [_now(), tag_id])

        return jsonify({'success': True, 'message': 'Тег удалён'})
    except Exception as e:
        log.exception('tags.delete error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПРИВЯЗКА ТЕГОВ К ЗАЯВКЕ
# ============================================================

@tags_bp.route('/api/tasks/<int:task_id>/tags', methods=['GET'])
@login_required
def get_task_tags(task_id):
    try:
        rows = db.query('''
            SELECT t.id, t.name, t.color, t.description
            FROM task_tags tt
            JOIN tags t ON t.id = tt.tag_id
            WHERE tt.task_id = ? AND t.deleted_at IS NULL
            ORDER BY t.name
        ''', [task_id])
        return jsonify([_normalize_tag(r) for r in rows])
    except Exception as e:
        log.exception('tags.get_task_tags error')
        return jsonify({'error': str(e)}), 500


@tags_bp.route('/api/tasks/<int:task_id>/tags', methods=['POST'])
@role_required(*EDITOR_ROLES)
def set_task_tags(task_id):
    """Заменить все теги заявки. Body: { tag_ids: [1,2,3] }."""
    try:
        task = db.query(
            'SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL',
            [task_id], one=True,
        )
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        data = request.get_json(silent=True) or {}
        raw_ids = data.get('tag_ids') or []

        tag_ids = []
        for x in raw_ids:
            try:
                tag_ids.append(int(x))
            except (TypeError, ValueError):
                pass

        now = _now()
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM task_tags WHERE task_id = ?', [task_id])

            for tid in tag_ids:
                valid = tx.query(
                    'SELECT id FROM tags WHERE id = ? AND deleted_at IS NULL',
                    [tid], one=True,
                )
                if not valid:
                    continue
                tx.execute('''
                    INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at)
                    VALUES (?, ?, ?)
                ''', [task_id, tid, now])

        return jsonify({
            'success': True,
            'message': 'Теги обновлены',
            'count': len(tag_ids),
        })
    except Exception as e:
        log.exception('tags.set_task_tags error')
        return jsonify({'success': False, 'error': str(e)}), 500


@tags_bp.route('/api/tasks/<int:task_id>/tags/<int:tag_id>', methods=['POST'])
@role_required(*EDITOR_ROLES)
def add_tag_to_task(task_id, tag_id):
    """Добавить один тег к заявке."""
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at)
                VALUES (?, ?, ?)
            ''', [task_id, tag_id, _now()])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('tags.add_tag_to_task error')
        return jsonify({'success': False, 'error': str(e)}), 500


@tags_bp.route('/api/tasks/<int:task_id>/tags/<int:tag_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def remove_tag_from_task(task_id, tag_id):
    """Убрать один тег с заявки."""
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute(
                'DELETE FROM task_tags WHERE task_id = ? AND tag_id = ?',
                [task_id, tag_id],
            )
        return jsonify({'success': True})
    except Exception as e:
        log.exception('tags.remove_tag_from_task error')
        return jsonify({'success': False, 'error': str(e)}), 500