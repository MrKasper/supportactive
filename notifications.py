# notifications.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для уведомлений
notifications_bp = Blueprint('notifications', __name__)

# Инициализация базы данных
db = Database()


# ============= ДЕКОРАТОР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ =============
def login_required(f):
    """Декоратор для проверки авторизации пользователя"""

    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Необходима авторизация'}), 401
        return f(*args, **kwargs)

    decorated_function.__name__ = f.__name__
    return decorated_function


# ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============

def create_notification(user_id, task_id, title, message, notification_type):
    """Создание уведомления для пользователя"""
    try:
        db.execute('''
            INSERT INTO notifications (user_id, task_id, title, message, notification_type, is_read, created_date)
            VALUES (?, ?, ?, ?, ?, 0, ?)
        ''', [
            user_id,
            task_id,
            title,
            message,
            notification_type,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])
    except Exception as e:
        print(f"Ошибка создания уведомления: {e}")


def notify_new_task(task_id, task_data):
    """Уведомление о новой заявке"""
    # Уведомляем администраторов
    admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
    for admin in admins:
        create_notification(
            admin['id'],
            task_id,
            'Новая заявка',
            f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... от {task_data.get("from_user", "Неизвестно")}',
            'new_task'
        )

    # Уведомляем техника-исполнителя
    if task_data.get('executor'):
        executor = db.query("SELECT id FROM users WHERE full_name = ? AND is_active = 1", [task_data['executor']],
                            one=True)
        if executor:
            create_notification(
                executor['id'],
                task_id,
                'Вы назначены исполнителем',
                f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... назначена вам',
                'new_task'
            )

    # Уведомляем техника-помощника
    if task_data.get('assistant'):
        assistant = db.query("SELECT id FROM users WHERE full_name = ? AND is_active = 1", [task_data['assistant']],
                             one=True)
        if assistant:
            create_notification(
                assistant['id'],
                task_id,
                'Вы назначены помощником',
                f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... вы назначены помощником',
                'new_task'
            )


def notify_task_taken(task_id, task_data):
    """Уведомление о взятии заявки в работу"""
    # Уведомляем администраторов
    admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
    for admin in admins:
        create_notification(
            admin['id'],
            task_id,
            'Заявка взята в работу',
            f'Заявка №{task_id} взята в работу исполнителем {task_data.get("executor", "")}',
            'task_taken'
        )

    # Уведомляем создателя заявки
    if task_data.get('created_by'):
        create_notification(
            task_data['created_by'],
            task_id,
            'Заявка взята в работу',
            f'Ваша заявка №{task_id} взята в работу исполнителем {task_data.get("executor", "")}',
            'task_taken'
        )


def notify_task_completed(task_id, task_data):
    """Уведомление о выполнении заявки"""
    # Уведомляем администраторов
    admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
    for admin in admins:
        create_notification(
            admin['id'],
            task_id,
            'Заявка выполнена',
            f'Заявка №{task_id} выполнена исполнителем {task_data.get("executor", "")}',
            'task_completed'
        )

    # Уведомляем создателя заявки
    if task_data.get('created_by'):
        create_notification(
            task_data['created_by'],
            task_id,
            'Заявка выполнена',
            f'Ваша заявка №{task_id} выполнена',
            'task_completed'
        )


# ============= API ДЛЯ УВЕДОМЛЕНИЙ =============

@notifications_bp.route('/api/notifications')
@login_required
def get_notifications():
    """Получение уведомлений текущего пользователя"""
    try:
        user_id = session.get('user_id')
        notifications = db.query('''
            SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_date DESC 
            LIMIT 50
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
        return jsonify({'error': f'Ошибка получения уведомлений: {str(e)}'}), 500


@notifications_bp.route('/api/notifications/unread-count')
@login_required
def get_unread_count():
    """Получение количества непрочитанных уведомлений"""
    try:
        user_id = session.get('user_id')
        unread_count = db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            [user_id], one=True
        )['count']
        return jsonify({'unread_count': unread_count})

    except Exception as e:
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


@notifications_bp.route('/api/notifications/<int:notification_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notification_id):
    """Отметить уведомление как прочитанное"""
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [notification_id, user_id]
        )
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500


@notifications_bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_notifications_read():
    """Отметить все уведомления как прочитанные"""
    try:
        user_id = session.get('user_id')
        db.execute(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
            [user_id]
        )
        return jsonify({'success': True})

    except Exception as e:
        return jsonify({'error': f'Ошибка: {str(e)}'}), 500