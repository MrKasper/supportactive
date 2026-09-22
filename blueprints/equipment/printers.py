# equipment_printers.py
"""
Принтеры кабинета: CRUD, замена принтера / картриджа,
импорт из модуля «Картриджи», QR-код.

Драйверы — в equipment_drivers.py
Синхронизация с картриджами — в services/cartridge_sync.py
"""
import io

from flask import (
    Blueprint, jsonify, request, send_file, session,
)

from database import Database
from utils import (
    role_required, login_required, human_size, normalize_int_id,
)
from logger import get_logger
from constants import EDITOR_ROLES, CONN_NETWORK, CONN_USB, ALL_CONN_TYPES
from .helpers import check_cabinet, next_sort_order, now_str

# Импорт хелперов из модуля драйверов — чтобы не сломать существующие импорты
from .drivers import (
    model_slug as _model_slug,
    invalidate_drivers_cache,
)
from services.cartridge_sync import (
    sync_cartridge_replacement,
    invalidate_cartridges_cache,
)

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_printers', __name__)


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _normalize_conn_type(value, default=CONN_NETWORK):
    v = (value or default or CONN_NETWORK).strip().lower()
    return v if v in ALL_CONN_TYPES else default


# ============================================================
# CRUD ПРИНТЕРОВ
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/printers', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_printer(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        data = request.get_json(silent=True) or {}
        model = (data.get('model') or '').strip()
        if not model:
            return jsonify({'success': False, 'error': 'Укажите модель принтера'}), 400

        conn_type = _normalize_conn_type(data.get('connection_type'))
        ip_address = (
            (data.get('ip_address') or '').strip()
            if conn_type == CONN_NETWORK else ''
        )
        pc_id = (
            normalize_int_id(data.get('connected_to_pc_id'))
            if conn_type == CONN_USB else None
        )

        order = next_sort_order('cabinet_printers', cabinet_id)
        now = now_str()

        with db.transaction(immediate=True) as tx:
            new_id = tx.execute('''
                INSERT INTO cabinet_printers
                    (cabinet_id, model, cartridge, inventory_number, ip_address,
                     connected_to_pc_id, connection_type, notes, sort_order,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                cabinet_id, model,
                (data.get('cartridge') or '').strip(),
                (data.get('inventory_number') or '').strip(),
                ip_address, pc_id, conn_type,
                (data.get('notes') or '').strip(),
                order, now, now,
            ])
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        log.exception('create_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_printer(printer_id):
    try:
        old = db.query(
            'SELECT * FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json(silent=True) or {}
        conn_type = _normalize_conn_type(
            data.get('connection_type') or old['connection_type']
        )

        if conn_type == CONN_NETWORK:
            ip_address = (
                data['ip_address'].strip()
                if 'ip_address' in data else (old['ip_address'] or '')
            )
            pc_id = None
        else:
            ip_address = ''
            pc_id = (
                normalize_int_id(data.get('connected_to_pc_id'))
                if 'connected_to_pc_id' in data else old['connected_to_pc_id']
            )

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_printers
                SET model = ?, cartridge = ?, inventory_number = ?, ip_address = ?,
                    connected_to_pc_id = ?, connection_type = ?, notes = ?, updated_at = ?
                WHERE id = ?
            ''', [
                data.get('model', old['model']),
                data.get('cartridge', old['cartridge']),
                data.get('inventory_number', old['inventory_number']),
                ip_address, pc_id, conn_type,
                data.get('notes', old['notes']),
                now_str(), printer_id,
            ])

        # Если поменялась модель — сбрасываем кеш драйверов
        new_model = data.get('model')
        if new_model and new_model != old['model']:
            invalidate_drivers_cache(old['model'] or '')
            invalidate_drivers_cache(new_model)

        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_printer(printer_id):
    try:
        old = db.query(
            'SELECT id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinet_printers WHERE id = ?', [printer_id])

        if old:
            invalidate_drivers_cache(old['model'] or '')

        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/connect', methods=['POST'])
