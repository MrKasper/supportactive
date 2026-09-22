# equipment_network.py
"""Сетевое оборудование кабинета."""
from flask import Blueprint, jsonify, request

from database import Database
from utils import role_required
from logger import get_logger
from constants import EDITOR_ROLES
from .helpers import check_cabinet, next_sort_order, now_str

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_network', __name__)


@bp.route('/api/cabinets/<int:cabinet_id>/network', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_network(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json(silent=True) or {}
        device_type = (data.get('device_type') or '').strip()
        model = (data.get('model') or '').strip()
        if not device_type or not model:
            return jsonify({'success': False, 'error': 'Укажите тип и модель'}), 400

        order = next_sort_order('cabinet_network_devices', cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_network_devices
                    (cabinet_id, device_type, model, inventory_number, ip_address,
                     notes, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, device_type, model,
                (data.get('inventory_number') or '').strip(),
                (data.get('ip_address') or '').strip(),
                (data.get('notes') or '').strip(),
                order, now, now,
            ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_network error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/network/<int:device_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_network(device_id):
    try:
        old = db.query(
            'SELECT * FROM cabinet_network_devices WHERE id = ?',
            [device_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Устройство не найдено'}), 404

        data = request.get_json(silent=True) or {}
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_network_devices
                SET device_type = ?, model = ?, inventory_number = ?,
                    ip_address = ?, notes = ?, updated_at = ?
                WHERE id = ?
            ''', [
                data.get('device_type', old['device_type']),
                data.get('model', old['model']),
                data.get('inventory_number', old['inventory_number']),
                data.get('ip_address', old['ip_address']),
                data.get('notes', old['notes']),
                now_str(), device_id,
            ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_network error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/network/<int:device_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_network(device_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinet_network_devices WHERE id = ?', [device_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_network error')
        return jsonify({'success': False, 'error': str(e)}), 500