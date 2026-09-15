# excel.py
from flask import Blueprint, request, jsonify, session, send_file
from database import Database
from datetime import datetime
from utils import login_required, sanitize_csv_value
import io
import csv

# Создаем Blueprint для отчетов
excel_bp = Blueprint('excel', __name__)

# Инициализация базы данных
db = Database()


# ============= API ДЛЯ ОТЧЕТОВ =============

@excel_bp.route('/api/report/tasks')
@login_required
def get_task_report():
    """Получение отчета по задачам"""
    try:
        status_stats = db.query('''
            SELECT status, COUNT(*) as count 
            FROM tasks 
            GROUP BY status
        ''')

        executor_stats = db.query('''
            SELECT executor, 
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'Выполнено' THEN 1 ELSE 0 END) as completed,
                   SUM(CASE WHEN status IN ('Новое', 'В работе') THEN 1 ELSE 0 END) as active
            FROM tasks 
            WHERE executor != ''
            GROUP BY executor
            ORDER BY total DESC
        ''')

        monthly_stats = db.query('''
            SELECT strftime('%Y-%m', created_date) as month,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'Выполнено' THEN 1 ELSE 0 END) as completed
            FROM tasks 
            GROUP BY month
            ORDER BY month DESC
            LIMIT 12
        ''')

        return jsonify({
            'status_stats': [dict(stat) for stat in status_stats],
            'executor_stats': [dict(stat) for stat in executor_stats],
            'monthly_stats': [dict(stat) for stat in monthly_stats]
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения отчета: {str(e)}'}), 500


def _build_tasks_query(args):
    """Общая сборка SQL-запроса с фильтрами для экспорта и печати."""
    work_type = args.get('work_type', '')
    cabinet = args.get('cabinet', '')
    status = args.get('status', '')
    user = args.get('user', '')
    date_from = args.get('date_from', '')
    date_to = args.get('date_to', '')

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

    query += ' ORDER BY created_date DESC'
    return query, params


@excel_bp.route('/api/report/tasks/excel')
@login_required
def export_tasks_excel():
    """Экспорт заявок в CSV с защитой от formula injection."""
    try:
        query, params = _build_tasks_query(request.args)
        tasks = db.query(query, params)

        # Создаем CSV файл в памяти
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)

        # Заголовки
        writer.writerow([
            '№',
            'Дата создания',
            'Срок выполнения',
            'От кого',
            'Кабинет',
            'Описание работы',
            'Тип работы',
            'Статус',
            'Приоритет',
            'Исполнитель',
            'Помощник'
        ])

        # Данные — каждое значение проходит через sanitize_csv_value
        for i, task in enumerate(tasks, 1):
            writer.writerow([
                i,
                sanitize_csv_value(task['created_date']),
                sanitize_csv_value(task['deadline']),
                sanitize_csv_value(task['from_user']),
                sanitize_csv_value(task['cabinet']),
                sanitize_csv_value(task['description']),
                sanitize_csv_value(task['work_type']),
                sanitize_csv_value(task['status']),
                sanitize_csv_value(task['priority']),
                sanitize_csv_value(task['executor']),
                sanitize_csv_value(task['assistant']),
            ])

        output.seek(0)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8-sig')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'export_{timestamp}.csv'
        )

    except Exception as e:
        return jsonify({'error': f'Ошибка экспорта: {str(e)}'}), 500


@excel_bp.route('/api/report/tasks/print')
@login_required
def get_tasks_for_print():
    """Получение заявок для печати"""
    try:
        query, params = _build_tasks_query(request.args)
        tasks = db.query(query, params)
        tasks_list = [dict(task) for task in tasks]

        return jsonify({
            'tasks': tasks_list,
            'total': len(tasks_list),
            'export_date': datetime.now().strftime('%d.%m.%Y %H:%M')
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения данных для печати: {str(e)}'}), 500