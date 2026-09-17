# equipment_computers.py
"""
Компьютеры кабинета + пинг ПК + QR-код.
QR ведёт на публичную карточку (/qr/pc/<id>), доступную без авторизации.
"""
import io
import json

from flask import Blueprint, jsonify, request, send_file

from database import Database
from utils import login_required, role_required
from logger import get_logger
from constants import EDITOR_ROLES
from equipment_helpers import check_cabinet, next_sort_order, now_str
from services.ping import ping_one_computer

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_computers', __name__)


# ============================================================
# CRUD
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/computers', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_computer(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({
                'success': False,
                'error': 'Укажите название ПК',
            }), 400

        order = next_sort_order('cabinet_computers', cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_computers
                    (cabinet_id, name, motherboard, motherboard_socket, cpu,
                     inventory_number, ip_address, status, ram, storage,
                     software, notes, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, name,
                (data.get('motherboard') or '').strip(),
                (data.get('motherboard_socket') or '').strip(),
                (data.get('cpu') or '').strip(),
                (data.get('inventory_number') or '').strip(),
                (data.get('ip_address') or '').strip(),
                data.get('status') or 'offline',
                json.dumps(data.get('ram') or [], ensure_ascii=False),
                json.dumps(data.get('storage') or [], ensure_ascii=False),
                json.dumps(data.get('software') or [], ensure_ascii=False),
                (data.get('notes') or '').strip(),
                order, now, now,
            ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_computer(pc_id):
    try:
        old = db.query(
            'SELECT * FROM cabinet_computers WHERE id = ?',
            [pc_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}

        def _dump(field):
            v = data.get(field)
            if v is None:
                return old[field]
            return json.dumps(v, ensure_ascii=False)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_computers
                SET name = ?, motherboard = ?, motherboard_socket = ?, cpu = ?,
                    inventory_number = ?, ip_address = ?, status = ?,
                    ram = ?, storage = ?, software = ?, notes = ?, updated_at = ?
                WHERE id = ?
            ''', [
                data.get('name', old['name']),
                data.get('motherboard', old['motherboard']),
                data.get('motherboard_socket', old['motherboard_socket']),
                data.get('cpu', old['cpu']),
                data.get('inventory_number', old['inventory_number']),
                data.get('ip_address', old['ip_address']),
                data.get('status', old['status']),
                _dump('ram'), _dump('storage'), _dump('software'),
                data.get('notes', old['notes']),
                now_str(), pc_id,
            ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_computer(pc_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE cabinet_printers SET connected_to_pc_id = NULL '
                'WHERE connected_to_pc_id = ?',
                [pc_id],
            )
            tx.execute('DELETE FROM cabinet_computers WHERE id = ?', [pc_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПИНГ
# ============================================================

@bp.route('/api/computers/<int:pc_id>/ping', methods=['POST'])
@login_required
def ping_computer(pc_id):
    try:
        pc = db.query(
            'SELECT * FROM cabinet_computers WHERE id = ?',
            [pc_id], one=True,
        )
        if not pc:
            return jsonify({'success': False, 'error': 'Компьютер не найден'}), 404

        ip = (pc['ip_address'] or '').strip()
        if not ip:
            return jsonify({
                'success': False,
                'error': 'У ПК не указан IP-адрес',
                'status': 'offline',
            }), 400

        result = ping_one_computer({'id': pc_id, 'ip_address': ip})
        if not result:
            return jsonify({
                'success': False,
                'error': 'Не удалось выполнить ping',
            }), 500

        updated = db.query('''
            SELECT status, ping_count, ping_success_count, last_ping_at
            FROM cabinet_computers WHERE id = ?
        ''', [pc_id], one=True)

        return jsonify({
            'success': True,
            'status': updated['status'],
            'ping_count': updated['ping_count'],
            'ping_success_count': updated['ping_success_count'],
            'last_ping_at': updated['last_ping_at'],
            'ip': ip,
            'message': (
                f'{ip} — '
                f'{"доступен" if updated["status"] == "online" else "недоступен"}'
            ),
        })
    except Exception as e:
        log.exception('ping_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# QR-КОД
# ============================================================

@bp.route('/api/computers/<int:pc_id>/qr')
@login_required
def computer_qr(pc_id):
    """
    QR-код, ведущий на ПУБЛИЧНУЮ карточку ПК (/qr/pc/<id>).
    Эта страница открывается без авторизации и показывает
    только базовую информацию об устройстве.
    """
    try:
        import qrcode

        pc = db.query(
            'SELECT id, cabinet_id, name FROM cabinet_computers WHERE id = ?',
            [pc_id], one=True,
        )
        if not pc:
            return jsonify({'error': 'ПК не найден'}), 404

        base = request.host_url.rstrip('/')
        target = f'{base}/qr/pc/{pc_id}'

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(target)
        qr.make(fit=True)

        img = qr.make_image(fill_color='black', back_color='white')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)

        return send_file(
            buf,
            mimetype='image/png',
            download_name=f'computer_{pc_id}_qr.png',
        )
    except ImportError:
        return jsonify({'error': 'qrcode не установлен'}), 500
    except Exception as e:
        log.exception('computer_qr error')
        return jsonify({'error': str(e)}), 500