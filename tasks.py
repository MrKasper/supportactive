# tasks.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для заявок
tasks_bp = Blueprint('tasks', __name__)

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


# ============= ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ =============
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
    """Уведомление о новой заявке (одно уведомление на пользователя)"""
    try:
        notified_users = set()  # Множество для отслеживания уже уведомленных пользователей

        # Уведомляем администраторов
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified_users:
                create_notification(
                    admin['id'],
                    task_id,
                    'Новая заявка',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... от {task_data.get("from_user", "Неизвестно")}',
                    'new_task'
                )
                notified_users.add(admin['id'])

        # Уведомляем техника-исполнителя
        if task_data.get('executor'):
            executor = db.query("SELECT id FROM users WHERE full_name = ? AND is_active = 1", [task_data['executor']],
                                one=True)
            if executor and executor['id'] not in notified_users:
                create_notification(
                    executor['id'],
                    task_id,
                    'Вы назначены исполнителем',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... назначена вам',
                    'new_task'
                )
                notified_users.add(executor['id'])

        # Уведомляем техника-помощника
        if task_data.get('assistant'):
            assistant = db.query("SELECT id FROM users WHERE full_name = ? AND is_active = 1", [task_data['assistant']],
                                 one=True)
            if assistant and assistant['id'] not in notified_users:
                create_notification(
                    assistant['id'],
                    task_id,
                    'Вы назначены помощником',
                    f'Заявка №{task_id}: {task_data.get("description", "")[:50]}... вы назначены помощником',
                    'new_task'
                )
                notified_users.add(assistant['id'])
    except Exception as e:
        print(f"Ошибка отправки уведомлений о новой заявке: {e}")


def notify_task_taken(task_id, task_data):
    """Уведомление о взятии заявки в работу (одно уведомление на пользователя)"""
    try:
        notified_users = set()

        # Уведомляем администраторов
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified_users:
                create_notification(
                    admin['id'],
                    task_id,
                    'Заявка взята в работу',
                    f'Заявка №{task_id} взята в работу исполнителем {task_data.get("executor", "")}',
                    'task_taken'
                )
                notified_users.add(admin['id'])

        # Уведомляем создателя заявки (если это не администратор)
        if task_data.get('created_by'):
            if task_data['created_by'] not in notified_users:
                create_notification(
                    task_data['created_by'],
                    task_id,
                    'Заявка взята в работу',
                    f'Ваша заявка №{task_id} взята в работу исполнителем {task_data.get("executor", "")}',
                    'task_taken'
                )
                notified_users.add(task_data['created_by'])
    except Exception as e:
        print(f"Ошибка отправки уведомлений о взятии заявки: {e}")


def notify_task_completed(task_id, task_data):
    """Уведомление о выполнении заявки (одно уведомление на пользователя)"""
    try:
        notified_users = set()

        # Уведомляем администраторов
        admins = db.query("SELECT id FROM users WHERE role = 'Администратор' AND is_active = 1")
        for admin in admins:
            if admin['id'] not in notified_users:
                create_notification(
                    admin['id'],
                    task_id,
                    'Заявка выполнена',
                    f'Заявка №{task_id} выполнена исполнителем {task_data.get("executor", "")}',
                    'task_completed'
                )
                notified_users.add(admin['id'])

        # Уведомляем создателя заявки (если это не администратор)
        if task_data.get('created_by'):
            if task_data['created_by'] not in notified_users:
                create_notification(
                    task_data['created_by'],
                    task_id,
                    'Заявка выполнена',
                    f'Ваша заявка №{task_id} выполнена',
                    'task_completed'
                )
                notified_users.add(task_data['created_by'])
    except Exception as e:
        print(f"Ошибка отправки уведомлений о выполнении заявки: {e}")


# ============= API ДЛЯ СТАТИСТИКИ =============

