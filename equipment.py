# equipment.py
"""
IT-инфраструктура: сетевое оборудование, ПК, принтеры по кабинетам.
Автоматический пинг ПК каждые 5 минут.
Документы ПО кабинета.
"""
from flask import Blueprint, request, jsonify, session, send_file
from database import Database
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import json
import os
import re
import uuid
import platform
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from utils import login_required, role_required
from logger import get_logger

log = get_logger(__name__)

equipment_bp = Blueprint('equipment', __name__)
db = Database()

EDITOR_ROLES = ('Администратор', 'Техник')

# ---------- Пути ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ATTACHMENTS_FOLDER = os.path.join(BASE_DIR, 'private_uploads', 'attachments')
DOCUMENTS_FOLDER = os.path.join(BASE_DIR, 'private_uploads', 'documents')
os.makedirs(ATTACHMENTS_FOLDER, exist_ok=True)
os.makedirs(DOCUMENTS_FOLDER, exist_ok=True)

# ---------- Разрешённые расширения ----------
ALLOWED_DOC_EXT = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'rtf',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
    'zip', 'rar', '7z', 'tar', 'gz'
}
MAX_DOC_SIZE = 20 * 1024 * 1024  # 20 МБ

# ---------- Настройки пинга ----------
PING_INTERVAL_SEC = 300   # 5 минут
PING_TIMEOUT_SEC = 2
PING_MAX_WORKERS = 10

_scheduler_started = False
_scheduler_lock = threading.Lock()


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _check_cabinet(cabinet_id):
    c = db.query('SELECT * FROM cabinets WHERE id = ?', [cabinet_id], one=True)
    if not c:
        return None, (jsonify({'error': 'Кабинет не найден'}), 404)
    return c, None


# ============================================================
# PING
# ============================================================

def _ping_host(ip, timeout_sec=PING_TIMEOUT_SEC):
    """Реальный ping через системную команду."""
    if not ip:
        return 'offline'
    ip = str(ip).strip()
    if not ip:
        return 'offline'

    if not re.match(r'^[a-zA-Z0-9\.\-]{1,253}$', ip):
        return 'offline'

    is_windows = platform.system().lower() == 'windows'

    try:
        if is_windows:
            cmd = ['ping', '-n', '1', '-w', str(int(timeout_sec * 1000)), ip]
        else:
            cmd = ['ping', '-c', '1', '-W', str(int(timeout_sec)), ip]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_sec + 2
        )
        return 'online' if result.returncode == 0 else 'offline'
    except subprocess.TimeoutExpired:
        return 'offline'
    except FileNotFoundError:
        log.error('Команда ping не найдена в системе')
        return 'offline'
    except Exception as e:
        log.warning(f'Ошибка ping {ip}: {e}')
        return 'offline'


