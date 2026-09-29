# equipment_computers.py
"""
Компьютеры кабинета + пинг ПК + QR-код.
QR ведёт на публичную карточку (/qr/pc/<id>), доступную без авторизации.
Периферия, мониторы и история замен компонентов.

Дополнительно:
  • gpu / psu — видеокарта и блок питания
  • duplicate — копирование ПК с новым именем/IP
  • move — перемещение ПК в другой кабинет
  • next-ip — автоподбор свободного IP в подсети кабинета
"""
import io
import json
import re
from datetime import datetime as _dt

from flask import Blueprint, jsonify, request, send_file, session

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
# ХЕЛПЕРЫ ДЛЯ ПЕРИФЕРИИ / МОНИТОРОВ / ИСТОРИИ
# ============================================================

_COMPONENT_FIELDS = {
    'ram':        'ram',
    'storage':    'storage',
    'monitors':   'monitors',
    'speakers':   'speakers',
    'webcam':     'webcam',
    'headphones': 'headphones',
    'microphone': 'microphone',
}

_ARRAY_COMPONENTS = {'ram', 'storage', 'monitors'}
_SINGLE_COMPONENTS = {'speakers', 'webcam', 'headphones', 'microphone'}


def _now_ts():
    return _dt.now().strftime('%Y-%m-%d %H:%M:%S')


