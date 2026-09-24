# directory.py
from flask import Blueprint, request, jsonify, session
from database import Database
from utils import login_required
from extensions import cache
from logger import get_logger

log = get_logger(__name__)

directory_bp = Blueprint('directory', __name__)
db = Database()


def _invalidate_directory_cache(entity=None):
    """Сброс кеша справочников."""
    try:
        if entity == 'cabinet':
            cache.delete('directory_cabinets')
            cache.delete('api_cabinets')
        elif entity == 'problem_type':
            cache.delete('directory_problem_types')
        # Всегда сбрасываем фильтры задач, т.к. они зависят от справочников
        cache.delete('filters_data')
    except Exception:
        pass


# ============================================================
# КАБИНЕТЫ
# ============================================================

@directory_bp.route('/api/directory/cabinets')
@login_required
@cache.cached(timeout=300, key_prefix='directory_cabinets')
def get_directory_cabinets():
    try:
        cabinets = db.query('''
            SELECT id, cabinet_number, floor, building, description,
                   responsible_person, phone, is_active
            FROM cabinets
            ORDER BY cabinet_number
        ''')
        return jsonify([dict(cabinet) for cabinet in cabinets])
    except Exception as e:
        log.exception('Ошибка получения кабинетов справочника')
        return jsonify({'error': f'Ошибка получения кабинетов: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets', methods=['POST'])
@login_required
def create_directory_cabinet():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        cabinet_number = (data.get('cabinet_number') or '').strip()
        if not cabinet_number:
            return jsonify({'success': False, 'error': 'Укажите номер кабинета'}), 400

        existing = db.query(
            'SELECT id FROM cabinets WHERE cabinet_number = ?',
            [cabinet_number], one=True
        )
        if existing:
            return jsonify({'success': False, 'error': 'Кабинет с таким номером уже существует'}), 400

        with db.transaction(immediate=True) as tx:
            cabinet_id = tx.execute('''
                INSERT INTO cabinets
                    (cabinet_number, floor, building, description,
                     responsible_person, phone, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_number,
                (data.get('floor') or '').strip(),
                (data.get('building') or '').strip(),
                (data.get('description') or '').strip(),
                (data.get('responsible_person') or '').strip(),
                (data.get('phone') or '').strip(),
                1
            ])

        _invalidate_directory_cache('cabinet')
        return jsonify({'success': True, 'cabinet_id': cabinet_id, 'message': 'Кабинет добавлен'}), 201
    except Exception as e:
        log.exception('Ошибка добавления кабинета')
        return jsonify({'success': False, 'error': f'Ошибка добавления кабинета: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets/<int:cabinet_id>', methods=['PUT'])
@login_required
def update_directory_cabinet(cabinet_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM cabinets WHERE id = ?', [cabinet_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Кабинет не найден'}), 404

        cabinet_number = (data.get('cabinet_number') or old['cabinet_number']).strip()

        existing = db.query(
            'SELECT id FROM cabinets WHERE cabinet_number = ? AND id != ?',
            [cabinet_number, cabinet_id], one=True
        )
        if existing:
            return jsonify({'success': False, 'error': 'Кабинет с таким номером уже существует'}), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinets
                SET cabinet_number = ?, floor = ?, building = ?, description = ?,
                    responsible_person = ?, phone = ?, is_active = ?
                WHERE id = ?
            ''', [
                cabinet_number,
                data.get('floor', old['floor']),
                data.get('building', old['building']),
                data.get('description', old['description']),
                data.get('responsible_person', old['responsible_person']),
                data.get('phone', old['phone']),
                data.get('is_active', old['is_active']),
                cabinet_id
            ])

        _invalidate_directory_cache('cabinet')
        return jsonify({'success': True, 'message': 'Кабинет обновлен'})
    except Exception as e:
        log.exception('Ошибка обновления кабинета')
        return jsonify({'success': False, 'error': f'Ошибка обновления кабинета: {str(e)}'}), 500


@directory_bp.route('/api/directory/cabinets/<int:cabinet_id>', methods=['DELETE'])
@login_required
def delete_directory_cabinet(cabinet_id):
    try:
        cabinet = db.query('SELECT id FROM cabinets WHERE id = ?', [cabinet_id], one=True)
        if not cabinet:
            return jsonify({'success': False, 'error': 'Кабинет не найден'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinets WHERE id = ?', [cabinet_id])

        _invalidate_directory_cache('cabinet')
        return jsonify({'success': True, 'message': 'Кабинет удален'})
    except Exception as e:
        log.exception('Ошибка удаления кабинета')
        return jsonify({'success': False, 'error': f'Ошибка удаления кабинета: {str(e)}'}), 500


# ============================================================
# ТИПЫ ПРОБЛЕМ
# ============================================================

@directory_bp.route('/api/directory/problem-types')
@login_required
@cache.cached(timeout=300, key_prefix='directory_problem_types')
def get_problem_types():
    try:
        types = db.query('SELECT id, name, description, is_active FROM problem_types ORDER BY name')
        return jsonify([dict(t) for t in types])
    except Exception as e:
        log.exception('Ошибка получения типов проблем')
        return jsonify({'error': f'Ошибка получения типов проблем: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types', methods=['POST'])
@login_required
def create_problem_type():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название типа проблемы'}), 400

        existing = db.query('SELECT id FROM problem_types WHERE name = ?', [name], one=True)
        if existing:
            return jsonify({'success': False, 'error': 'Тип проблемы с таким названием уже существует'}), 400

        with db.transaction(immediate=True) as tx:
            type_id = tx.execute('''
                INSERT INTO problem_types (name, description, is_active)
                VALUES (?, ?, ?)
            ''', [name, (data.get('description') or '').strip(), 1])

        _invalidate_directory_cache('problem_type')
        return jsonify({'success': True, 'type_id': type_id, 'message': 'Тип проблемы добавлен'}), 201
    except Exception as e:
        log.exception('Ошибка добавления типа проблемы')
        return jsonify({'success': False, 'error': f'Ошибка добавления типа проблемы: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types/<int:type_id>', methods=['PUT'])
@login_required
def update_problem_type(type_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM problem_types WHERE id = ?', [type_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Тип проблемы не найден'}), 404

        name = (data.get('name') or old['name']).strip()

        existing = db.query(
            'SELECT id FROM problem_types WHERE name = ? AND id != ?',
            [name, type_id], one=True
        )
        if existing:
            return jsonify({'success': False, 'error': 'Тип проблемы с таким названием уже существует'}), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE problem_types
                SET name = ?, description = ?, is_active = ?
                WHERE id = ?
            ''', [
                name,
                data.get('description', old['description']),
                data.get('is_active', old['is_active']),
                type_id
            ])

        _invalidate_directory_cache('problem_type')
        return jsonify({'success': True, 'message': 'Тип проблемы обновлен'})
    except Exception as e:
        log.exception('Ошибка обновления типа проблемы')
        return jsonify({'success': False, 'error': f'Ошибка обновления типа проблемы: {str(e)}'}), 500


@directory_bp.route('/api/directory/problem-types/<int:type_id>', methods=['DELETE'])
@login_required
def delete_problem_type(type_id):
    try:
        problem_type = db.query('SELECT id FROM problem_types WHERE id = ?', [type_id], one=True)
        if not problem_type:
            return jsonify({'success': False, 'error': 'Тип проблемы не найден'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM problem_types WHERE id = ?', [type_id])

        _invalidate_directory_cache('problem_type')
        return jsonify({'success': True, 'message': 'Тип проблемы удален'})
    except Exception as e:
        log.exception('Ошибка удаления типа проблемы')
        return jsonify({'success': False, 'error': f'Ошибка удаления типа проблемы: {str(e)}'}), 500