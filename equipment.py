# equipment.py
"""
IT-инфраструктура: сетевое оборудование, ПК, принтеры по кабинетам.
"""
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
import json
from utils import login_required, role_required
from logger import get_logger

log = get_logger(__name__)

equipment_bp = Blueprint('equipment', __name__)
db = Database()


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _check_cabinet(cabinet_id):
    """Возвращает (cabinet, error_response)."""
    c = db.query('SELECT * FROM cabinets WHERE id = ?', [cabinet_id], one=True)
    if not c:
        return None, (jsonify({'error': 'Кабинет не найден'}), 404)
    return c, None


# ============================================================
# ПОЛНАЯ КАРТОЧКА КАБИНЕТА
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/details')
@login_required
def cabinet_details(cabinet_id):
    """Полная информация: кабинет + всё оборудование."""
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        net = db.query(
            'SELECT * FROM cabinet_network_devices WHERE cabinet_id = ? ORDER BY id',
            [cabinet_id]
        )
        pcs = db.query(
            'SELECT * FROM cabinet_computers WHERE cabinet_id = ? ORDER BY id',
            [cabinet_id]
        )
        printers = db.query(
            'SELECT * FROM cabinet_printers WHERE cabinet_id = ? ORDER BY id',
            [cabinet_id]
        )

        pcs_list = []
        for p in pcs:
            d = dict(p)
            # RAM и storage хранятся как JSON-строки
            try:
                d['ram'] = json.loads(d.get('ram') or '[]')
            except Exception:
                d['ram'] = []
            try:
                d['storage'] = json.loads(d.get('storage') or '[]')
            except Exception:
                d['storage'] = []
            pcs_list.append(d)

        return jsonify({
            'cabinet': dict(cab),
            'network_devices': [dict(x) for x in net],
            'computers': pcs_list,
            'printers': [dict(x) for x in printers]
        })
    except Exception as e:
        log.exception('cabinet_details error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СЕТЕВОЕ ОБОРУДОВАНИЕ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/network', methods=['POST'])
