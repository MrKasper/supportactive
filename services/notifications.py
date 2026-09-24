# services/notifications.py
"""
Сервис уведомлений: создание, группировка, Web Push.
Без HTTP — только бизнес-логика.

Исправления:
  • Гонка при группировке — теперь всё в одной транзакции.
  • Автор действия не получает уведомление о своём действии.
  • Уведомления «Заявка выполнена» больше не спамят.
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
# БАЗОВОЕ СОЗДАНИЕ (с группировкой и защитой от гонок)
# ============================================================

def create_notification(user_id, task_id, title, message, notification_type,
                        actor_id=None):
    """
    Создаёт уведомление с группировкой по заявке.

    Группировка: если есть непрочитанное по этой заявке у этого
    пользователя — обновляем его (count++, новое время).

    Защита от гонки: SELECT + UPDATE/INSERT в одной транзакции
    с BEGIN IMMEDIATE.

    actor_id: ID пользователя, совершившего действие.
              Если actor_id == user_id — уведомление не отправляем.
    """
    if actor_id is not None and actor_id == user_id:
        # Не уведомляем человека о его собственном действии
        return

    try:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            # Ищем непрочитанное уведомление по этой заявке
            if task_id:
                existing = tx.query('''
                    SELECT id, count FROM notifications
                    WHERE user_id = ? AND task_id = ? AND is_read = 0
                    ORDER BY id DESC LIMIT 1
                ''', [user_id, task_id], one=True)
            else:
                existing = tx.query('''
                    SELECT id, count FROM notifications
                    WHERE user_id = ?
                      AND (task_id IS NULL OR task_id = 0)
                      AND notification_type = ?
                      AND is_read = 0
                    ORDER BY id DESC LIMIT 1
                ''', [user_id, notification_type], one=True)

            if existing:
                current_count = existing['count'] or 1
                tx.execute('''
                    UPDATE notifications
                    SET title = ?, message = ?, notification_type = ?,
                        count = ?, created_date = ?
                    WHERE id = ?
                ''', [
                    title, message, notification_type,
                    current_count + 1, now, existing['id'],
                ])
            else:
                tx.execute('''
                    INSERT INTO notifications
                        (user_id, task_id, title, message, notification_type,
                         is_read, count, created_date)
                    VALUES (?, ?, ?, ?, ?, 0, 1, ?)
                ''', [
                    user_id, task_id, title, message, notification_type, now,
                ])

        # Web Push — вне транзакции
        try:
            from webpush import send_web_push
            url = f'/?task={task_id}' if task_id else '/'
            send_web_push(
                user_id, title, message,
                url=url, tag=f'task-{task_id}' if task_id else 'general',
            )
        except Exception as push_err:
            log.warning(f'Ошибка Web Push: {push_err}')

    except Exception as e:
        log.exception(f'Ошибка создания уведомления: {e}')


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _get_admins(exclude_user_ids=None):
    """Возвращает список админов, исключая указанные ID."""
    exclude = set(exclude_user_ids or [])
    rows = db.query(
        "SELECT id FROM users WHERE role = ? AND is_active = 1",
        [ROLE_ADMIN],
    )
    return [r for r in rows if r['id'] not in exclude]


def _find_user_by_name(full_name):
    if not full_name:
        return None
    return db.query(
        "SELECT id FROM users WHERE full_name = ? AND is_active = 1",
        [full_name], one=True,
    )


def _preview(text, length=50):
    """Короткий текст для уведомления."""
    text = (text or '').strip()
    if len(text) <= length:
        return text
    return text[:length] + '...'


# ============================================================
# СОБЫТИЯ ЗАЯВОК
# ============================================================

def notify_new_task(task_id, task_data, actor_id=None):
    """
    Уведомление о новой заявке:
      • админам (кроме автора действия)
      • исполнителю (если назначен и не совпадает с автором)
      • помощнику
    """
    try:
        notified = set()
        description = _preview(task_data.get('description'), 50)
        from_user = task_data.get('from_user') or 'Неизвестно'

        # Администраторам (кроме actor_id)
        for admin in _get_admins(exclude_user_ids=[actor_id]):
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Новая заявка',
                    f'Заявка №{task_id}: {description} от {from_user}',
                    NOTIFY_NEW_TASK,
                    actor_id=actor_id,
                )
                notified.add(admin['id'])

        # Исполнителю
        executor = _find_user_by_name(task_data.get('executor'))
        if executor and executor['id'] not in notified:
            create_notification(
                executor['id'], task_id,
                'Вы назначены исполнителем',
                f'Заявка №{task_id}: {description}',
                NOTIFY_NEW_TASK,
                actor_id=actor_id,
            )
            notified.add(executor['id'])

        # Помощнику
        assistant = _find_user_by_name(task_data.get('assistant'))
        if assistant and assistant['id'] not in notified:
            create_notification(
                assistant['id'], task_id,
                'Вы назначены помощником',
                f'Заявка №{task_id}: {description}',
                NOTIFY_NEW_TASK,
                actor_id=actor_id,
            )
            notified.add(assistant['id'])

    except Exception as e:
        log.exception(f'Ошибка notify_new_task: {e}')


def notify_task_taken(task_id, task_data, actor_id=None):
    """
    Уведомление о взятии заявки в работу:
      • админам (кроме actor_id)
      • создателю заявки (если не совпадает с actor_id)
    """
    try:
        notified = set()
        executor = task_data.get('executor', '')

        for admin in _get_admins(exclude_user_ids=[actor_id]):
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка взята в работу',
                    f'Заявка №{task_id} — исполнитель {executor}',
                    NOTIFY_TASK_TAKEN,
                    actor_id=actor_id,
                )
                notified.add(admin['id'])

        created_by = task_data.get('created_by')
        if created_by and created_by not in notified:
            create_notification(
                created_by, task_id,
                'Заявка взята в работу',
                f'Ваша заявка №{task_id} — исполнитель {executor}',
                NOTIFY_TASK_TAKEN,
                actor_id=actor_id,
            )
            notified.add(created_by)

    except Exception as e:
        log.exception(f'Ошибка notify_task_taken: {e}')


def notify_task_completed(task_id, task_data, actor_id=None):
    """
    Уведомление о выполнении заявки:
      • админам, КРОМЕ того, кто закрыл
      • создателю заявки, если это не он закрыл

    ⚠️ Если админ закрыл сам — он НЕ получает уведомление о своём действии.
    """
    try:
        notified = set()
        executor = task_data.get('executor', '')

        # Админам — исключая actor_id
        for admin in _get_admins(exclude_user_ids=[actor_id]):
            if admin['id'] not in notified:
                create_notification(
                    admin['id'], task_id,
                    'Заявка выполнена',
                    f'Заявка №{task_id} — исполнитель {executor}',
                    NOTIFY_TASK_COMPLETED,
                    actor_id=actor_id,
                )
                notified.add(admin['id'])

        # Создателю заявки — если не он закрыл
        created_by = task_data.get('created_by')
        if (created_by
                and created_by != actor_id
                and created_by not in notified):
            create_notification(
                created_by, task_id,
                'Ваша заявка выполнена',
                f'Заявка №{task_id} выполнена',
                NOTIFY_TASK_COMPLETED,
                actor_id=actor_id,
            )
            notified.add(created_by)

    except Exception as e:
        log.exception(f'Ошибка notify_task_completed: {e}')


# ============================================================
# КОММЕНТАРИИ
# ============================================================

def notify_new_comment(comment_id, task_id, task, author_id, text_preview,
                       actor_id=None):
    """
    Уведомление о новом комментарии.

    По умолчанию actor_id = author_id (автор комментария).
    Автор НЕ получает своё же уведомление.
    """
    if actor_id is None:
        actor_id = author_id

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

        # Администраторы — всегда (кроме автора)
        for a in _get_admins(exclude_user_ids=[actor_id]):
            if a['id'] not in notified:
                create_notification(
                    a['id'], task_id,
                    'Новый комментарий',
                    f'Заявка №{task_id}: {preview}',
                    NOTIFY_NEW_COMMENT,
                    actor_id=actor_id,
                )
                notified.add(a['id'])

        executor = _find_user_by_name(task.get('executor'))

        # Внутренние — только админам и исполнителю
        if is_internal:
            if executor and executor['id'] not in notified:
                create_notification(
                    executor['id'], task_id,
                    'Внутренний комментарий',
                    f'Заявка №{task_id}: {preview}',
                    NOTIFY_NEW_COMMENT,
                    actor_id=actor_id,
                )
                notified.add(executor['id'])
            return

        # Исполнитель
        if executor and executor['id'] not in notified:
            create_notification(
                executor['id'], task_id,
                'Новый комментарий',
                f'Заявка №{task_id}: {preview}',
                NOTIFY_NEW_COMMENT,
                actor_id=actor_id,
            )
            notified.add(executor['id'])

        # Создатель заявки
        created_by = task.get('created_by')
        if created_by and created_by not in notified:
            create_notification(
                created_by, task_id,
                'Новый комментарий к вашей заявке',
                f'Заявка №{task_id}: {preview}',
                NOTIFY_NEW_COMMENT,
                actor_id=actor_id,
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
                actor_id=author_id,
            )
    except Exception as e:
        log.exception(f'Ошибка notify_mentions: {e}')