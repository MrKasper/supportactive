# notifications.py
"""
HTTP-слой для уведомлений + Server-Sent Events (SSE).
Бизнес-логика — в services/notifications.py.
"""
import json
import time
from flask import (
    Blueprint, jsonify, session, Response, stream_with_context,
)

from database import Database
from utils import login_required
from logger import get_logger

# Re-export для старых импортов
from services.notifications import (  # noqa: F401
    create_notification,
    notify_new_task,
    notify_task_taken,
    notify_task_completed,
    notify_new_comment,
    notify_mentions,
)

log = get_logger(__name__)
db = Database()

notifications_bp = Blueprint('notifications', __name__)


# ============================================================
# API: список уведомлений
# ============================================================

@notifications_bp.route('/api/notifications')
@login_required
def get_notifications():
    try:
        user_id = session.get('user_id')
        rows = db.query('''
            SELECT * FROM notifications
            WHERE user_id = ?
            ORDER BY created_date DESC
            LIMIT 100
        ''', [user_id])

        unread_count = db.query(
            'SELECT COUNT(*) AS count FROM notifications '
            'WHERE user_id = ? AND is_read = 0',
            [user_id], one=True,
        )['count']

        return jsonify({
            'notifications': [dict(n) for n in rows],
            'unread_count': unread_count,
        })
    except Exception as e:
        log.exception('Ошибка get_notifications')
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/api/notifications/unread-count')
@login_required
def get_unread_count():
    try:
        user_id = session.get('user_id')
        unread = db.query(
            'SELECT COUNT(*) AS count FROM notifications '
            'WHERE user_id = ? AND is_read = 0',
            [user_id], one=True,
        )['count']
        return jsonify({'unread_count': unread})
    except Exception as e:
        log.exception('Ошибка get_unread_count')
        return jsonify({'error': str(e)}), 500


@notifications_bp.route(
    '/api/notifications/<int:notification_id>/read', methods=['POST']
)
@login_required
def mark_notification_read(notification_id):
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [notification_id, user_id],
        )
        return jsonify({'success': True})
    except Exception as e:
        log.exception('Ошибка mark_notification_read')
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 '
            'WHERE user_id = ? AND is_read = 0',
            [user_id],
        )
        return jsonify({'success': True})
    except Exception as e:
        log.exception('Ошибка mark_all_notifications_read')
        return jsonify({'error': str(e)}), 500


# ============================================================
# SSE: поток новых уведомлений
# ============================================================

@notifications_bp.route('/api/notifications/stream')
@login_required
def notifications_stream():
    """
    Server-Sent Events: поток новых уведомлений для текущего пользователя.

    ⚠️ Требует gunicorn с gevent или gthread:
        gunicorn -k gevent --workers 2 ...
        или
        gunicorn --threads 4 --workers 2 ...

    В Nginx для этой локации:
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    """
    user_id = session.get('user_id')

    @stream_with_context
    def event_stream():
        last_id = 0

        yield 'retry: 5000\n\n'
        yield ': connected\n\n'

        idle_ticks = 0
        MAX_IDLE = 10  # 10 * 3 сек = 30 сек между keep-alive

        while True:
            try:
                rows = db.query('''
                    SELECT * FROM notifications
                    WHERE user_id = ? AND id > ?
                    ORDER BY id ASC
                    LIMIT 50
                ''', [user_id, last_id])

                if rows:
                    for r in rows:
                        last_id = r['id']
                        payload = {
                            'id': r['id'],
                            'title': r['title'],
                            'message': r['message'],
                            'notification_type': r['notification_type'],
                            'task_id': r['task_id'],
                            'created_date': r['created_date'],
                        }
                        yield (
                            f'data: '
                            f'{json.dumps(payload, ensure_ascii=False)}\n\n'
                        )
                    idle_ticks = 0
                else:
                    idle_ticks += 1
                    if idle_ticks >= MAX_IDLE:
                        yield ': keep-alive\n\n'
                        idle_ticks = 0

                time.sleep(3)

            except GeneratorExit:
                log.debug(f'[SSE] Клиент user_id={user_id} отключился')
                break
            except Exception as e:
                log.exception(f'[SSE] Ошибка: {e}')
                break

    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',  # отключить буферизацию в Nginx
            'Connection': 'keep-alive',
        },
    )