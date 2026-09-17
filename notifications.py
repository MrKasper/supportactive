# notifications.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from utils import login_required
from logger import get_logger

log = get_logger(__name__)

notifications_bp = Blueprint('notifications', __name__)
db = Database()


# ============================================================
# СОЗДАНИЕ УВЕДОМЛЕНИЙ
# ============================================================

def create_notification(user_id, task_id, title, message, notification_type):
    """
    Создание уведомления с группировкой по заявке.

    Логика:
      • Если у пользователя уже есть НЕПРОЧИТАННОЕ уведомление
        по этой заявке — обновляем его:
          - title / message → последнее событие
          - created_date → текущее время
          - count += 1
          - notification_type → последний тип (для иконки)
      • Иначе — создаём новое.
    """
    try:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Ищем существующее непрочитанное уведомление по этой заявке
        existing = None
        if task_id:
            existing = db.query('''
                SELECT id, count FROM notifications
                WHERE user_id = ? AND task_id = ? AND is_read = 0
                ORDER BY id DESC LIMIT 1
            ''', [user_id, task_id], one=True)
        else:
            # Для уведомлений без task_id (например, системных)
            # группируем по типу
            existing = db.query('''
                SELECT id, count FROM notifications
                WHERE user_id = ? AND (task_id IS NULL OR task_id = 0)
                      AND notification_type = ? AND is_read = 0
                ORDER BY id DESC LIMIT 1
            ''', [user_id, notification_type], one=True)

        if existing:
            # Обновляем существующее
            current_count = existing['count'] or 1
            db.execute('''
                UPDATE notifications
                SET title = ?,
                    message = ?,
                    notification_type = ?,
                    count = ?,
                    created_date = ?
                WHERE id = ?
            ''', [title, message, notification_type, current_count + 1, now, existing['id']])
            log.debug(f'Обновлено уведомление #{existing["id"]} (×{current_count + 1}) для user_id={user_id}')
        else:
            # Создаём новое
            db.execute('''
                INSERT INTO notifications
                    (user_id, task_id, title, message, notification_type,
                     is_read, count, created_date)
                VALUES (?, ?, ?, ?, ?, 0, 1, ?)
            ''', [user_id, task_id, title, message, notification_type, now])
            log.debug(f'Создано новое уведомление для user_id={user_id}, task_id={task_id}')

        # Web Push
        try:
            from webpush import send_web_push
            url = f'/?task={task_id}' if task_id else '/'
            send_web_push(user_id, title, message, url=url,
                          tag=f'task-{task_id}')  # Один tag на заявку → обновляет на телефоне
        except Exception as push_err:
            print(f"[Push] Ошибка: {push_err}")

    except Exception as e:
        log.exception(f'Ошибка создания уведомления: {e}')


# ============================================================
# ХЕЛПЕРЫ ДЛЯ РАЗНЫХ СОБЫТИЙ
# ============================================================

def notify_new_task(task_id, task_data):
    """Уведомление о новой заявке."""
    try:
        notified = set()
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Новая заявка',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... '
                    f'от {task_data.get("from_user", "Неизвестно")}',
                    'new_task'
                )
                notified.add(admin['id'])

        if task_data.get('executor'):
            executor = db.query(
                "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
                [task_data['executor']], one=True
            )
            if executor and executor['id'] not in notified:
                create_notification(
                    executor['id'], task_id,
                    'Вы назначены исполнителем',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}...',
                    'new_task'
                )
                notified.add(executor['id'])

        if task_data.get('assistant'):
            assistant = db.query(
                "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
                [task_data['assistant']], one=True
            )
            if assistant and assistant['id'] not in notified:
                create_notification(
                    assistant['id'], task_id,
                    'Вы назначены помощником',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}...',
                    'new_task'
                )
                notified.add(assistant['id'])
    except Exception as e:
        log.exception(f'Ошибка notify_new_task: {e}')


