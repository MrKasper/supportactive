# directory.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для справочника
directory_bp = Blueprint('directory', __name__)

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


# ============= API ДЛЯ СПРАВОЧНИКА =============

# ---------- КАБИНЕТЫ ----------

@directory_bp.route('/api/directory/cabinets')
@login_required
def get_directory_cabinets():
    """Получение списка кабинетов для справочника"""
    try:
        cabinets = db.query('''
            SELECT id, cabinet_number, floor, building, description, is_active 
            FROM cabinets 
            ORDER BY cabinet_number
        ''')
        return jsonify([dict(cabinet) for cabinet in cabinets])

    except Exception as e:
        return jsonify({'error': f'Ошибка получения кабинетов: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets', methods=['POST'])
@login_required
def create_directory_cabinet():
    """Добавление нового кабинета"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        cabinet_number = data.get('cabinet_number', '').strip()
        if not cabinet_number:
            return jsonify({'success': False, 'error': 'Укажите номер кабинета'}), 400

        # Проверяем на дубликат
        existing = db.query('SELECT id FROM cabinets WHERE cabinet_number = ?', [cabinet_number], one=True)
        if existing:
            return jsonify({'success': False, 'error': 'Кабинет с таким номером уже существует'}), 400

        cabinet_id = db.execute('''
            INSERT INTO cabinets (cabinet_number, floor, building, description, is_active)
            VALUES (?, ?, ?, ?, ?)
        ''', [
            cabinet_number,
            data.get('floor', '').strip(),
            data.get('building', '').strip(),
            data.get('description', '').strip(),
            1
        ])

        return jsonify({'success': True, 'cabinet_id': cabinet_id, 'message': 'Кабинет добавлен'}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка добавления кабинета: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets/<int:cabinet_id>', methods=['PUT'])
@login_required
def update_directory_cabinet(cabinet_id):
    """Обновление кабинета"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM cabinets WHERE id = ?', [cabinet_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Кабинет не найден'}), 404

        cabinet_number = data.get('cabinet_number', old['cabinet_number']).strip()

        # Проверяем на дубликат
        existing = db.query('SELECT id FROM cabinets WHERE cabinet_number = ? AND id != ?',
                            [cabinet_number, cabinet_id], one=True)
        if existing:
            return jsonify({'success': False, 'error': 'Кабинет с таким номером уже существует'}), 400

        db.execute('''
            UPDATE cabinets 
            SET cabinet_number = ?, floor = ?, building = ?, description = ?, is_active = ?
            WHERE id = ?
        ''', [
            cabinet_number,
            data.get('floor', old['floor']),
            data.get('building', old['building']),
            data.get('description', old['description']),
            data.get('is_active', old['is_active']),
            cabinet_id
        ])

        return jsonify({'success': True, 'message': 'Кабинет обновлен'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления кабинета: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets/<int:cabinet_id>', methods=['DELETE'])
@login_required
def delete_directory_cabinet(cabinet_id):
    """Удаление кабинета"""
    try:
        cabinet = db.query('SELECT id FROM cabinets WHERE id = ?', [cabinet_id], one=True)
        if not cabinet:
            return jsonify({'success': False, 'error': 'Кабинет не найден'}), 404

        db.execute('DELETE FROM cabinets WHERE id = ?', [cabinet_id])

        return jsonify({'success': True, 'message': 'Кабинет удален'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления кабинета: {str(e)}'}), 500


# ---------- ТИПЫ ПРОБЛЕМ ----------

@directory_bp.route('/api/directory/problem-types')
@login_required
def get_problem_types():
    """Получение списка типов проблем"""
    try:
        types = db.query('SELECT id, name, description, is_active FROM problem_types ORDER BY name')
        return jsonify([dict(t) for t in types])

    except Exception as e:
        return jsonify({'error': f'Ошибка получения типов проблем: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types', methods=['POST'])
@login_required
def create_problem_type():
    """Добавление нового типа проблемы"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        name = data.get('name', '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название типа проблемы'}), 400

        existing = db.query('SELECT id FROM problem_types WHERE name = ?', [name], one=True)
        if existing:
            return jsonify({'success': False, 'error': 'Тип проблемы с таким названием уже существует'}), 400

        type_id = db.execute('''
            INSERT INTO problem_types (name, description, is_active)
            VALUES (?, ?, ?)
        ''', [name, data.get('description', '').strip(), 1])

        return jsonify({'success': True, 'type_id': type_id, 'message': 'Тип проблемы добавлен'}), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка добавления типа проблемы: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types/<int:type_id>', methods=['PUT'])
@login_required
def update_problem_type(type_id):
    """Обновление типа проблемы"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM problem_types WHERE id = ?', [type_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Тип проблемы не найден'}), 404

        name = data.get('name', old['name']).strip()

        existing = db.query('SELECT id FROM problem_types WHERE name = ? AND id != ?',
                            [name, type_id], one=True)
        if existing:
            return jsonify({'success': False, 'error': 'Тип проблемы с таким названием уже существует'}), 400

        db.execute('''
            UPDATE problem_types 
            SET name = ?, description = ?, is_active = ?
            WHERE id = ?
        ''', [name, data.get('description', old['description']), data.get('is_active', old['is_active']), type_id])

        return jsonify({'success': True, 'message': 'Тип проблемы обновлен'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления типа проблемы: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types/<int:type_id>', methods=['DELETE'])
@login_required
def delete_problem_type(type_id):
    """Удаление типа проблемы"""
    try:
        problem_type = db.query('SELECT id FROM problem_types WHERE id = ?', [type_id], one=True)
        if not problem_type:
            return jsonify({'success': False, 'error': 'Тип проблемы не найден'}), 404

        db.execute('DELETE FROM problem_types WHERE id = ?', [type_id])

        return jsonify({'success': True, 'message': 'Тип проблемы удален'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления типа проблемы: {str(e)}'}), 500