@role_required(*EDITOR_ROLES)
def connect_printer(printer_id):
    try:
        data = request.get_json(silent=True) or {}
        pc_id = normalize_int_id(data.get('pc_id'))
        conn_type = CONN_USB if pc_id else CONN_NETWORK

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_printers
                SET connected_to_pc_id = ?, connection_type = ?, updated_at = ?
                WHERE id = ?
            ''', [pc_id, conn_type, now_str(), printer_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('connect_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ИМПОРТ ИЗ КАРТРИДЖЕЙ
# ============================================================

@bp.route(
    '/api/cabinets/<int:cabinet_id>/printers/import-from-cartridges',
    methods=['POST'],
)
@role_required(*EDITOR_ROLES)
def import_printers_from_cartridges(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
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
                'message': 'В модуле «Картриджи» нет записей для этого кабинета',
            })

        existing = db.query(
            'SELECT model, cartridge FROM cabinet_printers WHERE cabinet_id = ?',
            [cabinet_id],
        )
        existing_set = {
            ((e['model'] or '').strip().lower(),
             (e['cartridge'] or '').strip().lower())
            for e in existing
        }

        order = next_sort_order('cabinet_printers', cabinet_id)
        imported = 0
        skipped = 0
        now = now_str()

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

                tx.execute('''
                    INSERT INTO cabinet_printers
                        (cabinet_id, model, cartridge, notes, connection_type,
                         sort_order, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    cabinet_id, printer_model, cart_model,
                    '; '.join(notes_parts), CONN_NETWORK,
                    order, now, now,
                ])
                existing_set.add(key)
                order += 1
                imported += 1

        try:
            from audit import log_action
            log_action('import', 'cabinet_printers', cabinet_id, {
                'cabinet': cab_num, 'imported': imported, 'skipped': skipped,
            })
        except Exception:
            pass

        return jsonify({
            'success': True, 'imported': imported, 'skipped': skipped,
            'total': len(cartridges),
            'message': f'Импортировано: {imported}, пропущено: {skipped}',
        })
    except Exception as e:
        log.exception('import_printers_from_cartridges error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ЗАМЕНА ПРИНТЕРА / КАРТРИДЖА
# ============================================================

@bp.route('/api/printers/<int:printer_id>/replace', methods=['POST'])
@role_required(*EDITOR_ROLES)
def replace_printer(printer_id):
    try:
        old = db.query(
            'SELECT * FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json(silent=True) or {}
        model = (data.get('model') or '').strip()
        if not model:
            return jsonify({'success': False, 'error': 'Укажите модель'}), 400

        conn_type = _normalize_conn_type(data.get('connection_type'))
        ip_address = (
            (data.get('ip_address') or '').strip()
            if conn_type == CONN_NETWORK else ''
        )
        pc_id = (
            normalize_int_id(data.get('connected_to_pc_id'))
            if conn_type == CONN_USB else None
        )

        now = now_str()
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_printers
                SET model = ?, cartridge = ?, inventory_number = ?,
                    ip_address = ?, connected_to_pc_id = ?, connection_type = ?,
                    notes = ?, last_printer_replaced_at = ?, updated_at = ?
                WHERE id = ?
            ''', [
                model,
                (data.get('cartridge') or '').strip(),
                (data.get('inventory_number') or '').strip(),
                ip_address, pc_id, conn_type,
                data.get('notes', old['notes'] or ''),
                now, now, printer_id,
            ])

        # Старая и новая модель — сбрасываем кеш драйверов
        invalidate_drivers_cache(old['model'] or '')
        invalidate_drivers_cache(model)

        try:
            from audit import log_action
            log_action('update', 'cabinet_printers', printer_id, {
                'action': 'replace_printer',
                'old_model': old['model'],
                'new_model': model,
            })
        except Exception:
            pass

        log.info(f'[PRINTER] Заменён принтер #{printer_id}: '
                 f'{old["model"]} → {model}')

        return jsonify({
            'success': True,
            'message': 'Принтер заменён',
            'replaced_at': now,
        })
    except Exception as e:
        log.exception('replace_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/replace-cartridge', methods=['POST'])
@role_required(*EDITOR_ROLES)
def replace_cartridge(printer_id):
    try:
        old = db.query(
            'SELECT * FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json(silent=True) or {}
        cartridge = (data.get('cartridge') or '').strip()
        if not cartridge:
            return jsonify({'success': False, 'error': 'Укажите картридж'}), 400

        # Данные кабинета — для синхронизации с модулем «Картриджи»
        cab = db.query(
            'SELECT cabinet_number, responsible_person '
            'FROM cabinets WHERE id = ?',
            [old['cabinet_id']], one=True,
        )
        cabinet_number = (cab['cabinet_number'] if cab else '') or ''
        responsible = (cab['responsible_person'] if cab else '') or ''

        old_cartridge = (old['cartridge'] or '').strip()
        now = now_str()

        sync_info = {'action': 'skipped'}

        with db.transaction(immediate=True) as tx:
            # 1. Обновляем сам принтер
            tx.execute('''
                UPDATE cabinet_printers
                SET cartridge = ?, last_cartridge_replaced_at = ?,
                    updated_at = ?
                WHERE id = ?
            ''', [cartridge, now, now, printer_id])

            # 2. Синхронизация с таблицей cartridges
            try:
                sync_info = sync_cartridge_replacement(
                    tx,
                    cabinet_number,
                    old['model'] or '',
                    cartridge,
                    responsible,
                    now,
                )
            except Exception as sync_err:
                log.warning(
                    f'[CARTRIDGE] sync to cartridges failed: {sync_err}'
                )
                sync_info = {'action': 'error', 'reason': str(sync_err)}

        # Сброс кеша статистики картриджей
        if sync_info.get('action') in ('created', 'updated_dates'):
            invalidate_cartridges_cache()

        try:
            from audit import log_action
            log_action('update', 'cabinet_printers', printer_id, {
                'action': 'replace_cartridge',
                'old_cartridge': old_cartridge,
                'new_cartridge': cartridge,
                'cartridges_sync': sync_info,
            })
        except Exception:
            pass

        log.info(
            f'[CARTRIDGE] Заменён картридж принтера #{printer_id}: '
            f'{old_cartridge} → {cartridge} (sync={sync_info.get("action")})'
        )

        return jsonify({
            'success': True,
            'message': 'Картридж заменён',
            'replaced_at': now,
            'cartridges_sync': sync_info,
        })
    except Exception as e:
        log.exception('replace_cartridge error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# QR-КОД
# ============================================================

@bp.route('/api/printers/<int:printer_id>/qr')
@role_required(*EDITOR_ROLES)
def printer_qr(printer_id):
    try:
        import qrcode

        pr = db.query(
            'SELECT id, cabinet_id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not pr:
            return jsonify({'error': 'Принтер не найден'}), 404

        base = request.host_url.rstrip('/')
        target = f'{base}/qr/printer/{printer_id}'

        qr = qrcode.QRCode(
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
            download_name=f'printer_{printer_id}_qr.png',
        )
    except ImportError:
        return jsonify({'error': 'qrcode не установлен'}), 500
    except Exception as e:
        log.exception('printer_qr error')
        return jsonify({'error': str(e)}), 500