@role_required('Администратор')
def create_network(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json() or {}
        device_type = (data.get('device_type') or '').strip()
        model = (data.get('model') or '').strip()
        if not device_type or not model:
            return jsonify({'success': False, 'error': 'Укажите тип и модель'}), 400

        now = _now()
        new_id = db.execute('''
            INSERT INTO cabinet_network_devices
                (cabinet_id, device_type, model, inventory_number, ip_address, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            cabinet_id, device_type, model,
            (data.get('inventory_number') or '').strip(),
            (data.get('ip_address') or '').strip(),
            (data.get('notes') or '').strip(),
            now, now
        ])

        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_network error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/network/<int:device_id>', methods=['PUT'])
@role_required('Администратор')
def update_network(device_id):
    try:
        old = db.query('SELECT * FROM cabinet_network_devices WHERE id = ?', [device_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Устройство не найдено'}), 404

        data = request.get_json() or {}
        db.execute('''
            UPDATE cabinet_network_devices
            SET device_type = ?, model = ?, inventory_number = ?, ip_address = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ''', [
            data.get('device_type', old['device_type']),
            data.get('model', old['model']),
            data.get('inventory_number', old['inventory_number']),
            data.get('ip_address', old['ip_address']),
            data.get('notes', old['notes']),
            _now(), device_id
        ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_network error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/network/<int:device_id>', methods=['DELETE'])
@role_required('Администратор')
def delete_network(device_id):
    try:
        db.execute('DELETE FROM cabinet_network_devices WHERE id = ?', [device_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_network error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# КОМПЬЮТЕРЫ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/computers', methods=['POST'])
@role_required('Администратор')
def create_computer(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название ПК'}), 400

        ram = data.get('ram') or []
        storage = data.get('storage') or []

        now = _now()
        new_id = db.execute('''
            INSERT INTO cabinet_computers
                (cabinet_id, name, motherboard, cpu, inventory_number, ip_address,
                 status, ram, storage, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            cabinet_id, name,
            (data.get('motherboard') or '').strip(),
            (data.get('cpu') or '').strip(),
            (data.get('inventory_number') or '').strip(),
            (data.get('ip_address') or '').strip(),
            data.get('status') or 'offline',
            json.dumps(ram, ensure_ascii=False),
            json.dumps(storage, ensure_ascii=False),
            (data.get('notes') or '').strip(),
            now, now
        ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>', methods=['PUT'])
@role_required('Администратор')
def update_computer(pc_id):
    try:
        old = db.query('SELECT * FROM cabinet_computers WHERE id = ?', [pc_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json() or {}

        ram = data.get('ram')
        storage = data.get('storage')

        db.execute('''
            UPDATE cabinet_computers
            SET name = ?, motherboard = ?, cpu = ?, inventory_number = ?, ip_address = ?,
                status = ?, ram = ?, storage = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ''', [
            data.get('name', old['name']),
            data.get('motherboard', old['motherboard']),
            data.get('cpu', old['cpu']),
            data.get('inventory_number', old['inventory_number']),
            data.get('ip_address', old['ip_address']),
            data.get('status', old['status']),
            json.dumps(ram, ensure_ascii=False) if ram is not None else old['ram'],
            json.dumps(storage, ensure_ascii=False) if storage is not None else old['storage'],
            data.get('notes', old['notes']),
            _now(), pc_id
        ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>', methods=['DELETE'])
@role_required('Администратор')
def delete_computer(pc_id):
    try:
        # Отвязать принтеры
        db.execute('UPDATE cabinet_printers SET connected_to_pc_id = NULL WHERE connected_to_pc_id = ?', [pc_id])
        db.execute('DELETE FROM cabinet_computers WHERE id = ?', [pc_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>/toggle-status', methods=['POST'])
@login_required
def toggle_pc_status(pc_id):
    """Проверка онлайн/офлайн (заглушка)."""
    try:
        old = db.query('SELECT status FROM cabinet_computers WHERE id = ?', [pc_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        new_status = 'offline' if old['status'] == 'online' else 'online'
        db.execute('UPDATE cabinet_computers SET status = ?, updated_at = ? WHERE id = ?',
                   [new_status, _now(), pc_id])
        return jsonify({'success': True, 'status': new_status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПРИНТЕРЫ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/printers', methods=['POST'])
@role_required('Администратор')
def create_printer(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json() or {}
        model = (data.get('model') or '').strip()
        if not model:
            return jsonify({'success': False, 'error': 'Укажите модель принтера'}), 400

        now = _now()
        new_id = db.execute('''
            INSERT INTO cabinet_printers
                (cabinet_id, model, cartridge, inventory_number, ip_address, connected_to_pc_id, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', [
            cabinet_id, model,
            (data.get('cartridge') or '').strip(),
            (data.get('inventory_number') or '').strip(),
            (data.get('ip_address') or '').strip(),
            data.get('connected_to_pc_id') or None,
            (data.get('notes') or '').strip(),
            now, now
        ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/printers/<int:printer_id>', methods=['PUT'])
@role_required('Администратор')
def update_printer(printer_id):
    try:
        old = db.query('SELECT * FROM cabinet_printers WHERE id = ?', [printer_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json() or {}
        db.execute('''
            UPDATE cabinet_printers
            SET model = ?, cartridge = ?, inventory_number = ?, ip_address = ?, connected_to_pc_id = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ''', [
            data.get('model', old['model']),
            data.get('cartridge', old['cartridge']),
            data.get('inventory_number', old['inventory_number']),
            data.get('ip_address', old['ip_address']),
            data.get('connected_to_pc_id', old['connected_to_pc_id']),
            data.get('notes', old['notes']),
            _now(), printer_id
        ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/printers/<int:printer_id>', methods=['DELETE'])
@role_required('Администратор')
def delete_printer(printer_id):
    try:
        db.execute('DELETE FROM cabinet_printers WHERE id = ?', [printer_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/printers/<int:printer_id>/connect', methods=['POST'])
@role_required('Администратор')
def connect_printer(printer_id):
    """Подключение принтера к ПК (или отключение, если pc_id = null)."""
    try:
        data = request.get_json() or {}
        pc_id = data.get('pc_id')
        if pc_id in (None, '', 'null'):
            pc_id = None

        db.execute('UPDATE cabinet_printers SET connected_to_pc_id = ?, updated_at = ? WHERE id = ?',
                   [pc_id, _now(), printer_id])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ЭКСПОРТ ВСЕЙ ИНФРАСТРУКТУРЫ
# ============================================================

@equipment_bp.route('/api/equipment/summary')
@login_required
def equipment_summary():
    """Сводка по всей инфраструктуре (для дашборда)."""
    try:
        net_count = db.query('SELECT COUNT(*) as c FROM cabinet_network_devices', one=True)['c']
        pc_count = db.query('SELECT COUNT(*) as c FROM cabinet_computers', one=True)['c']
        pc_online = db.query("SELECT COUNT(*) as c FROM cabinet_computers WHERE status = 'online'", one=True)['c']
        printer_count = db.query('SELECT COUNT(*) as c FROM cabinet_printers', one=True)['c']
        cabinets_count = db.query('SELECT COUNT(*) as c FROM cabinets WHERE is_active = 1', one=True)['c']

        return jsonify({
            'cabinets': cabinets_count,
            'network': net_count,
            'computers': pc_count,
            'computers_online': pc_online,
            'printers': printer_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500