def _ping_one_computer(pc):
    """Пингует один ПК и обновляет статистику."""
    pc_id = pc['id']
    ip = (pc['ip_address'] or '').strip()
    if not ip:
        return None

    status = _ping_host(ip, timeout_sec=PING_TIMEOUT_SEC)
    now = _now()

    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_computers
                SET status = ?,
                    ping_count = COALESCE(ping_count, 0) + 1,
                    ping_success_count = COALESCE(ping_success_count, 0) +
                                          CASE WHEN ? = 'online' THEN 1 ELSE 0 END,
                    last_ping_at = ?,
                    last_ping_status = ?,
                    updated_at = ?
                WHERE id = ?
            ''', [status, status, now, status, now, pc_id])
        return {'id': pc_id, 'ip': ip, 'status': status}
    except Exception as e:
        log.exception(f'Ошибка обновления статуса ПК #{pc_id}: {e}')
        return None


def ping_all_computers():
    """Пингует все ПК с указанным IP."""
    try:
        pcs = db.query('''
            SELECT id, ip_address FROM cabinet_computers
            WHERE ip_address IS NOT NULL AND ip_address != ''
        ''')
        pcs_with_ip = [dict(p) for p in pcs]

        if not pcs_with_ip:
            return {'total': 0, 'online': 0, 'offline': 0, 'skipped': 0}

        online = 0
        offline = 0

        with ThreadPoolExecutor(max_workers=PING_MAX_WORKERS) as executor:
            futures = {executor.submit(_ping_one_computer, pc): pc for pc in pcs_with_ip}
            for fut in as_completed(futures):
                result = fut.result()
                if result:
                    if result['status'] == 'online':
                        online += 1
                    else:
                        offline += 1

        log.info(f'[PING] Проверено: {online + offline}, online: {online}, offline: {offline}')
        return {'total': online + offline, 'online': online, 'offline': offline, 'skipped': 0}
    except Exception as e:
        log.exception(f'Ошибка ping_all_computers: {e}')
        return {'total': 0, 'online': 0, 'offline': 0, 'skipped': 0}


def _should_run_ping():
    """Защита от двойного запуска при multi-worker."""
    try:
        row = db.query('SELECT MAX(last_ping_at) as last FROM cabinet_computers', one=True)
        if not row or not row['last']:
            return True
        try:
            last = datetime.strptime(row['last'], '%Y-%m-%d %H:%M:%S')
        except Exception:
            return True
        elapsed = (datetime.now() - last).total_seconds()
        return elapsed >= (PING_INTERVAL_SEC - 30)
    except Exception as e:
        log.warning(f'_should_run_ping error: {e}')
        return True


def _ping_scheduler_loop():
    """Бесконечный цикл авто-пинга."""
    log.info(f'[PING] Планировщик запущен. Интервал: {PING_INTERVAL_SEC} сек')
    time.sleep(30)

    while True:
        try:
            if _should_run_ping():
                log.info('[PING] Запуск автоматической проверки...')
                ping_all_computers()
            else:
                log.debug('[PING] Пропуск — недавно проверяли')
        except Exception as e:
            log.exception(f'[PING] Ошибка в цикле: {e}')
        time.sleep(PING_INTERVAL_SEC)


def start_ping_scheduler():
    """Запускает фоновый поток авто-пинга (единожды)."""
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            log.info('[PING] Планировщик уже запущен')
            return
        _scheduler_started = True

    if os.environ.get('WERKZEUG_RUN_MAIN') == 'false':
        log.info('[PING] Flask reloader — не запускаем в родительском процессе')
        return

    t = threading.Thread(target=_ping_scheduler_loop, daemon=True, name='ping-scheduler')
    t.start()
    log.info('[PING] Фоновый поток планировщика запущен')


# ============================================================
# КАРТОЧКА КАБИНЕТА
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/details')
@login_required
def cabinet_details(cabinet_id):
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
            try:
                d['ram'] = json.loads(d.get('ram') or '[]')
            except Exception:
                d['ram'] = []
            try:
                d['storage'] = json.loads(d.get('storage') or '[]')
            except Exception:
                d['storage'] = []
            try:
                d['software'] = json.loads(d.get('software') or '[]')
            except Exception:
                d['software'] = []
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
# СТАТУС ПИНГА
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/ping-status')
@login_required
def cabinet_ping_status(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        rows = db.query('''
            SELECT id, name, ip_address, status,
                   COALESCE(ping_count, 0) as ping_count,
                   COALESCE(ping_success_count, 0) as ping_success_count,
                   last_ping_at, last_ping_status
            FROM cabinet_computers
            WHERE cabinet_id = ?
            ORDER BY id
        ''', [cabinet_id])

        last_ping = None
        for r in rows:
            if r['last_ping_at']:
                if last_ping is None or r['last_ping_at'] > last_ping:
                    last_ping = r['last_ping_at']

        next_ping = None
        if last_ping:
            try:
                next_ping = (datetime.strptime(last_ping, '%Y-%m-%d %H:%M:%S') +
                             timedelta(seconds=PING_INTERVAL_SEC)).strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                pass

        return jsonify({
            'computers': [dict(r) for r in rows],
            'last_ping_at': last_ping,
            'next_ping_at': next_ping,
            'interval_sec': PING_INTERVAL_SEC
        })
    except Exception as e:
        log.exception('cabinet_ping_status error')
        return jsonify({'error': str(e)}), 500


@equipment_bp.route('/api/cabinets/<int:cabinet_id>/ping-all', methods=['POST'])
@role_required(*EDITOR_ROLES)
def ping_all_in_cabinet(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        pcs = db.query('''
            SELECT id, ip_address FROM cabinet_computers
            WHERE cabinet_id = ? AND ip_address IS NOT NULL AND ip_address != ''
        ''', [cabinet_id])

        pcs_with_ip = [dict(p) for p in pcs]
        if not pcs_with_ip:
            return jsonify({'success': True, 'total': 0, 'message': 'Нет ПК с указанным IP'})

        online = 0
        offline = 0
        with ThreadPoolExecutor(max_workers=PING_MAX_WORKERS) as executor:
            futures = {executor.submit(_ping_one_computer, pc): pc for pc in pcs_with_ip}
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
            'message': f'Проверено {online + offline}: online {online}, offline {offline}'
        })
    except Exception as e:
        log.exception('ping_all_in_cabinet error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>/ping', methods=['POST'])
@login_required
def ping_computer(pc_id):
    try:
        pc = db.query('SELECT * FROM cabinet_computers WHERE id = ?', [pc_id], one=True)
        if not pc:
            return jsonify({'success': False, 'error': 'Компьютер не найден'}), 404

        ip = (pc['ip_address'] or '').strip()
        if not ip:
            return jsonify({
                'success': False,
                'error': 'У ПК не указан IP-адрес',
                'status': 'offline'
            }), 400

        result = _ping_one_computer({'id': pc_id, 'ip_address': ip})

        if result:
            updated = db.query(
                'SELECT status, ping_count, ping_success_count, last_ping_at '
                'FROM cabinet_computers WHERE id = ?',
                [pc_id], one=True
            )
            return jsonify({
                'success': True,
                'status': updated['status'],
                'ping_count': updated['ping_count'],
                'ping_success_count': updated['ping_success_count'],
                'last_ping_at': updated['last_ping_at'],
                'ip': ip,
                'message': f'{ip} — {"доступен" if updated["status"] == "online" else "недоступен"}'
            })
        return jsonify({'success': False, 'error': 'Не удалось выполнить ping'}), 500
    except Exception as e:
        log.exception('ping_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# СЕТЕВОЕ ОБОРУДОВАНИЕ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/network', methods=['POST'])
@role_required(*EDITOR_ROLES)
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
        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
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
@role_required(*EDITOR_ROLES)
def update_network(device_id):
    try:
        old = db.query('SELECT * FROM cabinet_network_devices WHERE id = ?', [device_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Устройство не найдено'}), 404

        data = request.get_json() or {}
        with db.transaction(immediate=True) as tx:
            tx.execute('''
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
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/network/<int:device_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_network(device_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinet_network_devices WHERE id = ?', [device_id])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# КОМПЬЮТЕРЫ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/computers', methods=['POST'])
@role_required(*EDITOR_ROLES)
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
        software = data.get('software') or []

        now = _now()
        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_computers
                    (cabinet_id, name, motherboard, motherboard_socket, cpu,
                     inventory_number, ip_address, status, ram, storage,
                     software, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, name,
                (data.get('motherboard') or '').strip(),
                (data.get('motherboard_socket') or '').strip(),
                (data.get('cpu') or '').strip(),
                (data.get('inventory_number') or '').strip(),
                (data.get('ip_address') or '').strip(),
                data.get('status') or 'offline',
                json.dumps(ram, ensure_ascii=False),
                json.dumps(storage, ensure_ascii=False),
                json.dumps(software, ensure_ascii=False),
                (data.get('notes') or '').strip(),
                now, now
            ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_computer(pc_id):
    try:
        old = db.query('SELECT * FROM cabinet_computers WHERE id = ?', [pc_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json() or {}
        ram = data.get('ram')
        storage = data.get('storage')
        software = data.get('software')

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
                json.dumps(ram, ensure_ascii=False) if ram is not None else old['ram'],
                json.dumps(storage, ensure_ascii=False) if storage is not None else old['storage'],
                json.dumps(software, ensure_ascii=False) if software is not None else old['software'],
                data.get('notes', old['notes']),
                _now(), pc_id
            ])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/computers/<int:pc_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_computer(pc_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE cabinet_printers SET connected_to_pc_id = NULL WHERE connected_to_pc_id = ?', [pc_id])
            tx.execute('DELETE FROM cabinet_computers WHERE id = ?', [pc_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПРИНТЕРЫ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/printers', methods=['POST'])
@role_required(*EDITOR_ROLES)
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
        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_printers
                    (cabinet_id, model, cartridge, inventory_number, ip_address,
                     connected_to_pc_id, notes, created_at, updated_at)
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
@role_required(*EDITOR_ROLES)
def update_printer(printer_id):
    try:
        old = db.query('SELECT * FROM cabinet_printers WHERE id = ?', [printer_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json() or {}
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_printers
                SET model = ?, cartridge = ?, inventory_number = ?, ip_address = ?,
                    connected_to_pc_id = ?, notes = ?, updated_at = ?
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
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/printers/<int:printer_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_printer(printer_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinet_printers WHERE id = ?', [printer_id])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/printers/<int:printer_id>/connect', methods=['POST'])
@role_required(*EDITOR_ROLES)
def connect_printer(printer_id):
    try:
        data = request.get_json() or {}
        pc_id = data.get('pc_id')
        if pc_id in (None, '', 'null'):
            pc_id = None

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE cabinet_printers SET connected_to_pc_id = ?, updated_at = ? WHERE id = ?',
                       [pc_id, _now(), printer_id])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ИМПОРТ ПРИНТЕРОВ ИЗ КАРТРИДЖЕЙ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/printers/import-from-cartridges', methods=['POST'])
@role_required(*EDITOR_ROLES)
def import_printers_from_cartridges(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        cab_num = cab['cabinet_number']

        cartridges = db.query('''
            SELECT printer, cartridge, full_name, notes
            FROM cartridges WHERE cabinet = ?
        ''', [cab_num])

        if not cartridges:
            return jsonify({
                'success': True, 'imported': 0, 'skipped': 0, 'total': 0,
                'message': 'В модуле «Картриджи» нет записей для этого кабинета'
            })

        existing = db.query(
            'SELECT model, cartridge FROM cabinet_printers WHERE cabinet_id = ?',
            [cabinet_id]
        )
        existing_set = set()
        for e in existing:
            existing_set.add(((e['model'] or '').strip().lower(),
                              (e['cartridge'] or '').strip().lower()))

        imported = 0
        skipped = 0
        now = _now()

        with db.transaction(immediate=True) as tx:
            for c in cartridges:
                printer_model = (c['printer'] or '').strip()
                cart_model = (c['cartridge'] or '').strip()
                if not printer_model:
                    skipped += 1
                    continue
                key = (printer_model.lower(), cart_model.lower())
                if key in existing_set:
                    skipped += 1
                    continue

                notes_parts = []
                if c['full_name']:
                    notes_parts.append(f"Ответственный: {c['full_name'].strip()}")
                if c['notes']:
                    notes_parts.append(c['notes'].strip())
                notes = '; '.join(notes_parts)

                tx.execute('''
                    INSERT INTO cabinet_printers
                        (cabinet_id, model, cartridge, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', [cabinet_id, printer_model, cart_model, notes, now, now])

                existing_set.add(key)
                imported += 1

        try:
            from audit import log_action
            log_action('import', 'cabinet_printers', cabinet_id, {
                'cabinet': cab_num, 'imported': imported, 'skipped': skipped
            })
        except Exception:
            pass

        return jsonify({
            'success': True, 'imported': imported, 'skipped': skipped,
            'total': len(cartridges),
            'message': f'Импортировано: {imported}, пропущено: {skipped}'
        })
    except Exception as e:
        log.exception('import_printers_from_cartridges error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ДОСТУПНОЕ ПО
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/available-software')
@login_required
def available_software(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        licenses = db.query('''
            SELECT DISTINCT software_name, license_type
            FROM licenses WHERE cabinet = ?
            ORDER BY software_name
        ''', [cab['cabinet_number']])

        result = []
        for l in licenses:
            if l['software_name']:
                result.append({
                    'name': l['software_name'].strip(),
                    'type': (l['license_type'] or '').strip()
                })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# ДОКУМЕНТЫ ПО
# ============================================================

def _allowed_doc(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_DOC_EXT


def _resolve_doc_path(record):
    """Возвращает реальный путь к файлу документа."""
    if isinstance(record, dict):
        stored = (record.get('filename') or '').strip()
    else:
        try:
            stored = (record['filename'] or '').strip()
        except Exception:
            stored = ''
    if not stored:
        return None

    candidates = [
        os.path.join(DOCUMENTS_FOLDER, stored),
        os.path.join(BASE_DIR, 'static', 'uploads', 'documents', stored),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


@equipment_bp.route('/api/cabinets/<int:cabinet_id>/documents', methods=['GET'])
@login_required
def list_cabinet_documents(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        rows = db.query('''
            SELECT d.*, u.full_name as uploaded_by_name
            FROM license_documents d
            LEFT JOIN users u ON u.id = d.uploaded_by
            WHERE d.cabinet_number = ?
            ORDER BY d.uploaded_at DESC
        ''', [cab['cabinet_number']])

        result = []
        for r in rows:
            d = dict(r)
            d['file_exists'] = _resolve_doc_path(d) is not None
            result.append(d)
        return jsonify(result)
    except Exception as e:
        log.exception('list_cabinet_documents error')
        return jsonify({'error': str(e)}), 500


@equipment_bp.route('/api/cabinets/<int:cabinet_id>/documents', methods=['POST'])
@role_required(*EDITOR_ROLES)
def upload_cabinet_document(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не передан'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        if not _allowed_doc(file.filename):
            return jsonify({
                'success': False,
                'error': 'Недопустимый формат. Разрешены: PDF, DOC, XLS, TXT, изображения, архивы'
            }), 400

        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_DOC_SIZE:
            return jsonify({
                'success': False,
                'error': f'Файл слишком большой (макс. {MAX_DOC_SIZE // 1024 // 1024} МБ)'
            }), 413

        license_id = request.form.get('license_id')
        try:
            license_id = int(license_id) if license_id else None
        except (ValueError, TypeError):
            license_id = None

        software_name = (request.form.get('software_name') or '').strip()

        if license_id:
            lic = db.query('SELECT * FROM licenses WHERE id = ?', [license_id], one=True)
            if lic:
                software_name = lic['software_name'] or software_name

        original_name = file.filename
        ext = original_name.rsplit('.', 1)[1].lower()
        unique_name = f'{uuid.uuid4().hex}.{ext}'
        safe_name = secure_filename(unique_name) or unique_name

        cab_folder_name = str(cab['cabinet_number']).replace('/', '_').replace('\\', '_')
        cab_folder = os.path.join(DOCUMENTS_FOLDER, cab_folder_name)
        os.makedirs(cab_folder, exist_ok=True)

        filepath = os.path.join(cab_folder, safe_name)
        file.save(filepath)

        rel_path = f'{cab_folder_name}/{safe_name}'

        now = _now()
        with db.transaction(immediate=True) as tx:
            doc_id = tx.execute('''
                INSERT INTO license_documents
                    (license_id, cabinet_number, software_name, filename, original_name,
                     file_size, mime_type, uploaded_by, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                license_id,
                cab['cabinet_number'],
                software_name,
                rel_path,
                original_name,
                size,
                file.mimetype or 'application/octet-stream',
                session.get('user_id'),
                now
            ])

        try:
            from audit import log_action
            log_action('create', 'license_document', doc_id, {
                'cabinet': cab['cabinet_number'],
                'software': software_name,
                'filename': original_name
            })
        except Exception:
            pass

        return jsonify({
            'success': True,
            'document_id': doc_id,
            'message': 'Документ загружен'
        }), 201
    except Exception as e:
        log.exception('upload_cabinet_document error')
        return jsonify({'success': False, 'error': str(e)}), 500


@equipment_bp.route('/api/documents/<int:doc_id>/download', methods=['GET'])
@login_required
def download_document(doc_id):
    try:
        doc = db.query('SELECT * FROM license_documents WHERE id = ?', [doc_id], one=True)
        if not doc:
            return jsonify({'error': 'Документ не найден'}), 404

        filepath = _resolve_doc_path(doc)
        if not filepath:
            return jsonify({'error': 'Файл не найден на диске'}), 404

        return send_file(
            filepath,
            as_attachment=True,
            download_name=doc['original_name'] or os.path.basename(filepath)
        )
    except Exception as e:
        log.exception('download_document error')
        return jsonify({'error': str(e)}), 500


@equipment_bp.route('/api/documents/<int:doc_id>/view', methods=['GET'])
@login_required
def view_document(doc_id):
    try:
        doc = db.query('SELECT * FROM license_documents WHERE id = ?', [doc_id], one=True)
        if not doc:
            return jsonify({'error': 'Документ не найден'}), 404

        filepath = _resolve_doc_path(doc)
        if not filepath:
            return jsonify({'error': 'Файл не найден'}), 404

        return send_file(filepath, mimetype=doc['mime_type'] or 'application/octet-stream')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@equipment_bp.route('/api/documents/<int:doc_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_document(doc_id):
    try:
        doc = db.query('SELECT * FROM license_documents WHERE id = ?', [doc_id], one=True)
        if not doc:
            return jsonify({'success': False, 'error': 'Документ не найден'}), 404

        filepath = _resolve_doc_path(doc)
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                log.warning(f'Не удалось удалить файл {filepath}: {e}')

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM license_documents WHERE id = ?', [doc_id])

        try:
            from audit import log_action
            log_action('delete', 'license_document', doc_id, {
                'cabinet': doc['cabinet_number'],
                'filename': doc['original_name']
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Документ удалён'})
    except Exception as e:
        log.exception('delete_document error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ДАННЫЕ ДЛЯ ПЕЧАТИ
# ============================================================

@equipment_bp.route('/api/cabinets/<int:cabinet_id>/print-data', methods=['GET'])
@login_required
def cabinet_print_data(cabinet_id):
    try:
        cab, err = _check_cabinet(cabinet_id)
        if err:
            return err

        pcs = db.query('''
            SELECT * FROM cabinet_computers WHERE cabinet_id = ? ORDER BY name
        ''', [cabinet_id])

        pcs_list = []
        for p in pcs:
            d = dict(p)
            try:
                d['ram'] = json.loads(d.get('ram') or '[]')
            except Exception:
                d['ram'] = []
            try:
                d['storage'] = json.loads(d.get('storage') or '[]')
            except Exception:
                d['storage'] = []
            try:
                d['software'] = json.loads(d.get('software') or '[]')
            except Exception:
                d['software'] = []
            pcs_list.append(d)

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

        printers = db.query('''
            SELECT * FROM cabinet_printers WHERE cabinet_id = ? ORDER BY model
        ''', [cabinet_id])

        network = db.query('''
            SELECT * FROM cabinet_network_devices WHERE cabinet_id = ? ORDER BY device_type, model
        ''', [cabinet_id])

        return jsonify({
            'cabinet': dict(cab),
            'computers': pcs_list,
            'licenses': [dict(l) for l in licenses],
            'documents': [dict(d) for d in documents],
            'printers': [dict(p) for p in printers],
            'network': [dict(n) for n in network],
            'print_date': datetime.now().strftime('%d.%m.%Y %H:%M')
        })
    except Exception as e:
        log.exception('cabinet_print_data error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СВОДКА
# ============================================================

@equipment_bp.route('/api/equipment/summary')
@login_required
def equipment_summary():
    try:
        net_count = db.query('SELECT COUNT(*) as c FROM cabinet_network_devices', one=True)['c']
        pc_count = db.query('SELECT COUNT(*) as c FROM cabinet_computers', one=True)['c']
        pc_online = db.query("SELECT COUNT(*) as c FROM cabinet_computers WHERE status = 'online'", one=True)['c']
        printer_count = db.query('SELECT COUNT(*) as c FROM cabinet_printers', one=True)['c']
        cabinets_count = db.query('SELECT COUNT(*) as c FROM cabinets WHERE is_active = 1', one=True)['c']
        documents_count = db.query('SELECT COUNT(*) as c FROM license_documents', one=True)['c']

        return jsonify({
            'cabinets': cabinets_count,
            'network': net_count,
            'computers': pc_count,
            'computers_online': pc_online,
            'printers': printer_count,
            'documents': documents_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500