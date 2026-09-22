# equipment_core.py
"""
Ядро оборудования кабинета:
  • карточка кабинета (details)
  • статус пингов
  • ping-all для кабинета
  • reorder (drag-n-drop)
  • данные для печати
  • сводка по оборудованию
"""
import json
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from database import Database
from utils import login_required, role_required
from logger import get_logger
from constants import EDITOR_ROLES
from services.ping import ping_one_computer, PING_MAX_WORKERS, PING_INTERVAL_SEC
from .helpers import check_cabinet

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_core', __name__)


# ============================================================
# КАРТОЧКА КАБИНЕТА
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/details')
@login_required
def cabinet_details(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        net = db.query(
            'SELECT * FROM cabinet_network_devices '
            'WHERE cabinet_id = ? ORDER BY sort_order, id',
            [cabinet_id],
        )
        pcs = db.query(
            'SELECT * FROM cabinet_computers '
            'WHERE cabinet_id = ? ORDER BY sort_order, id',
            [cabinet_id],
        )
        printers = db.query(
            'SELECT * FROM cabinet_printers '
            'WHERE cabinet_id = ? ORDER BY sort_order, id',
            [cabinet_id],
        )

        pcs_list = [_decode_computer(p) for p in pcs]

        return jsonify({
            'cabinet': dict(cab),
            'network_devices': [dict(x) for x in net],
            'computers': pcs_list,
            'printers': [dict(x) for x in printers],
        })
    except Exception as e:
        log.exception('cabinet_details error')
        return jsonify({'error': str(e)}), 500


def _decode_computer(p):
    """Декодирует JSON-поля компьютера."""
    d = dict(p)
    for field, default in (('ram', []), ('storage', []), ('software', [])):
        try:
            d[field] = json.loads(d.get(field) or '[]')
        except Exception:
            d[field] = default
    return d


# ============================================================
# СТАТУС ПИНГА
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/ping-status')
@login_required
def cabinet_ping_status(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        rows = db.query('''
            SELECT id, name, ip_address, status,
                   COALESCE(ping_count, 0) as ping_count,
                   COALESCE(ping_success_count, 0) as ping_success_count,
                   last_ping_at, last_ping_status
            FROM cabinet_computers
            WHERE cabinet_id = ?
            ORDER BY sort_order, id
        ''', [cabinet_id])

        last_ping = None
        for r in rows:
            if r['last_ping_at'] and (last_ping is None or r['last_ping_at'] > last_ping):
                last_ping = r['last_ping_at']

        next_ping = None
        if last_ping:
            try:
                next_ping = (
                    datetime.strptime(last_ping, '%Y-%m-%d %H:%M:%S') +
                    timedelta(seconds=PING_INTERVAL_SEC)
                ).strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                pass

        return jsonify({
            'computers': [dict(r) for r in rows],
            'last_ping_at': last_ping,
            'next_ping_at': next_ping,
            'interval_sec': PING_INTERVAL_SEC,
        })
    except Exception as e:
        log.exception('cabinet_ping_status error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/cabinets/<int:cabinet_id>/ping-all', methods=['POST'])
@role_required(*EDITOR_ROLES)
def ping_all_in_cabinet(cabinet_id):
    from concurrent.futures import ThreadPoolExecutor, as_completed

    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        pcs = db.query('''
            SELECT id, ip_address FROM cabinet_computers
            WHERE cabinet_id = ? AND ip_address IS NOT NULL AND ip_address != ''
        ''', [cabinet_id])

        pcs_with_ip = [dict(p) for p in pcs]
        if not pcs_with_ip:
            return jsonify({'success': True, 'total': 0,
                            'message': 'Нет ПК с указанным IP'})

        online = 0
        offline = 0
        with ThreadPoolExecutor(max_workers=PING_MAX_WORKERS) as executor:
            futures = {executor.submit(ping_one_computer, pc): pc for pc in pcs_with_ip}
            for fut in as_completed(futures):
                result = fut.result()
                if result:
                    if result['status'] == 'online':
                        online += 1
                    else:
                        offline += 1

        return jsonify({
            'success': True,
            'total': online + offline,
            'online': online,
            'offline': offline,
            'message': f'Проверено {online + offline}: online {online}, offline {offline}',
        })
    except Exception as e:
        log.exception('ping_all_in_cabinet error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# REORDER (DRAG-N-DROP)
# ============================================================

_REORDER_TABLES = {
    'computers': 'cabinet_computers',
    'network':   'cabinet_network_devices',
    'printers':  'cabinet_printers',
}


@bp.route('/api/<entity>/reorder', methods=['POST'])
@role_required(*EDITOR_ROLES)
def reorder_entities(entity):
    table = _REORDER_TABLES.get(entity)
    if not table:
        return jsonify({'success': False, 'error': 'Неизвестный тип'}), 400

    data = request.get_json(silent=True) or {}
    order = data.get('order') or []
    if not isinstance(order, list) or not order:
        return jsonify({'success': False, 'error': 'Пустой список'}), 400

    try:
        with db.transaction(immediate=True) as tx:
            for idx, entity_id in enumerate(order):
                try:
                    eid = int(entity_id)
                except (TypeError, ValueError):
                    continue
                tx.execute(
                    f'UPDATE {table} SET sort_order = ? WHERE id = ?',
                    [idx + 1, eid],
                )
        try:
            from audit import log_action
            log_action('update', entity, None,
                       {'action': 'reorder', 'count': len(order)})
        except Exception:
            pass
        return jsonify({'success': True})
    except Exception as e:
        log.exception('reorder_entities error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ДАННЫЕ ДЛЯ ПЕЧАТИ
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/print-data')
@login_required
def cabinet_print_data(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        pcs = db.query(
            'SELECT * FROM cabinet_computers WHERE cabinet_id = ? ORDER BY sort_order, name',
            [cabinet_id],
        )
        pcs_list = [_decode_computer(p) for p in pcs]

        licenses = db.query('''
            SELECT software_name, license_type, notes
            FROM licenses WHERE cabinet = ?
            ORDER BY software_name
        ''', [cab['cabinet_number']])

        documents = db.query('''
            SELECT id, software_name, original_name, uploaded_at
            FROM license_documents
            WHERE cabinet_number = ?
            ORDER BY software_name, uploaded_at DESC
        ''', [cab['cabinet_number']])

        printers = db.query(
            'SELECT * FROM cabinet_printers WHERE cabinet_id = ? ORDER BY sort_order, model',
            [cabinet_id],
        )

        network = db.query(
            'SELECT * FROM cabinet_network_devices '
            'WHERE cabinet_id = ? ORDER BY sort_order, device_type, model',
            [cabinet_id],
        )

        return jsonify({
            'cabinet': dict(cab),
            'computers': pcs_list,
            'licenses': [dict(l) for l in licenses],
            'documents': [dict(d) for d in documents],
            'printers': [dict(p) for p in printers],
            'network': [dict(n) for n in network],
            'print_date': datetime.now().strftime('%d.%m.%Y %H:%M'),
        })
    except Exception as e:
        log.exception('cabinet_print_data error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СВОДКА
# ============================================================

@bp.route('/api/equipment/summary')
@login_required
def equipment_summary():
    try:
        def _count(sql, params=()):
            return db.query(sql, params, one=True)['c']

        return jsonify({
            'cabinets': _count('SELECT COUNT(*) AS c FROM cabinets WHERE is_active = 1'),
            'network': _count('SELECT COUNT(*) AS c FROM cabinet_network_devices'),
            'computers': _count('SELECT COUNT(*) AS c FROM cabinet_computers'),
            'computers_online': _count(
                "SELECT COUNT(*) AS c FROM cabinet_computers WHERE status = 'online'"
            ),
            'printers': _count('SELECT COUNT(*) AS c FROM cabinet_printers'),
            'documents': _count('SELECT COUNT(*) AS c FROM license_documents'),
        })
    except Exception as e:
        log.exception('equipment_summary error')
        return jsonify({'error': str(e)}), 500