# services/notifications.py
"""
Сервис уведомлений: создание, группировка, Web Push.
Без HTTP — только бизнес-логика.
"""
from datetime import datetime

from database import Database
from logger import get_logger
from constants import (
    ROLE_ADMIN,
    NOTIFY_NEW_TASK,
    NOTIFY_TASK_TAKEN,
    NOTIFY_TASK_COMPLETED,
    NOTIFY_NEW_COMMENT,
    NOTIFY_MENTION,
)

log = get_logger(__name__)
db = Database()


# ============================================================
# БАЗОВОЕ СОЗДАНИЕ (с группировкой)
# ============================================================

def create_notification(user_id, task_id, title, message, notification_type):
    """
    Создаёт уведомление с группировкой по заявке.
    Если есть непрочитанное по этой заявке — обновляет его (count++, новое время).
    Плюс отправляет Web Push, если подписки есть.
    """
    try:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if task_id:
            existing = db.query('''
                SELECT id, count FROM notifications
                WHERE user_id = ? AND task_id = ? AND is_read = 0
                ORDER BY id DESC LIMIT 1
            ''', [user_id, task_id], one=True)
        else:
            existing = db.query('''
                SELECT id, count FROM notifications
                WHERE user_id = ? AND (task_id IS NULL OR task_id = 0)
                      AND notification_type = ? AND is_read = 0
                ORDER BY id DESC LIMIT 1
            ''', [user_id, notification_type], one=True)

        if existing:
            current_count = existing['count'] or 1
            db.execute('''
                UPDATE notifications
                SET title = ?, message = ?, notification_type = ?,
                    count = ?, created_date = ?
                WHERE id = ?
            ''', [title, message, notification_type,
                  current_count + 1, now, existing['id']])
        else:
            db.execute('''
                INSERT INTO notifications
                    (user_id, task_id, title, message, notification_type,
                     is_read, count, created_date)
                VALUES (?, ?, ?, ?, ?, 0, 1, ?)
            ''', [user_id, task_id, title, message, notification_type, now])

        # Web Push
        try:
            from webpush import send_web_push
            url = f'/?task={task_id}' if task_id else '/'
            send_web_push(user_id, title, message, url=url, tag=f'task-{task_id}')
        except Exception as push_err:
            log.warning(f'Ошибка Web Push: {push_err}')

    except Exception as e:
        log.exception(f'Ошибка создания уведомления: {e}')


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _get_admins():
    return db.query(
        "SELECT id FROM users WHERE role = ? AND is_active = 1",
        [ROLE_ADMIN],
    )


def _find_user_by_name(full_name):
    if not full_name:
        return None
    return db.query(
        "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
        [full_name], one=True,
    )


# ============================================================
# СОБЫТИЯ ЗАЯВОК
# ============================================================

def notify_new_task(task_id, task_data):
    """Уведомление о новой заявке: админам, исполнителю, помощнику."""
    try:
        notified = set()
        description = (task_data.get('description') or '')[:50]
        from_user = task_data.get('from_user') or 'Неизвестно'

        for admin in _get_admins():
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Новая заявка',
                    f'Заявка №{task_id}: {description}... от {from_user}',
                    NOTIFY_NEW_TASK,
                )
                notified.add(admin['id'])

        executor = _find_user_by_name(task_data.get('executor'))
        if executor and executor['id'] not in notified:
            create_notification(
                executor['id'], task_id,
                'Вы назначены исполнителем',
                f'Заявка №{task_id}: {description}...',
                NOTIFY_NEW_TASK,
            )
            notified.add(executor['id'])

        assistant = _find_user_by_name(task_data.get('assistant'))
        if assistant and assistant['id'] not in notified:
            create_notification(
                assistant['id'], task_id,
                'Вы назначены помощником',
                f'Заявка №{task_id}: {description}...',
                NOTIFY_NEW_TASK,
            )
            notified.add(assistant['id'])
    except Exception as e:
        log.exception(f'Ошибка notify_new_task: {e}')