def _safe_json_loads(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _log_component_change(tx, pc_id, component_type, action,
                          old_value, new_value, note=None):
    tx.execute('''
        INSERT INTO computer_components_history
            (computer_id, component_type, action, old_value, new_value,
             user_id, user_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
        pc_id,
        component_type,
        action,
        json.dumps(old_value, ensure_ascii=False) if old_value is not None else None,
        json.dumps(new_value, ensure_ascii=False) if new_value is not None else None,
        session.get('user_id'),
        session.get('user_name', ''),
        note or '',
        _now_ts(),
    ])


def _get_pc_or_404(pc_id):
    return db.query(
        'SELECT * FROM cabinet_computers WHERE id = ?',
        [pc_id], one=True,
    )


# ============================================================
# АВТОПОДБОР СЛЕДУЮЩЕГО IP
# ============================================================

_IP_RE = re.compile(r'^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$')


def _parse_ip(ip):
    if not ip:
        return None
    m = _IP_RE.match(str(ip).strip())
    if not m:
        return None
    try:
        parts = [int(m.group(i)) for i in range(1, 5)]
    except (ValueError, TypeError):
        return None
    if any(p < 0 or p > 255 for p in parts):
        return None
    return parts


def _collect_ips(cabinet_id):
    """Все IP из ПК, принтеров и сетевых устройств кабинета."""
    ips = set()
    rows = db.query('''
        SELECT ip_address FROM cabinet_computers
        WHERE cabinet_id = ? AND ip_address IS NOT NULL AND ip_address != ''
    ''', [cabinet_id])
    for r in rows:
        ips.add(str(r['ip_address']).strip())

    rows = db.query('''
        SELECT ip_address FROM cabinet_printers
        WHERE cabinet_id = ? AND ip_address IS NOT NULL AND ip_address != ''
    ''', [cabinet_id])
    for r in rows:
        ips.add(str(r['ip_address']).strip())

    rows = db.query('''
        SELECT ip_address FROM cabinet_network_devices
        WHERE cabinet_id = ? AND ip_address IS NOT NULL AND ip_address != ''
    ''', [cabinet_id])
    for r in rows:
        ips.add(str(r['ip_address']).strip())

    return ips


def _compute_next_ip(cabinet_id):
    """
    Возвращает следующий свободный IP в подсети кабинета.

    Логика:
      1. Собираем все IP кабинета.
      2. Находим самый частый префикс /24 (первые три октета).
      3. Ищем максимальный 4-й октет в этом префиксе и прибавляем 1.
      4. Пропускаем .0, .1, .255.
    """
    ips = _collect_ips(cabinet_id)

    if not ips:
        return '192.168.1.10'

    from collections import Counter
    prefixes = Counter()
    for ip in ips:
        p = _parse_ip(ip)
        if not p:
            continue
        prefixes[f'{p[0]}.{p[1]}.{p[2]}'] += 1

    if not prefixes:
        return '192.168.1.10'

    prefix = prefixes.most_common(1)[0][0]

    used = set()
    for ip in ips:
        p = _parse_ip(ip)
        if not p:
            continue
        if f'{p[0]}.{p[1]}.{p[2]}' != prefix:
            continue
        used.add(p[3])

    for octet in range(10, 255):
        if octet in used:
            continue
        if octet in (0, 1, 255):
            continue
        return f'{prefix}.{octet}'

    return f'{prefix}.10'


@bp.route('/api/cabinets/<int:cabinet_id>/next-ip')
@login_required
def cabinet_next_ip(cabinet_id):
    """Предлагает следующий свободный IP в кабинете."""
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        return jsonify({
            'success': True,
            'next_ip': _compute_next_ip(cabinet_id),
        })
    except Exception as e:
        log.exception('cabinet_next_ip error')
        return jsonify({'success': False, 'error': str(e)}), 500


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

        # Если IP не передан — предложить автоматически
        ip_address = (data.get('ip_address') or '').strip()
        if not ip_address:
            ip_address = _compute_next_ip(cabinet_id)

        order = next_sort_order('cabinet_computers', cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_computers
                    (cabinet_id, name, motherboard, motherboard_socket, cpu,
                     gpu, psu,
                     inventory_number, ip_address, status, ram, storage,
                     monitors, software, notes, sort_order,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, name,
                (data.get('motherboard') or '').strip(),
                (data.get('motherboard_socket') or '').strip(),
                (data.get('cpu') or '').strip(),
                (data.get('gpu') or '').strip(),
                (data.get('psu') or '').strip(),
                (data.get('inventory_number') or '').strip(),
                ip_address,
                data.get('status') or 'offline',
                json.dumps(data.get('ram') or [], ensure_ascii=False),
                json.dumps(data.get('storage') or [], ensure_ascii=False),
                json.dumps(data.get('monitors') or [], ensure_ascii=False),
                json.dumps(data.get('software') or [], ensure_ascii=False),
                (data.get('notes') or '').strip(),
                order, now, now,
            ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>', methods=['GET'])
@login_required
def get_computer(pc_id):
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'error': 'ПК не найден'}), 404

        d = dict(pc)

        for field in ('ram', 'storage', 'software', 'monitors'):
            try:
                d[field] = json.loads(d.get(field) or '[]')
                if not isinstance(d[field], list):
                    d[field] = []
            except Exception:
                d[field] = []

        for field in ('speakers', 'webcam', 'headphones', 'microphone'):
            try:
                raw = d.get(field)
                d[field] = json.loads(raw) if raw else None
            except Exception:
                d[field] = None

        return jsonify(d)
    except Exception as e:
        log.exception('get_computer error')
        return jsonify({'error': str(e)}), 500


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
                    gpu = ?, psu = ?,
                    inventory_number = ?, ip_address = ?, status = ?,
                    ram = ?, storage = ?, monitors = ?, software = ?,
                    notes = ?, updated_at = ?
                WHERE id = ?
            ''', [
                data.get('name', old['name']),
                data.get('motherboard', old['motherboard']),
                data.get('motherboard_socket', old['motherboard_socket']),
                data.get('cpu', old['cpu']),
                data.get('gpu', old['gpu']),
                data.get('psu', old['psu']),
                data.get('inventory_number', old['inventory_number']),
                data.get('ip_address', old['ip_address']),
                data.get('status', old['status']),
                _dump('ram'), _dump('storage'), _dump('monitors'),
                _dump('software'),
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
# ДУБЛИРОВАНИЕ
# ============================================================

@bp.route('/api/computers/<int:pc_id>/duplicate', methods=['POST'])
@role_required(*EDITOR_ROLES)
def duplicate_computer(pc_id):
    """
    Копирует ПК в тот же кабинет.
    Имя и IP можно передать, иначе — автогенерируются.
    """
    try:
        src = _get_pc_or_404(pc_id)
        if not src:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        cabinet_id = src['cabinet_id']

        new_name = (data.get('name') or '').strip()
        if not new_name:
            base = (src['name'] or 'ПК').strip()
            existing = db.query(
                'SELECT name FROM cabinet_computers WHERE cabinet_id = ?',
                [cabinet_id],
            )
            existing_names = {(r['name'] or '').lower() for r in existing}
            n = 1
            while True:
                candidate = f'{base} (копия {n})' if n > 1 else f'{base} (копия)'
                if candidate.lower() not in existing_names:
                    new_name = candidate
                    break
                n += 1
                if n > 100:
                    new_name = f'{base} (копия {_dt.now().strftime("%H%M%S")})'
                    break

        new_ip = (data.get('ip_address') or '').strip()
        if not new_ip:
            new_ip = _compute_next_ip(cabinet_id)

        order = next_sort_order('cabinet_computers', cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_computers
                    (cabinet_id, name, motherboard, motherboard_socket, cpu,
                     gpu, psu,
                     inventory_number, ip_address, status, ram, storage,
                     monitors, software, notes, sort_order,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, new_name,
                src['motherboard'] or '',
                src['motherboard_socket'] or '',
                src['cpu'] or '',
                src['gpu'] or '',
                src['psu'] or '',
                '',  # инвентарный — НЕ копируем, у копии его нет
                new_ip,
                'offline',
                src['ram'] or '[]',
                src['storage'] or '[]',
                src['monitors'] or '[]',
                src['software'] or '[]',
                src['notes'] or '',
                order, now, now,
            ])

        return jsonify({
            'success': True,
            'id': new_id,
            'name': new_name,
            'ip_address': new_ip,
            'message': f'Создана копия «{new_name}»',
        }), 201
    except Exception as e:
        log.exception('duplicate_computer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПЕРЕМЕЩЕНИЕ В ДРУГОЙ КАБИНЕТ
# ============================================================

@bp.route('/api/computers/<int:pc_id>/move', methods=['POST'])
@role_required(*EDITOR_ROLES)
def move_computer(pc_id):
    """
    Перемещает ПК в другой кабинет.
    Body: { cabinet_id: N, new_ip?: '...' }
    """
    try:
        old = _get_pc_or_404(pc_id)
        if not old:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        new_cabinet_id = data.get('cabinet_id')
        try:
            new_cabinet_id = int(new_cabinet_id)
        except (TypeError, ValueError):
            return jsonify({
                'success': False, 'error': 'Некорректный cabinet_id'
            }), 400

        if new_cabinet_id == old['cabinet_id']:
            return jsonify({
                'success': False,
                'error': 'ПК уже находится в этом кабинете',
            }), 400

        new_cab, err = check_cabinet(new_cabinet_id)
        if err:
            return jsonify({
                'success': False, 'error': 'Целевой кабинет не найден'
            }), 404

        # IP: если не передан — предложить в новом кабинете
        new_ip = (data.get('ip_address') or '').strip()
        if not new_ip:
            new_ip = _compute_next_ip(new_cabinet_id)

        order = next_sort_order('cabinet_computers', new_cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            # Отвязываем принтеры, подключённые к этому ПК
            tx.execute(
                'UPDATE cabinet_printers SET connected_to_pc_id = NULL, '
                'connection_type = "network" '
                'WHERE connected_to_pc_id = ?',
                [pc_id],
            )

            tx.execute('''
                UPDATE cabinet_computers
                SET cabinet_id = ?, ip_address = ?, sort_order = ?,
                    updated_at = ?
                WHERE id = ?
            ''', [new_cabinet_id, new_ip, order, now, pc_id])

        try:
            from audit import log_action
            log_action('update', 'cabinet_computers', pc_id, {
                'action': 'move',
                'from_cabinet': old['cabinet_id'],
                'to_cabinet': new_cabinet_id,
                'new_ip': new_ip,
            })
        except Exception:
            pass

        return jsonify({
            'success': True,
            'cabinet_id': new_cabinet_id,
            'ip_address': new_ip,
            'message': f'ПК перемещён в «{new_cab["cabinet_number"]}»',
        })
    except Exception as e:
        log.exception('move_computer error')
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


# ============================================================
# ПЕРИФЕРИЯ / МОНИТОРЫ / ИСТОРИЯ ЗАМЕН
# ============================================================

@bp.route('/api/computers/<int:pc_id>/history', methods=['GET'])
@login_required
def computer_history(pc_id):
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'error': 'ПК не найден'}), 404

        component_type = (request.args.get('type') or '').strip().lower()

        if component_type:
            if component_type not in _COMPONENT_FIELDS:
                return jsonify({'error': 'Неизвестный тип компонента'}), 400
            rows = db.query('''
                SELECT * FROM computer_components_history
                WHERE computer_id = ? AND component_type = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 200
            ''', [pc_id, component_type])
        else:
            rows = db.query('''
                SELECT * FROM computer_components_history
                WHERE computer_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 300
            ''', [pc_id])

        result = []
        for r in rows:
            d = dict(r)
            for f in ('old_value', 'new_value'):
                if d.get(f):
                    try:
                        d[f] = json.loads(d[f])
                    except Exception:
                        pass
            result.append(d)

        return jsonify({'items': result, 'total': len(result)})
    except Exception as e:
        log.exception('computer_history error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>/components/replace', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_replace(pc_id):
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _COMPONENT_FIELDS:
            return jsonify({'success': False, 'error': 'Неизвестный тип'}), 400

        new_value = data.get('value')
        if new_value is None:
            return jsonify({'success': False, 'error': 'Нет значения'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            if ctype in _ARRAY_COMPONENTS:
                arr = _safe_json_loads(pc[column], [])
                if not isinstance(arr, list):
                    arr = []

                idx = data.get('index')
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = -1

                if idx < 0 or idx >= len(arr):
                    return jsonify({
                        'success': False,
                        'error': 'Индекс компонента вне диапазона',
                    }), 400

                old_value = arr[idx]
                arr[idx] = new_value

                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, '
                    f'updated_at = ? WHERE id = ?',
                    [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
                )
            else:
                old_value = _safe_json_loads(pc[column], None)

                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, '
                    f'updated_at = ? WHERE id = ?',
                    [json.dumps(new_value, ensure_ascii=False),
                     _now_ts(), pc_id],
                )

            _log_component_change(
                tx, pc_id, ctype, 'replace', old_value, new_value, note,
            )

        try:
            from audit import log_action
            log_action('update', 'cabinet_computers', pc_id, {
                'action': 'component_replace',
                'type': ctype,
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Компонент заменён'})
    except Exception as e:
        log.exception('computer_component_replace error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>/components/add', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_add(pc_id):
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _ARRAY_COMPONENTS:
            return jsonify({'success': False, 'error': 'Неверный тип'}), 400

        new_value = data.get('value')
        if new_value is None:
            return jsonify({'success': False, 'error': 'Нет значения'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            arr = _safe_json_loads(pc[column], [])
            if not isinstance(arr, list):
                arr = []
            arr.append(new_value)

            tx.execute(
                f'UPDATE cabinet_computers SET {column} = ?, '
                f'updated_at = ? WHERE id = ?',
                [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
            )
            _log_component_change(
                tx, pc_id, ctype, 'add', None, new_value, note,
            )

        return jsonify({'success': True, 'message': 'Компонент добавлен'})
    except Exception as e:
        log.exception('computer_component_add error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/computers/<int:pc_id>/components/remove', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_remove(pc_id):
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _COMPONENT_FIELDS:
            return jsonify({'success': False, 'error': 'Неверный тип'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            if ctype in _ARRAY_COMPONENTS:
                arr = _safe_json_loads(pc[column], [])
                if not isinstance(arr, list):
                    arr = []

                idx = data.get('index')
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = -1

                if idx < 0 or idx >= len(arr):
                    return jsonify({
                        'success': False,
                        'error': 'Индекс вне диапазона',
                    }), 400

                old_value = arr.pop(idx)
                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, '
                    f'updated_at = ? WHERE id = ?',
                    [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
                )
                _log_component_change(
                    tx, pc_id, ctype, 'remove', old_value, None, note,
                )
            else:
                old_value = _safe_json_loads(pc[column], None)
                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = NULL, '
                    f'updated_at = ? WHERE id = ?',
                    [_now_ts(), pc_id],
                )
                _log_component_change(
                    tx, pc_id, ctype, 'remove', old_value, None, note,
                )

        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('computer_component_remove error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ОБНОВЛЕНИЕ СПИСКА ПО
# ============================================================

@bp.route('/api/computers/<int:pc_id>/software', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_computer_software(pc_id):
    """
    Обновляет только список установленного ПО.
    Body: { software: ['Windows 10', 'Office 2021', ...] }
    """
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        software = data.get('software')

        if not isinstance(software, list):
            return jsonify({
                'success': False,
                'error': 'Поле software должно быть массивом',
            }), 400

        # Нормализация: строки, без пустых, без дублей
        clean = []
        seen = set()
        for s in software:
            name = str(s).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            clean.append(name)

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE cabinet_computers SET software = ?, updated_at = ? '
                'WHERE id = ?',
                [json.dumps(clean, ensure_ascii=False), now_str(), pc_id],
            )

        return jsonify({
            'success': True,
            'software': clean,
            'message': 'Список ПО сохранён',
        })
    except Exception as e:
        log.exception('update_computer_software error')
        return jsonify({'success': False, 'error': str(e)}), 500