# equipment_printers.py
"""
Принтеры кабинета + привязка к ПК + импорт из Картриджей + QR-код +
замена принтера / картриджа + драйверы (просмотр, загрузка, удаление).
При замене картриджа — синхронизация с модулем «Картриджи».
"""
import io
import os
import re
import uuid

from flask import Blueprint, jsonify, request, send_file, current_app, session

from database import Database
from utils import role_required, login_required
from logger import get_logger
from constants import EDITOR_ROLES, CONN_NETWORK, CONN_USB, ALL_CONN_TYPES
from equipment_helpers import check_cabinet, next_sort_order, now_str

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_printers', __name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Лимит файлов при сканировании папки драйверов
_MAX_DRIVER_FILES = 300

# Максимальный размер одного файла драйвера (100 МБ)
_MAX_DRIVER_FILE_SIZE = 100 * 1024 * 1024

# Разрешённые расширения для загрузки драйверов
_ALLOWED_DRIVER_EXT = {
    'exe', 'msi', 'zip', 'rar', '7z', 'tar', 'gz',
    'pdf', 'txt', 'inf', 'cab', 'dmg', 'pkg', 'deb', 'rpm',
    'doc', 'docx', 'chm', 'bat', 'cmd', 'ps1', 'sh',
}

# Стоп-слова: общие для всех принтеров, не помогают для матчинга
_DRIVER_STOPWORDS = {
    'hp', 'canon', 'xerox', 'brother', 'epson', 'kyocera', 'samsung',
    'ricoh', 'oki', 'pantum', 'konica', 'minolta', 'lexmark', 'sharp',
    'toshiba', 'panasonic', 'dell', 'lenovo',
    'printer', 'mfp', 'laser', 'laserjet', 'inkjet', 'officejet',
    'deskjet', 'designjet', 'pagewide', 'smart', 'tank', 'ecotank',
    'imageclass', 'imagerunner', 'pixma', 'maxify',
    'pro', 'plus', 'series', 'color', 'colour', 'black', 'white',
    'all', 'in', 'one', 'allinone', 'multifunction', 'mono',
    'print', 'scan', 'copy', 'fax', 'мастер', 'принтер', 'мфу',
    'для', 'и',
}


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _normalize_conn_type(value, default=CONN_NETWORK):
    v = (value or default or CONN_NETWORK).strip().lower()
    return v if v in ALL_CONN_TYPES else default


def _normalize_pc_id(value):
    if value in (None, '', 'null', 'undefined'):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_text(s):
    """Оставляет только буквы и цифры, приводит к нижнему регистру."""
    if not s:
        return ''
    return re.sub(r'[^a-z0-9а-яё]', '', str(s).lower())


def _unique_tokens(model):
    """Уникальные токены модели без стоп-слов."""
    if not model:
        return []
    raw = re.split(r'[\s\-_/()\[\]{}.,;:]+', str(model).lower())
    tokens = []
    for t in raw:
        t_norm = _normalize_text(t)
        if not t_norm or len(t_norm) < 3:
            continue
        if t_norm in _DRIVER_STOPWORDS:
            continue
        if t_norm not in tokens:
            tokens.append(t_norm)
    return tokens


def _model_slug(model):
    """
    Нормализованное имя модели для имени папки.
    'HP LaserJet Pro M404dn' → 'hp_laserjet_pro_m404dn'
    """
    if not model:
        return '_unknown'
    slug = re.sub(r'[^a-z0-9а-яё]+', '_', str(model).lower())
    slug = slug.strip('_')
    if not slug:
        return '_unknown'
    return slug[:80]


def _human_size(b):
    if not b:
        return '0 Б'
    k = 1024
    sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
    i = 0
    v = float(b)
    while v >= k and i < len(sizes) - 1:
        v /= k
        i += 1
    return f'{int(v)} {sizes[i]}' if i == 0 else f'{v:.1f} {sizes[i]}'


def _get_drivers_folder():
    return current_app.config.get('DRIVERS_FOLDER') or os.path.join(
        BASE_DIR, 'private_uploads', 'drivers'
    )


def _is_file_match(rel_path, tokens):
    """Файл подходит, если его путь содержит хотя бы один токен модели."""
    if not tokens:
        return False
    haystack = _normalize_text(rel_path)
    for t in tokens:
        if t and t in haystack:
            return True
    return False