@tasks_bp.route('/api/statistics')
@login_required
def get_statistics():
    """Получение статистики по заявкам"""
    try:
        total_tasks = db.query('SELECT COUNT(*) as count FROM tasks', one=True)['count']
        completed_tasks = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status = "Выполнено"',
            one=True
        )['count']
        new_tasks = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status = "Новое"',
            one=True
        )['count']
        in_progress_tasks = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status = "В работе"',
            one=True
        )['count']
        cancelled_tasks = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status = "Отменено"',
            one=True
        )['count']

        user_name = session.get('user_name')
        user_total_tasks = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE executor = ?',
            [user_name], one=True
        )['count']
        user_completed = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status = "Выполнено" AND executor = ?',
            [user_name], one=True
        )['count']
        user_in_progress = db.query(
            'SELECT COUNT(*) as count FROM tasks WHERE status IN ("Новое", "В работе") AND executor = ?',
            [user_name], one=True
        )['count']

        work_type_stats = db.query('''
            SELECT work_type, COUNT(*) as count 
            FROM tasks 
            WHERE work_type != "" 
            GROUP BY work_type 
            ORDER BY count DESC
        ''')
        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) as count 
            FROM tasks 
            WHERE cabinet != "" 
            GROUP BY cabinet 
            ORDER BY count DESC 
            LIMIT 10
        ''')
        overdue_tasks = db.query('''
            SELECT COUNT(*) as count 
            FROM tasks 
            WHERE status NOT IN ("Выполнено", "Отменено") 
            AND deadline < datetime('now')
        ''', one=True)['count']

        return jsonify({
            'total': total_tasks,
            'completed': completed_tasks,
            'new': new_tasks,
            'in_progress': in_progress_tasks,
            'cancelled': cancelled_tasks,
            'new_or_progress': new_tasks + in_progress_tasks,
            'user_completed': user_completed,
            'user_in_progress': user_in_progress,
            'user_total': user_total_tasks,
            'overdue': overdue_tasks,
            'work_type_stats': [dict(stat) for stat in work_type_stats],
            'cabinet_stats': [dict(stat) for stat in cabinet_stats]
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения статистики: {str(e)}'}), 500


# ============= API ДЛЯ РАБОТЫ С ЗАЯВКАМИ =============

@tasks_bp.route('/api/tasks')
@login_required
def get_tasks():
    """Получение списка заявок с фильтрацией и сортировкой"""
    try:
        work_type = request.args.get('work_type', '')
        cabinet = request.args.get('cabinet', '')
        status = request.args.get('status', '')
        user = request.args.get('user', '')
        priority = request.args.get('priority', '')
        date_from = request.args.get('date_from', '')
        date_to = request.args.get('date_to', '')
        search = request.args.get('search', '')
        sort_by = request.args.get('sort_by', 'created_date')
        sort_order = request.args.get('sort_order', 'DESC')
        created_by = request.args.get('created_by', '')

        query = 'SELECT * FROM tasks WHERE 1=1'
        params = []

        if work_type:
            query += ' AND work_type = ?'
            params.append(work_type)

        if cabinet:
            query += ' AND cabinet LIKE ?'
            params.append(f'%{cabinet}%')

        if status:
            query += ' AND status = ?'
            params.append(status)

        if priority:
            query += ' AND priority = ?'
            params.append(priority)

        if user:
            query += ' AND (from_user LIKE ? OR executor LIKE ? OR assistant LIKE ?)'
            search_user = f'%{user}%'
            params.extend([search_user, search_user, search_user])

        if date_from:
            query += ' AND deadline >= ?'
            params.append(date_from)

        if date_to:
            query += ' AND deadline <= ?'
            params.append(date_to)

        if search:
            query += ' AND (description LIKE ? OR from_user LIKE ? OR cabinet LIKE ?)'
            search_term = f'%{search}%'
            params.extend([search_term, search_term, search_term])

        if created_by:
            query += ' AND created_by = ?'
            params.append(created_by)

        allowed_sort_fields = ['created_date', 'deadline', 'status', 'priority', 'from_user', 'cabinet']
        if sort_by not in allowed_sort_fields:
            sort_by = 'created_date'

        if sort_order.upper() not in ['ASC', 'DESC']:
            sort_order = 'DESC'

        query += f' ORDER BY {sort_by} {sort_order}'

        tasks = db.query(query, params)

        tasks_list = []
        for task in tasks:
            task_dict = dict(task)
            if task_dict['status'] not in ['Выполнено', 'Отменено'] and task_dict['deadline']:
                try:
                    deadline_date = datetime.strptime(task_dict['deadline'], '%Y-%m-%d %H:%M:%S')
                    task_dict['is_overdue'] = deadline_date < datetime.now()
                except:
                    task_dict['is_overdue'] = False
            else:
                task_dict['is_overdue'] = False
            tasks_list.append(task_dict)

        return jsonify(tasks_list)

    except Exception as e:
        return jsonify({'error': f'Ошибка получения заявок: {str(e)}'}), 500


@tasks_bp.route('/api/task/<int:task_id>')
@login_required
def get_task(task_id):
    """Получение детальной информации о заявке"""
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'error': 'Заявка не найдена'}), 404
        return jsonify(dict(task))
    except Exception as e:
        return jsonify({'error': f'Ошибка получения заявки: {str(e)}'}), 500


@tasks_bp.route('/api/create_task', methods=['POST'])
@login_required
def create_task():
    """Создание новой заявки"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных для создания заявки'}), 400

        # Валидация обязательных полей
        required_fields = ['description', 'work_type']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'success': False, 'error': f'Поле "{field}" обязательно для заполнения'}), 400

        # Проверяем занятость исполнителя на выбранное время
        executor = data.get('executor', '').strip()
        deadline = data.get('deadline', '').strip()

        print(f"=== ПРОВЕРКА ЗАНЯТОСТИ ===")
        print(f"executor: {executor}")
        print(f"deadline: {deadline}")

        if executor and deadline:
            try:
                # Нормализуем дату из HTML input
                new_deadline_str = deadline.replace('T', ' ') + ':00'
                new_deadline = datetime.strptime(new_deadline_str, '%Y-%m-%d %H:%M:%S')
                print(f"Новая дата: {new_deadline_str}")
            except Exception as e:
                print(f"Ошибка парсинга даты: {e}")
                new_deadline = None

            if new_deadline:
                existing_tasks = db.query('''
                    SELECT id, deadline, description, status FROM tasks 
                    WHERE executor = ? 
                    AND status IN ('Новое', 'В работе')
                ''', [executor])

                print(f"Найдено заявок у {executor}: {len(existing_tasks)}")

                for task in existing_tasks:
                    print(f"---")
                    print(f"Заявка #{task['id']}: deadline={task['deadline']}, status={task['status']}")

                    if not task['deadline']:
                        print(f"  Нет даты, пропускаем")
                        continue

                    try:
                        task_deadline = None
                        # Пробуем разные форматы дат
                        formats_to_try = [
                            '%Y-%m-%d %H:%M:%S',
                            '%Y-%m-%d %H:%M',
                            '%Y-%m-%dT%H:%M:%S',
                            '%Y-%m-%dT%H:%M'
                        ]

                        for fmt in formats_to_try:
                            try:
                                task_deadline = datetime.strptime(task['deadline'], fmt)
                                print(f"  Распарсили с форматом: {fmt}")
                                break
                            except:
                                continue

                        if not task_deadline:
                            print(f"  Не удалось распарсить дату: {task['deadline']}")
                            continue

                        time_diff = abs((new_deadline - task_deadline).total_seconds())
                        print(f"  Дата в БД: {task['deadline']}")
                        print(f"  Разница: {time_diff} сек = {time_diff / 60:.1f} мин")

                        # Проверяем, что заявки в один день
                        if task_deadline.date() == new_deadline.date():
                            print(f"  Заявки в один день!")

                            # Проверяем пересечение времени (разница менее 1 часа)
                            if time_diff < 3600:
                                print(f"  КОНФЛИКТ! Техник занят в это время")
                                return jsonify({
                                    'success': False,
                                    'error': f'Техник в данное время занят! У него уже есть заявка №{task["id"]} на {task["deadline"]}'
                                }), 400
                            else:
                                print(f"  Разница более 1 часа, конфликта нет")
                        else:
                            print(f"  Разные дни, конфликта нет")
                    except Exception as e:
                        print(f"  Ошибка обработки: {e}")

        # Создаем заявку
        print(f"=== СОЗДАНИЕ ЗАЯВКИ ===")

        # Нормализуем дату для сохранения в БД
        normalized_deadline = deadline.replace('T', ' ') + ':00' if deadline else datetime.now().strftime(
            '%Y-%m-%d %H:%M:%S')

        task_id = db.execute('''
            INSERT INTO tasks (
                deadline, from_user, cabinet, description, 
                work_type, priority, executor, assistant, 
                status, created_by, created_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            normalized_deadline,
            data.get('from_user', ''),
            data.get('cabinet', ''),
            data['description'],
            data['work_type'],
            data.get('priority', 'Средний'),
            data.get('executor', ''),
            data.get('assistant', ''),
            'Новое',
            session['user_id'],
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])

        # Отправляем уведомления о новой заявке
        notify_new_task(task_id, {
            'description': data['description'],
            'from_user': data.get('from_user', ''),
            'executor': data.get('executor', ''),
            'assistant': data.get('assistant', '')
        })

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': f'Заявка №{task_id} успешно создана'
        }), 201

    except Exception as e:
        print(f"Ошибка создания заявки: {e}")
        return jsonify({'success': False, 'error': f'Ошибка создания заявки: {str(e)}'}), 500