def notify_task_taken(task_id, task_data):
    """Уведомление о взятии заявки в работу."""
    try:
        notified = set()
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка взята в работу',
                    f'Заявка №{task_id} — исполнитель {task_data.get("executor", "")}',
                    'task_taken'
                )
                notified.add(admin['id'])

        if task_data.get('created_by'):
            if task_data['created_by'] not in notified:
                create_notification(
                    task_data['created_by'], task_id,
                    'Заявка взята в работу',
                    f'Ваша заявка №{task_id} — исполнитель {task_data.get("executor", "")}',
                    'task_taken'
                )
                notified.add(task_data['created_by'])
    except Exception as e:
        log.exception(f'Ошибка notify_task_taken: {e}')


def notify_task_completed(task_id, task_data):
    """Уведомление о выполнении заявки."""
    try:
        notified = set()
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка выполнена',
                    f'Заявка №{task_id} — исполнитель {task_data.get("executor", "")}',
                    'task_completed'
                )
                notified.add(admin['id'])

        if task_data.get('created_by'):
            if task_data['created_by'] not in notified:
                create_notification(
                    task_data['created_by'], task_id,
                    'Ваша заявка выполнена',
                    f'Заявка №{task_id} выполнена',
                    'task_completed'
                )
                notified.add(task_data['created_by'])
    except Exception as e:
        log.exception(f'Ошибка notify_task_completed: {e}')


def notify_new_comment(comment_id, task_id, task, author_id, text_preview):
    """
    Уведомление о новом комментарии.
    Группируется вместе с другими событиями заявки.
    """
    try:
        notified = set()

        c = db.query('SELECT is_internal FROM task_comments WHERE id = ?',
                     [comment_id], one=True)
        is_internal = bool(c['is_internal']) if c else False

        preview = (text_preview or '')[:60]
        if text_preview and len(text_preview) > 60:
            preview += '...'

        # Администраторы — всегда
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for a in admins:
            if a['id'] != author_id and a['id'] not in notified:
                create_notification(
                    a['id'], task_id,
                    'Новый комментарий',
                    f'Заявка №{task_id}: {preview}',
                    'new_comment'
                )
                notified.add(a['id'])

        # Внутренние — только админам и исполнителю
        if is_internal:
            if task.get('executor'):
                ex = db.query(
                    "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
                    [task['executor']], one=True
                )
                if ex and ex['id'] != author_id and ex['id'] not in notified:
                    create_notification(
                        ex['id'], task_id,
                        'Внутренний комментарий',
                        f'Заявка №{task_id}: {preview}',
                        'new_comment'
                    )
                    notified.add(ex['id'])
            return

        # Исполнитель
        if task.get('executor'):
            ex = db.query(
                "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
                [task['executor']], one=True
            )
            if ex and ex['id'] != author_id and ex['id'] not in notified:
                create_notification(
                    ex['id'], task_id,
                    'Новый комментарий',
                    f'Заявка №{task_id}: {preview}',
                    'new_comment'
                )
                notified.add(ex['id'])

        # Создатель заявки
        if task.get('created_by') and task['created_by'] != author_id:
            if task['created_by'] not in notified:
                create_notification(
                    task['created_by'], task_id,
                    'Новый комментарий к вашей заявке',
                    f'Заявка №{task_id}: {preview}',
                    'new_comment'
                )
                notified.add(task['created_by'])

    except Exception as e:
        log.exception(f'Ошибка notify_new_comment: {e}')


# ============================================================
# API
# ============================================================

@notifications_bp.route('/api/notifications')
@login_required
def get_notifications():
    try:
        user_id = session.get('user_id')
        notifications = db.query('''
            SELECT * FROM notifications
            WHERE user_id = ?
            ORDER BY created_date DESC
            LIMIT 100
        ''', [user_id])

        unread_count = db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [user_id], one=True
        )['count']

        return jsonify({
            'notifications': [dict(n) for n in notifications],
            'unread_count': unread_count
        })
    except Exception as e:
        log.exception('Ошибка get_notifications')
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/api/notifications/unread-count')
@login_required
def get_unread_count():
    try:
        user_id = session.get('user_id')
        unread_count = db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [user_id], one=True
        )['count']
        return jsonify({'unread_count': unread_count})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notification_id):
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [notification_id, user_id]
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
            [user_id]
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500