def _scan_drivers(model):
    """
    Сканирует папку драйверов. Возвращает список dict:
      { path, name, size, size_human, group, is_common, model_slug, can_delete }
    """
    root = _get_drivers_folder()
    if not os.path.isdir(root):
        return []

    tokens = _unique_tokens(model)
    current_slug = _model_slug(model)
    result = []
    count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith('.')]
        for fname in filenames:
            if fname.startswith('.'):
                continue
            count += 1
            if count > _MAX_DRIVER_FILES:
                break

            full = os.path.join(dirpath, fname)
            if not os.path.isfile(full):
                continue

            rel = os.path.relpath(full, root).replace('\\', '/')
            parts = rel.split('/')
            group = parts[0] if len(parts) > 1 else ''
            is_common = (group == '_common')
            file_slug = group if group and not is_common else ''

            # Матчинг: общие или по токенам
            if not is_common and not _is_file_match(rel, tokens):
                continue

            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0

            # Удалять можно только файлы из папки текущего принтера
            can_delete = (
                not is_common
                and file_slug == current_slug
            )

            result.append({
                'path': rel,
                'name': fname,
                'size': size,
                'size_human': _human_size(size),
                'group': 'Общие' if is_common else (group or 'Разное'),
                'is_common': is_common,
                'model_slug': file_slug,
                'can_delete': can_delete,
            })

        if count > _MAX_DRIVER_FILES:
            break

    result.sort(key=lambda x: (x['is_common'], x['name'].lower()))
    return result


def _resolve_safe_path(rel_path):
    """Безопасный путь внутри DRIVERS_FOLDER. Возвращает abs или None."""
    if not rel_path:
        return None
    root = os.path.realpath(_get_drivers_folder())
    full = os.path.realpath(os.path.join(root, rel_path))
    if not (full == root or full.startswith(root + os.sep)):
        return None
    return full


# ============================================================
# СИНХРОНИЗАЦИЯ С МОДУЛЕМ «КАРТРИДЖИ»
# ============================================================

def _append_replacement_date(dates_str, new_date):
    """Добавляет дату к CSV-строке replacement_dates."""
    dates_str = (dates_str or '').strip()
    if not dates_str:
        return new_date
    parts = [d.strip() for d in dates_str.split(',') if d.strip()]
    parts.append(new_date)
    return ','.join(parts)


