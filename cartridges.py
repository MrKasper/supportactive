# cartridges.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для картриджей
cartridges_bp = Blueprint('cartridges', __name__)

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


# ============= API ДЛЯ УПРАВЛЕНИЯ КАРТРИДЖАМИ =============

@cartridges_bp.route('/api/cartridges')
@login_required
def get_cartridges():
    """Получение списка всех записей о замене картриджей"""
    try:
        cartridges = db.query('''
            SELECT id, cabinet, full_name, printer, cartridge, 
                   replacement_dates, notes
            FROM cartridges 
            ORDER BY id DESC
        ''')
        result = []
        for cart in cartridges:
            cart_dict = dict(cart)
            # Преобразуем строку с датами в массив
            if cart_dict['replacement_dates']:
                cart_dict['replacement_dates'] = cart_dict['replacement_dates'].split(',')
            else:
                cart_dict['replacement_dates'] = []
            result.append(cart_dict)
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'Ошибка получения картриджей: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>')
@login_required
def get_cartridge(cartridge_id):
    """Получение информации о конкретной записи"""
    try:
        cartridge = db.query('SELECT * FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'error': 'Запись не найдена'}), 404

        cart_dict = dict(cartridge)
        if cart_dict['replacement_dates']:
            cart_dict['replacement_dates'] = cart_dict['replacement_dates'].split(',')
        else:
            cart_dict['replacement_dates'] = []

        return jsonify(cart_dict)

    except Exception as e:
        return jsonify({'error': f'Ошибка получения записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges', methods=['POST'])
@login_required
def create_cartridge():
    """Добавление новой записи о замене картриджа"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        cabinet = data.get('cabinet', '').strip()
        full_name = data.get('full_name', '').strip()
        printer = data.get('printer', '').strip()
        cartridge = data.get('cartridge', '').strip()
        replacement_dates = data.get('replacement_dates', [])
        notes = data.get('notes', '').strip()

        if not cabinet:
            return jsonify({'success': False, 'error': 'Укажите кабинет'}), 400
        if not printer:
            return jsonify({'success': False, 'error': 'Укажите модель принтера'}), 400
        if not cartridge:
            return jsonify({'success': False, 'error': 'Укажите модель картриджа'}), 400

        # Проверяем, нет ли уже записи с таким же кабинетом, принтером и картриджем
        existing = db.query(
            'SELECT id FROM cartridges WHERE cabinet = ? AND printer = ? AND cartridge = ?',
            [cabinet, printer, cartridge],
            one=True
        )

        if existing:
            return jsonify({
                'success': False,
                'error': 'Запись для этого кабинета с таким принтером и картриджем уже существует. Вы можете отредактировать существующую запись.'
            }), 400

        # Преобразуем массив дат в строку
        dates_str = ','.join(replacement_dates) if replacement_dates else ''

        cartridge_id = db.execute('''
            INSERT INTO cartridges (cabinet, full_name, printer, cartridge, replacement_dates, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', [
            cabinet,
            full_name,
            printer,
            cartridge,
            dates_str,
            notes
        ])

        return jsonify({
            'success': True,
            'cartridge_id': cartridge_id,
            'message': 'Запись о замене картриджа добавлена'
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка добавления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>', methods=['PUT'])
@login_required
def update_cartridge(cartridge_id):
    """Обновление записи о замене картриджа"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        # Проверяем на дубликат при изменении кабинета, принтера или картриджа
        cabinet = data.get('cabinet', old['cabinet']).strip()
        printer = data.get('printer', old['printer']).strip()
        cartridge = data.get('cartridge', old['cartridge']).strip()

        existing = db.query(
            'SELECT id FROM cartridges WHERE cabinet = ? AND printer = ? AND cartridge = ? AND id != ?',
            [cabinet, printer, cartridge, cartridge_id],
            one=True
        )

        if existing:
            return jsonify({
                'success': False,
                'error': 'Запись для этого кабинета с таким принтером и картриджем уже существует.'
            }), 400

        replacement_dates = data.get('replacement_dates', [])
        dates_str = ','.join(replacement_dates) if replacement_dates else ''

        db.execute('''
            UPDATE cartridges 
            SET cabinet = ?, full_name = ?, printer = ?, cartridge = ?, 
                replacement_dates = ?, notes = ?
            WHERE id = ?
        ''', [
            cabinet,
            data.get('full_name', old['full_name']),
            printer,
            cartridge,
            dates_str,
            data.get('notes', old['notes']),
            cartridge_id
        ])

        return jsonify({
            'success': True,
            'message': 'Запись успешно обновлена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>', methods=['DELETE'])
@login_required
def delete_cartridge(cartridge_id):
    """Удаление записи о замене картриджа"""
    try:
        cartridge = db.query('SELECT id FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        db.execute('DELETE FROM cartridges WHERE id = ?', [cartridge_id])

        return jsonify({
            'success': True,
            'message': 'Запись успешно удалена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>/clear-dates', methods=['POST'])
@login_required
def clear_cartridge_dates(cartridge_id):
    """Очистка дат замены картриджа"""
    try:
        cartridge = db.query('SELECT id FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        db.execute('UPDATE cartridges SET replacement_dates = NULL WHERE id = ?', [cartridge_id])

        return jsonify({
            'success': True,
            'message': 'Даты замены очищены'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка очистки дат: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/statistics')
@login_required
def get_cartridge_statistics():
    """Получение статистики по заменам картриджей"""
    try:
        # Общее количество записей
        total = db.query('SELECT COUNT(*) as count FROM cartridges', one=True)['count']

        # Общее количество замен (сумма всех дат)
        all_records = db.query(
            'SELECT replacement_dates FROM cartridges WHERE replacement_dates IS NOT NULL AND replacement_dates != ""')
        total_replacements = 0
        for record in all_records:
            if record['replacement_dates']:
                dates = record['replacement_dates'].split(',')
                total_replacements += len([d for d in dates if d.strip()])

        # Количество замен за текущий месяц
        current_month = datetime.now().strftime('%Y-%m')
        month_replacements = 0
        for record in all_records:
            if record['replacement_dates']:
                dates = record['replacement_dates'].split(',')
                month_replacements += len([d for d in dates if d.strip() and d.startswith(current_month)])

        # Количество замен за текущий год
        current_year = datetime.now().strftime('%Y')
        year_replacements = 0
        for record in all_records:
            if record['replacement_dates']:
                dates = record['replacement_dates'].split(',')
                year_replacements += len([d for d in dates if d.strip() and d.startswith(current_year)])

        # Статистика по кабинетам (только количество замен)
        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) as record_count
            FROM cartridges 
            WHERE cabinet != '' 
            GROUP BY cabinet 
            ORDER BY record_count DESC
        ''')

        cabinet_stats_result = []
        for stat in cabinet_stats:
            cabinet_records = db.query(
                'SELECT replacement_dates FROM cartridges WHERE cabinet = ? AND replacement_dates IS NOT NULL AND replacement_dates != ""',
                [stat['cabinet']]
            )
            replacements = 0
            for record in cabinet_records:
                if record['replacement_dates']:
                    dates = record['replacement_dates'].split(',')
                    replacements += len([d for d in dates if d.strip()])

            cabinet_stats_result.append({
                'cabinet': stat['cabinet'],
                'replacements': replacements
            })

        # Статистика по принтерам
        printer_stats = db.query('''
            SELECT printer, COUNT(*) as count 
            FROM cartridges 
            WHERE printer != '' 
            GROUP BY printer 
            ORDER BY count DESC
        ''')

        # Статистика по картриджам
        cartridge_stats = db.query('''
            SELECT cartridge, COUNT(*) as count 
            FROM cartridges 
            WHERE cartridge != '' 
            GROUP BY cartridge 
            ORDER BY count DESC
        ''')

        # Последние замены
        last_replacements = []
        all_with_dates = db.query(
            'SELECT cabinet, printer, cartridge, replacement_dates FROM cartridges WHERE replacement_dates IS NOT NULL AND replacement_dates != "" ORDER BY id DESC'
        )
        for record in all_with_dates:
            if record['replacement_dates']:
                dates = record['replacement_dates'].split(',')
                for date in dates:
                    if date.strip():
                        last_replacements.append({
                            'cabinet': record['cabinet'],
                            'printer': record['printer'],
                            'cartridge': record['cartridge'],
                            'replacement_date': date.strip()
                        })

        # Сортируем по дате и берем последние 10
        last_replacements.sort(key=lambda x: x['replacement_date'], reverse=True)
        last_replacements = last_replacements[:10]

        return jsonify({
            'total': total,
            'total_replacements': total_replacements,
            'month_replacements': month_replacements,
            'year_replacements': year_replacements,
            'cabinet_stats': cabinet_stats_result,
            'printer_stats': [dict(stat) for stat in printer_stats],
            'cartridge_stats': [dict(stat) for stat in cartridge_stats],
            'last_replacements': last_replacements
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения статистики: {str(e)}'}), 500