@tasks_bp.route('/api/update_task/<int:task_id>', methods=['POST'])
@login_required
def update_task(task_id):
    """Обновление заявки"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных для обновления'}), 400

        old_task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not old_task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        db.execute('''
            UPDATE tasks 
            SET deadline = ?, from_user = ?, cabinet = ?, description = ?, 
                status = ?, executor = ?, assistant = ?, work_type = ?, priority = ?
            WHERE id = ?
        ''', [
            data.get('deadline', old_task['deadline']),
            data.get('from_user', old_task['from_user']),
            data.get('cabinet', old_task['cabinet']),
            data.get('description', old_task['description']),
            data.get('status', old_task['status']),
            data.get('executor', old_task['executor']),
            data.get('assistant', old_task['assistant']),
            data.get('work_type', old_task['work_type']),
            data.get('priority', old_task['priority']),
            task_id
        ])

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} успешно обновлена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления заявки: {str(e)}'}), 500


@tasks_bp.route('/api/close_task/<int:task_id>', methods=['POST'])
@login_required
def close_task(task_id):
    """Закрытие заявки"""
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        if task['status'] == 'Выполнено':
            return jsonify({'success': False, 'error': 'Заявка уже закрыта'}), 400

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db.execute('''
            UPDATE tasks 
            SET status = "Выполнено", completed_date = ? 
            WHERE id = ?
        ''', [current_time, task_id])

        updated_task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        notify_task_completed(task_id, dict(updated_task))

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} успешно закрыта',
            'completed_date': current_time
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка закрытия заявки: {str(e)}'}), 500


@tasks_bp.route('/api/task/<int:task_id>/take', methods=['POST'])
@login_required
def take_task(task_id):
    """Взять заявку в работу"""
    try:
        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        if task['status'] != 'Новое':
            return jsonify({'success': False, 'error': 'Заявка уже в работе или закрыта'}), 400

        user_name = session.get('user_name')
        task_deadline = task['deadline']

        # Проверяем занятость техника на время этой заявки
        if task_deadline:
            try:
                new_deadline = datetime.strptime(task_deadline, '%Y-%m-%d %H:%M:%S')
            except:
                new_deadline = None

            if new_deadline:
                # Ищем другие заявки этого техника
                existing_tasks = db.query('''
                    SELECT * FROM tasks 
                    WHERE executor = ? 
                    AND id != ?
                    AND status NOT IN ('Выполнено', 'Отменено')
                    AND deadline IS NOT NULL
                ''', [user_name, task_id])

                for existing in existing_tasks:
                    try:
                        existing_deadline = datetime.strptime(existing['deadline'], '%Y-%m-%d %H:%M:%S')
                    except:
                        continue

                    time_diff = abs((new_deadline - existing_deadline).total_seconds())
                    if time_diff < 3600:
                        return jsonify({
                            'success': False,
                            'error': 'Техник в данное время занят, выберите другое!'
                        }), 400

        db.execute('''
            UPDATE tasks 
            SET status = "В работе", executor = ?
            WHERE id = ?
        ''', [user_name, task_id])

        updated_task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        notify_task_taken(task_id, dict(updated_task))

        return jsonify({
            'success': True,
            'message': 'Заявка взята в работу',
            'new_status': 'В работе',
            'executor': user_name
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка: {str(e)}'}), 500


@tasks_bp.route('/api/delete_task/<int:task_id>', methods=['DELETE'])
@login_required
def delete_task(task_id):
    """Удаление заявки (только для администраторов)"""
    try:
        if session.get('user_role') != 'Администратор':
            return jsonify({'success': False, 'error': 'Недостаточно прав для удаления'}), 403

        task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
        if not task:
            return jsonify({'success': False, 'error': 'Заявка не найдена'}), 404

        db.execute('DELETE FROM notifications WHERE task_id = ?', [task_id])
        db.execute('DELETE FROM tasks WHERE id = ?', [task_id])

        return jsonify({
            'success': True,
            'message': f'Заявка №{task_id} успешно удалена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления заявки: {str(e)}'}), 500


# ============= API ДЛЯ ПОЛУЧЕНИЯ ФИЛЬТРОВ =============

@tasks_bp.route('/api/filters')
@login_required
def get_filters():
    """Получение данных для фильтров"""
    try:
        work_types = [row['name'] for row in db.query(
            'SELECT name FROM problem_types WHERE is_active = 1 ORDER BY name'
        )]
        cabinets = [row['cabinet_number'] for row in db.query(
            'SELECT cabinet_number FROM cabinets WHERE is_active = 1 ORDER BY cabinet_number'
        )]
        statuses = ['Новое', 'В работе', 'Выполнено', 'Отменено']
        priorities = ['Высокий', 'Средний', 'Низкий']
        users = [row['full_name'] for row in db.query(
            'SELECT full_name FROM users WHERE is_active = 1 ORDER BY full_name'
        )]

        return jsonify({
            'work_types': work_types,
            'cabinets': cabinets,
            'statuses': statuses,
            'priorities': priorities,
            'users': users
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения фильтров: {str(e)}'}), 500