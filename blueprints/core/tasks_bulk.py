# tasks_bulk.py
"""
Массовые операции над заявками:
  • close    — закрыть выбранные
  • assign   — назначить исполнителя
  • priority — изменить приоритет
  • delete   — удалить (только админ)

Роут: POST /api/tasks/bulk
"""
from datetime import datetime

from flask import Blueprint, jsonify, session

from database import Database
from utils import role_required, get_json_safe
from logger import get_logger
from constants import (
    ROLE_ADMIN, ROLE_TECH,
    STATUS_COMPLETED, STATUS_CANCELLED,
    ALL_PRIORITIES,
)

from services.notifications import notify_task_completed
from audit import log_action

# Импорт из tasks.py (циклических нет: tasks.py не импортирует tasks_bulk)
from blueprints.core.tasks import invalidate_task_caches

log = get_logger(__name__)
tasks_bulk_bp = Blueprint('tasks_bulk', __name__)
db = Database()


@tasks_bulk_bp.route('/api/tasks/bulk', methods=['POST'])
@role_required(ROLE_ADMIN, ROLE_TECH)
def bulk_tasks():
    """
    Массовые операции над заявками.

    Тело:
      {
        action: 'close' | 'assign' | 'priority' | 'delete',
        ids: [1, 2, 3],
        executor: 'Петров П.П.',    # для assign
        priority: 'Высокий'         # для priority
      }
    """
    try:
        data = get_json_safe()
        action = (data.get('action') or '').strip()

        raw_ids = data.get('ids') or []
        if not isinstance(raw_ids, list) or not raw_ids:
            return jsonify({
                'success': False,
                'error': 'Пустой список ID',
            }), 400

        ids = []
        for i in raw_ids:
            try:
                ids.append(int(i))
            except (TypeError, ValueError):
                pass

        if not ids:
            return jsonify({
                'success': False,
                'error': 'Нет валидных ID',
            }), 400

        if len(ids) > 500:
            return jsonify({
                'success': False,
                'error': 'Максимум 500 заявок за раз',
            }), 400

        updated = 0
        actor_id = session.get('user_id')

        # ---------- Закрытие ----------
        if action == 'close':
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    cur = tx._cur.execute('''
                        UPDATE tasks
                        SET status = ?, completed_date = ?
                        WHERE id = ?
                          AND deleted_at IS NULL
                          AND status NOT IN (?, ?)
                    ''', [
                        STATUS_COMPLETED, now, tid,
                        STATUS_COMPLETED, STATUS_CANCELLED,
                    ])
                    if cur.rowcount:
                        updated += 1
                        task = db.query(
                            'SELECT * FROM tasks WHERE id = ?',
                            [tid], one=True,
                        )
                        if task:
                            notify_task_completed(
                                tid, dict(task),
                                actor_id=actor_id,
                            )

        # ---------- Назначение ----------
        elif action == 'assign':
            executor = (data.get('executor') or '').strip()
            if not executor:
                return jsonify({
                    'success': False,
                    'error': 'Не указан исполнитель',
                }), 400

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('''
                        UPDATE tasks SET executor = ?
                        WHERE id = ? AND deleted_at IS NULL
                    ''', [executor, tid])
            updated = len(ids)

        # ---------- Приоритет ----------
        elif action == 'priority':
            priority = data.get('priority')
            if priority not in ALL_PRIORITIES:
                return jsonify({
                    'success': False,
                    'error': 'Недопустимый приоритет',
                }), 400

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('''
                        UPDATE tasks SET priority = ?
                        WHERE id = ? AND deleted_at IS NULL
                    ''', [priority, tid])
            updated = len(ids)

        # ---------- Удаление ----------
        elif action == 'delete':
            if session.get('user_role') != ROLE_ADMIN:
                return jsonify({
                    'success': False,
                    'error': 'Только администратор',
                }), 403

            with db.transaction(immediate=True) as tx:
                for tid in ids:
                    tx.execute('DELETE FROM notifications WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_history WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_comments WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM task_attachments WHERE task_id = ?', [tid])
                    tx.execute('DELETE FROM tasks WHERE id = ?', [tid])
            updated = len(ids)

        else:
            return jsonify({
                'success': False,
                'error': 'Неизвестное действие',
            }), 400

        invalidate_task_caches()

        try:
            log_action('bulk', 'task', None, {
                'action': action,
                'count': len(ids),
            })
        except Exception:
            pass

        log.info(f'Bulk action={action} над {len(ids)} заявками')

        return jsonify({
            'success': True,
            'updated': updated,
            'message': f'Обновлено: {updated}',
        })
    except Exception as e:
        log.exception('bulk_tasks error')
        return jsonify({'success': False, 'error': str(e)}), 500