def _sync_cartridge_replacement(tx, cabinet_number, printer_model,
                                 new_cartridge, responsible, now):
    """
    Синхронизирует замену картриджа с таблицей `cartridges`
    (модуль «Картриджи»).

    Логика:
      1. Ищем по (cabinet, printer, cartridge) — добавляем дату.
      2. Если нет — создаём новую запись.

    Возвращает dict с описанием результата.
    """
    if not cabinet_number or not printer_model:
        return {'action': 'skipped', 'reason': 'no_cabinet_or_printer'}

    cabinet_number = cabinet_number.strip()
    printer_model = printer_model.strip()
    new_cartridge = (new_cartridge or '').strip()

    # 1. Точное совпадение cabinet + printer + cartridge
    existing = tx.query('''
        SELECT id, replacement_dates FROM cartridges
        WHERE cabinet = ? AND printer = ? AND cartridge = ?
        ORDER BY id DESC LIMIT 1
    ''', [cabinet_number, printer_model, new_cartridge], one=True)

    if existing:
        new_dates = _append_replacement_date(
            existing['replacement_dates'], now
        )
        tx.execute(
            'UPDATE cartridges SET replacement_dates = ? WHERE id = ?',
            [new_dates, existing['id']],
        )
        return {'action': 'updated_dates', 'id': existing['id']}

    # 2. Новая запись
    new_id = tx.execute('''
        INSERT INTO cartridges
            (cabinet, full_name, printer, cartridge,
             replacement_dates, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', [
        cabinet_number,
        responsible or '',
        printer_model,
        new_cartridge,
        now,
        'Создано автоматически при замене картриджа',
    ])
    return {'action': 'created', 'id': new_id}


def _invalidate_cartridges_cache():
    """Сброс кеша статистики картриджей, чтобы UI обновился сразу."""
    try:
        from extensions import cache
        cache.delete('cartridges_stats')
        cache.delete('cartridges_monthly_stats')
    except Exception:
        pass


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
            _normalize_pc_id(data.get('connected_to_pc_id'))
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
                _normalize_pc_id(data.get('connected_to_pc_id'))
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
        return jsonify({'success': True})
    except Exception as e:
        log.exception('update_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_printer(printer_id):
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cabinet_printers WHERE id = ?', [printer_id])
        return jsonify({'success': True})
    except Exception as e:
        log.exception('delete_printer error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/connect', methods=['POST'])
@role_required(*EDITOR_ROLES)
def connect_printer(printer_id):
    try:
        data = request.get_json(silent=True) or {}
        pc_id = _normalize_pc_id(data.get('pc_id'))
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
            _normalize_pc_id(data.get('connected_to_pc_id'))
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
                sync_info = _sync_cartridge_replacement(
                    tx,
                    cabinet_number,
                    old['model'] or '',
                    cartridge,
                    responsible,
                    now,
                )
            except Exception as sync_err:
                # Не валим основную операцию из-за синхронизации
                log.warning(
                    f'[CARTRIDGE] sync to cartridges failed: {sync_err}'
                )
                sync_info = {'action': 'error', 'reason': str(sync_err)}

        # Сброс кеша статистики картриджей
        if sync_info.get('action') in ('created', 'updated_dates'):
            _invalidate_cartridges_cache()

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
# ДРАЙВЕРЫ
# ============================================================

@bp.route('/api/printers/<int:printer_id>/drivers')
@login_required
def list_printer_drivers(printer_id):
    """Список драйверов для принтера."""
    try:
        pr = db.query(
            'SELECT id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not pr:
            return jsonify({'error': 'Принтер не найден'}), 404

        drivers = _scan_drivers(pr['model'] or '')
        return jsonify({
            'printer_id': printer_id,
            'model': pr['model'],
            'model_slug': _model_slug(pr['model'] or ''),
            'drivers': drivers,
            'total': len(drivers),
        })
    except Exception as e:
        log.exception('list_printer_drivers error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/drivers/download')
@login_required
def download_printer_driver(printer_id):
    """Скачивание драйвера. Параметр path — относительный путь."""
    try:
        pr = db.query(
            'SELECT id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not pr:
            return jsonify({'error': 'Принтер не найден'}), 404

        rel_path = (request.args.get('path') or '').strip()
        if not rel_path:
            return jsonify({'error': 'Не указан путь'}), 400

        full = _resolve_safe_path(rel_path)
        if not full or not os.path.isfile(full):
            return jsonify({'error': 'Файл не найден'}), 404

        # Проверка: файл действительно относится к этому принтеру
        rel_norm = rel_path.replace('\\', '/')
        parts = rel_norm.split('/')
        is_common = (len(parts) > 1 and parts[0] == '_common')
        if not is_common:
            tokens = _unique_tokens(pr['model'] or '')
            if not _is_file_match(rel_norm, tokens):
                return jsonify({
                    'error': 'Этот драйвер не привязан к данному принтеру',
                }), 403

        log.info(
            f'[{session.get("user_login")}] Скачивание драйвера '
            f'для принтера #{printer_id}: {rel_path}'
        )

        return send_file(
            full,
            as_attachment=True,
            download_name=os.path.basename(full),
        )
    except Exception as e:
        log.exception('download_printer_driver error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/drivers/upload', methods=['POST'])
@role_required(*EDITOR_ROLES)
def upload_printer_driver(printer_id):
    """
    Загрузка драйвера для принтера.
    Файл кладётся в DRIVERS_FOLDER/<model_slug>/.
    """
    try:
        pr = db.query(
            'SELECT id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not pr:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не передан'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        # Проверка расширения
        original_name = file.filename
        ext = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
        if not ext or ext not in _ALLOWED_DRIVER_EXT:
            return jsonify({
                'success': False,
                'error': 'Недопустимый формат. Разрешены: ' +
                         ', '.join(sorted(_ALLOWED_DRIVER_EXT)),
            }), 400

        # Проверка размера
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size == 0:
            return jsonify({'success': False, 'error': 'Файл пуст'}), 400
        if size > _MAX_DRIVER_FILE_SIZE:
            mb = _MAX_DRIVER_FILE_SIZE // 1024 // 1024
            return jsonify({
                'success': False,
                'error': f'Файл слишком большой (макс. {mb} МБ)',
            }), 413

        # Куда кладём: DRIVERS_FOLDER/<model_slug>/
        slug = _model_slug(pr['model'] or '')
        target_dir = os.path.join(_get_drivers_folder(), slug)
        try:
            os.makedirs(target_dir, exist_ok=True)
        except OSError as e:
            log.exception('upload_printer_driver: makedirs failed')
            return jsonify({
                'success': False,
                'error': f'Не удалось создать папку: {e}',
            }), 500

        # Безопасное имя: убираем опасные символы
        from werkzeug.utils import secure_filename
        base_name = secure_filename(original_name)
        if not base_name:
            base_name = original_name

        # Если файл с таким именем уже есть — добавим суффикс
        final_name = base_name
        target_path = os.path.join(target_dir, final_name)
        if os.path.exists(target_path):
            root, ext_part = os.path.splitext(base_name)
            final_name = f'{root}_{uuid.uuid4().hex[:6]}{ext_part}'
            target_path = os.path.join(target_dir, final_name)

        file.save(target_path)

        rel_path = f'{slug}/{final_name}'

        try:
            from audit import log_action
            log_action('create', 'printer_driver', printer_id, {
                'printer_model': pr['model'],
                'filename': original_name,
                'size': size,
                'path': rel_path,
            })
        except Exception:
            pass

        log.info(
            f'[{session.get("user_login")}] Загружен драйвер '
            f'для принтера #{printer_id}: {rel_path} '
            f'({_human_size(size)})'
        )

        return jsonify({
            'success': True,
            'message': 'Драйвер загружен',
            'driver': {
                'path': rel_path,
                'name': final_name,
                'size': size,
                'size_human': _human_size(size),
                'group': slug,
                'is_common': False,
                'can_delete': True,
            },
        }), 201
    except Exception as e:
        log.exception('upload_printer_driver error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/printers/<int:printer_id>/drivers/delete', methods=['POST'])
@role_required(*EDITOR_ROLES)
def delete_printer_driver(printer_id):
    """
    Удаление драйвера. Параметр path в JSON-body.
    Удалять можно только файлы из папки текущего принтера (по slug модели).
    Файлы из _common защищены.
    """
    try:
        pr = db.query(
            'SELECT id, model FROM cabinet_printers WHERE id = ?',
            [printer_id], one=True,
        )
        if not pr:
            return jsonify({'success': False, 'error': 'Принтер не найден'}), 404

        data = request.get_json(silent=True) or {}
        rel_path = (data.get('path') or '').strip()
        if not rel_path:
            return jsonify({'success': False, 'error': 'Не указан путь'}), 400

        # Защита от path traversal
        full = _resolve_safe_path(rel_path)
        if not full or not os.path.isfile(full):
            return jsonify({'success': False, 'error': 'Файл не найден'}), 404

        rel_norm = rel_path.replace('\\', '/')
        parts = rel_norm.split('/')
        if len(parts) < 2:
            return jsonify({
                'success': False,
                'error': 'Нельзя удалять файлы из корня папки драйверов',
            }), 403

        folder = parts[0]
        if folder == '_common':
            return jsonify({
                'success': False,
                'error': 'Файлы из папки «_common» защищены от удаления',
            }), 403

        current_slug = _model_slug(pr['model'] or '')
        if folder != current_slug:
            return jsonify({
                'success': False,
                'error': 'Можно удалять только файлы этого принтера',
            }), 403

        try:
            os.remove(full)
        except Exception as e:
            log.warning(f'Не удалось удалить драйвер {full}: {e}')
            return jsonify({
                'success': False,
                'error': f'Не удалось удалить файл: {e}',
            }), 500

        # Если папка пустая — удаляем её
        try:
            dir_path = os.path.dirname(full)
            if os.path.isdir(dir_path) and not os.listdir(dir_path):
                os.rmdir(dir_path)
        except Exception:
            pass

        try:
            from audit import log_action
            log_action('delete', 'printer_driver', printer_id, {
                'printer_model': pr['model'],
                'path': rel_path,
            })
        except Exception:
            pass

        log.info(
            f'[{session.get("user_login")}] Удалён драйвер '
            f'принтера #{printer_id}: {rel_path}'
        )

        return jsonify({
            'success': True,
            'message': 'Драйвер удалён',
        })
    except Exception as e:
        log.exception('delete_printer_driver error')
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