def notify_task_taken(task_id, task_data):
    """Уведомление о взятии заявки в работу."""
    try:
        notified = set()
        executor = task_data.get('executor', '')

        for admin in _get_admins():
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка взята в работу',
                    f'Заявка №{task_id} — исполнитель {executor}',
                    NOTIFY_TASK_TAKEN,
                )
                notified.add(admin['id'])

        created_by = task_data.get('created_by')
        if created_by and created_by not in notified:
            create_notification(
                created_by, task_id,
                'Заявка взята в работу',
                f'Ваша заявка №{task_id} — исполнитель {executor}',
                NOTIFY_TASK_TAKEN,
            )
            notified.add(created_by)
    except Exception as e:
        log.exception(f'Ошибка notify_task_taken: {e}')


def notify_task_completed(task_id, task_data):
    """Уведомление о выполнении заявки."""
    try:
        notified = set()
        executor = task_data.get('executor', '')

        for admin in _get_admins():
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка выполнена',
                    f'Заявка №{task_id} — исполнитель {executor}',
                    NOTIFY_TASK_COMPLETED,
                )
                notified.add(admin['id'])

        created_by = task_data.get('created_by')
        if created_by and created_by not in notified:
            create_notification(
                created_by, task_id,
                'Ваша заявка выполнена',
                f'Заявка №{task_id} выполнена',
                NOTIFY_TASK_COMPLETED,
            )
            notified.add(created_by)
    except Exception as e:
        log.exception(f'Ошибка notify_task_completed: {e}')


# ============================================================
# КОММЕНТАРИИ
# ============================================================

def notify_new_comment(comment_id, task_id, task, author_id, text_preview):
    """
    Уведомление о новом комментарии:
    - Админы — всегда
    - Исполнитель — да
    - Создатель заявки — да
    - Автор — НЕ получает
    - Внутренние — только админам и исполнителю
    """
    try:
        notified = set()

        c = db.query(
            'SELECT is_internal FROM task_comments WHERE id = ?',
            [comment_id], one=True,
        )
        is_internal = bool(c['is_internal']) if c else False

        preview = (text_preview or '')[:60]
        if text_preview and len(text_preview) > 60:
            preview += '...'

        # Администраторы
        for a in _get_admins():
            if a['id'] != author_id and a['id'] not in notified:
                create_notification(
                    a['id'], task_id,
                    'Новый комментарий',
                    f'Заявка №{task_id}: {preview}',
                    NOTIFY_NEW_COMMENT,
                )
                notified.add(a['id'])

        executor = _find_user_by_name(task.get('executor'))

        # Внутренние — только админам и исполнителю
        if is_internal:
            if executor and executor['id'] != author_id and executor['id'] not in notified:
                create_notification(
                    executor['id'], task_id,
                    'Внутренний комментарий',
                    f'Заявка №{task_id}: {preview}',
                    NOTIFY_NEW_COMMENT,
                )
                notified.add(executor['id'])
            return

        # Исполнитель
        if executor and executor['id'] != author_id and executor['id'] not in notified:
            create_notification(
                executor['id'], task_id,
                'Новый комментарий',
                f'Заявка №{task_id}: {preview}',
                NOTIFY_NEW_COMMENT,
            )
            notified.add(executor['id'])

        # Создатель заявки
        created_by = task.get('created_by')
        if created_by and created_by != author_id and created_by not in notified:
            create_notification(
                created_by, task_id,
                'Новый комментарий к вашей заявке',
                f'Заявка №{task_id}: {preview}',
                NOTIFY_NEW_COMMENT,
            )
            notified.add(created_by)

    except Exception as e:
        log.exception(f'Ошибка notify_new_comment: {e}')


def notify_mentions(comment_id, task_id, task, author_id, user_ids, preview):
    """Уведомления пользователям, упомянутым через @."""
    try:
        if not user_ids:
            return

        preview_text = (preview or '')[:80]
        if preview and len(preview) > 80:
            preview_text += '...'

        for uid in set(user_ids):
            create_notification(
                uid, task_id,
                'Вас упомянули в комментарии',
                f'Заявка №{task_id}: {preview_text}',
                NOTIFY_MENTION,
            )
    except Exception as e:
        log.exception(f'Ошибка notify_mentions: {e}')