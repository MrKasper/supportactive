# licenses.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для лицензий
licenses_bp = Blueprint('licenses', __name__)

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


# ============= API ДЛЯ УПРАВЛЕНИЯ ЛИЦЕНЗИЯМИ =============

@licenses_bp.route('/api/licenses')
@login_required
def get_licenses():
    """Получение списка всех лицензий с возможностью фильтрации по кабинету"""
    try:
        cabinet = request.args.get('cabinet', '')

        query = 'SELECT id, cabinet, software_name, license_type, notes FROM licenses WHERE 1=1'
        params = []

        if cabinet:
            query += ' AND cabinet = ?'
            params.append(cabinet)

        query += ' ORDER BY cabinet, software_name'

        licenses = db.query(query, params)
        return jsonify([dict(lic) for lic in licenses])

    except Exception as e:
        return jsonify({'error': f'Ошибка получения лицензий: {str(e)}'}), 500


@licenses_bp.route('/api/licenses/<int:license_id>')
@login_required
def get_license(license_id):
    """Получение информации о конкретной лицензии"""
    try:
        license_data = db.query('SELECT * FROM licenses WHERE id = ?', [license_id], one=True)
        if not license_data:
            return jsonify({'error': 'Лицензия не найдена'}), 404
        return jsonify(dict(license_data))

    except Exception as e:
        return jsonify({'error': f'Ошибка получения лицензии: {str(e)}'}), 500


@licenses_bp.route('/api/licenses', methods=['POST'])
@login_required
def create_license():
    """Добавление новой лицензии"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        cabinet = data.get('cabinet', '').strip()
        software_name = data.get('software_name', '').strip()
        license_type = data.get('license_type', '').strip()
        notes = data.get('notes', '').strip()

        if not cabinet:
            return jsonify({'success': False, 'error': 'Укажите кабинет'}), 400
        if not software_name:
            return jsonify({'success': False, 'error': 'Укажите программное обеспечение'}), 400
        if not license_type:
            return jsonify({'success': False, 'error': 'Укажите тип лицензии'}), 400

        # Проверяем на дубликат
        existing = db.query(
            'SELECT id FROM licenses WHERE cabinet = ? AND software_name = ? AND license_type = ?',
            [cabinet, software_name, license_type],
            one=True
        )

        if existing:
            return jsonify({
                'success': False,
                'error': 'Такая лицензия уже существует для этого кабинета.'
            }), 400

        license_id = db.execute('''
            INSERT INTO licenses (cabinet, software_name, license_type, notes)
            VALUES (?, ?, ?, ?)
        ''', [
            cabinet,
            software_name,
            license_type,
            notes
        ])

        return jsonify({
            'success': True,
            'license_id': license_id,
            'message': 'Лицензия успешно добавлена'
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка добавления лицензии: {str(e)}'}), 500


@licenses_bp.route('/api/licenses/<int:license_id>', methods=['PUT'])
@login_required
def update_license(license_id):
    """Обновление лицензии"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM licenses WHERE id = ?', [license_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Лицензия не найдена'}), 404

        cabinet = data.get('cabinet', old['cabinet']).strip()
        software_name = data.get('software_name', old['software_name']).strip()
        license_type = data.get('license_type', old['license_type']).strip()

        # Проверяем на дубликат при изменении
        existing = db.query(
            'SELECT id FROM licenses WHERE cabinet = ? AND software_name = ? AND license_type = ? AND id != ?',
            [cabinet, software_name, license_type, license_id],
            one=True
        )

        if existing:
            return jsonify({
                'success': False,
                'error': 'Такая лицензия уже существует для этого кабинета.'
            }), 400

        db.execute('''
            UPDATE licenses 
            SET cabinet = ?, software_name = ?, license_type = ?, notes = ?
            WHERE id = ?
        ''', [
            cabinet,
            software_name,
            license_type,
            data.get('notes', old['notes']),
            license_id
        ])

        return jsonify({
            'success': True,
            'message': 'Лицензия успешно обновлена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления лицензии: {str(e)}'}), 500


@licenses_bp.route('/api/licenses/<int:license_id>', methods=['DELETE'])
@login_required
def delete_license(license_id):
    """Удаление лицензии"""
    try:
        license_data = db.query('SELECT id FROM licenses WHERE id = ?', [license_id], one=True)
        if not license_data:
            return jsonify({'success': False, 'error': 'Лицензия не найдена'}), 404

        db.execute('DELETE FROM licenses WHERE id = ?', [license_id])

        return jsonify({
            'success': True,
            'message': 'Лицензия успешно удалена'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления лицензии: {str(e)}'}), 500


@licenses_bp.route('/api/licenses/statistics')
@login_required
def get_license_statistics():
    """Получение статистики по лицензиям"""
    try:
        # Общее количество
        total = db.query('SELECT COUNT(*) as count FROM licenses', one=True)['count']

        # Статистика по кабинетам
        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) as count 
            FROM licenses 
            WHERE cabinet != '' 
            GROUP BY cabinet 
            ORDER BY count DESC
        ''')

        # Статистика по типам лицензий
        type_stats = db.query('''
            SELECT license_type, COUNT(*) as count 
            FROM licenses 
            WHERE license_type != '' 
            GROUP BY license_type 
            ORDER BY count DESC
        ''')

        # Статистика по ПО
        software_stats = db.query('''
            SELECT software_name, COUNT(*) as count 
            FROM licenses 
            WHERE software_name != '' 
            GROUP BY software_name 
            ORDER BY count DESC
        ''')

        return jsonify({
            'total': total,
            'cabinet_stats': [dict(stat) for stat in cabinet_stats],
            'type_stats': [dict(stat) for stat in type_stats],
            'software_stats': [dict(stat) for stat in software_stats]
        })

    except Exception as e:
        return jsonify({'error': f'Ошибка получения статистики: {str(e)}'}), 500