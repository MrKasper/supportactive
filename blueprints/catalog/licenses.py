# licenses.py
"""Лицензии на ПО в кабинетах."""
from flask import Blueprint, request, jsonify
from database import Database
from utils import (
    login_required, get_json_safe,
    json_ok, json_error, json_list,
)
from validators import validate_required, validate_length
from logger import get_logger

log = get_logger(__name__)
licenses_bp = Blueprint('licenses', __name__)
db = Database()


def _validate_license(data):
    ok, err = validate_required(data.get('cabinet'), 'Кабинет')
    if not ok:
        return ok, err
    ok, err = validate_required(data.get('software_name'), 'Программное обеспечение')
    if not ok:
        return ok, err
    ok, err = validate_required(data.get('license_type'), 'Тип лицензии')
    if not ok:
        return ok, err
    ok, err = validate_length(data.get('software_name'), 'ПО', max_len=200)
    if not ok:
        return ok, err
    return True, None


def _normalize(data):
    return {
        'cabinet': (data.get('cabinet') or '').strip(),
        'software_name': (data.get('software_name') or '').strip(),
        'license_type': (data.get('license_type') or '').strip(),
        'notes': (data.get('notes') or '').strip(),
    }


# ============================================================
# СПИСОК / ДЕТАЛИ
# ============================================================

@licenses_bp.route('/api/licenses')
@login_required
def get_licenses():
    try:
        cabinet = request.args.get('cabinet', '').strip()

        if cabinet:
            rows = db.query('''
                SELECT id, cabinet, software_name, license_type, notes
                FROM licenses WHERE cabinet = ?
                ORDER BY cabinet, software_name
            ''', [cabinet])
        else:
            rows = db.query('''
                SELECT id, cabinet, software_name, license_type, notes
                FROM licenses
                ORDER BY cabinet, software_name
            ''')

        return json_list([dict(r) for r in rows])
    except Exception as e:
        log.exception('Ошибка получения лицензий')
        return json_error(f'Ошибка: {str(e)}', 500)


@licenses_bp.route('/api/licenses/<int:license_id>')
@login_required
def get_license(license_id):
    try:
        lic = db.query(
            'SELECT * FROM licenses WHERE id = ?',
            [license_id], one=True,
        )
        if not lic:
            return json_error('Лицензия не найдена', 404)
        return jsonify(dict(lic))
    except Exception as e:
        log.exception('Ошибка получения лицензии')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# СОЗДАНИЕ
# ============================================================

@licenses_bp.route('/api/licenses', methods=['POST'])
@login_required
def create_license():
    try:
        data = get_json_safe()
        if not data:
            return json_error('Нет данных', 400)

        ok, err = _validate_license(data)
        if not ok:
            return json_error(err, 400)

        n = _normalize(data)

        # Проверка дубликата
        existing = db.query('''
            SELECT id FROM licenses
            WHERE cabinet = ? AND software_name = ? AND license_type = ?
        ''', [n['cabinet'], n['software_name'], n['license_type']], one=True)
        if existing:
            return json_error('Такая лицензия уже существует для этого кабинета', 400)

        with db.transaction(immediate=True) as tx:
            license_id = tx.execute('''
                INSERT INTO licenses (cabinet, software_name, license_type, notes)
                VALUES (?, ?, ?, ?)
            ''', [n['cabinet'], n['software_name'], n['license_type'], n['notes']])

        return json_ok(license_id=license_id, message='Лицензия добавлена'), 201
    except Exception as e:
        log.exception('Ошибка добавления лицензии')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# ОБНОВЛЕНИЕ
# ============================================================

@licenses_bp.route('/api/licenses/<int:license_id>', methods=['PUT'])
@login_required
def update_license(license_id):
    try:
        data = get_json_safe()
        if not data:
            return json_error('Нет данных', 400)

        old = db.query(
            'SELECT * FROM licenses WHERE id = ?',
            [license_id], one=True,
        )
        if not old:
            return json_error('Лицензия не найдена', 404)

        merged = {
            'cabinet': data.get('cabinet', old['cabinet']),
            'software_name': data.get('software_name', old['software_name']),
            'license_type': data.get('license_type', old['license_type']),
            'notes': data.get('notes', old['notes']),
        }

        ok, err = _validate_license(merged)
        if not ok:
            return json_error(err, 400)

        n = _normalize(merged)

        # Дубликат
        existing = db.query('''
            SELECT id FROM licenses
            WHERE cabinet = ? AND software_name = ? AND license_type = ? AND id != ?
        ''', [n['cabinet'], n['software_name'], n['license_type'], license_id], one=True)
        if existing:
            return json_error('Такая лицензия уже существует для этого кабинета', 400)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE licenses
                SET cabinet = ?, software_name = ?, license_type = ?, notes = ?
                WHERE id = ?
            ''', [n['cabinet'], n['software_name'], n['license_type'], n['notes'], license_id])

        return json_ok(message='Лицензия обновлена')
    except Exception as e:
        log.exception('Ошибка обновления лицензии')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# УДАЛЕНИЕ
# ============================================================

@licenses_bp.route('/api/licenses/<int:license_id>', methods=['DELETE'])
@login_required
def delete_license(license_id):
    try:
        lic = db.query(
            'SELECT id FROM licenses WHERE id = ?',
            [license_id], one=True,
        )
        if not lic:
            return json_error('Лицензия не найдена', 404)

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM licenses WHERE id = ?', [license_id])

        return json_ok(message='Лицензия удалена')
    except Exception as e:
        log.exception('Ошибка удаления лицензии')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# СТАТИСТИКА
# ============================================================

@licenses_bp.route('/api/licenses/statistics')
@login_required
def get_license_statistics():
    try:
        total = db.query(
            'SELECT COUNT(*) AS count FROM licenses', one=True
        )['count']

        cabinet_stats = db.query('''
            SELECT cabinet, COUNT(*) AS count FROM licenses
            WHERE cabinet != ''
            GROUP BY cabinet ORDER BY count DESC
        ''')

        type_stats = db.query('''
            SELECT license_type, COUNT(*) AS count FROM licenses
            WHERE license_type != ''
            GROUP BY license_type ORDER BY count DESC
        ''')

        software_stats = db.query('''
            SELECT software_name, COUNT(*) AS count FROM licenses
            WHERE software_name != ''
            GROUP BY software_name ORDER BY count DESC
        ''')

        return jsonify({
            'total': total,
            'cabinet_stats': [dict(s) for s in cabinet_stats],
            'type_stats': [dict(s) for s in type_stats],
            'software_stats': [dict(s) for s in software_stats],
        })
    except Exception as e:
        log.exception('Ошибка статистики лицензий')
        return json_error(f'Ошибка: {str(e)}', 500)