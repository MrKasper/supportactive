# equipment_drivers.py
"""
Драйверы принтеров: сканирование папки, загрузка, скачивание, удаление.

Хранятся в DRIVERS_FOLDER (по умолчанию private_uploads/drivers/),
разложены по подпапкам `<model_slug>`.
"""
import os
import re
import time
import uuid

from flask import (
    Blueprint, jsonify, request, send_file, current_app, session,
)

from database import Database
from utils import role_required, login_required, human_size
from logger import get_logger
from constants import EDITOR_ROLES

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_drivers', __name__)

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
# ХЕЛПЕРЫ (публичные — используются в equipment_printers.py)
# ============================================================

def _normalize_text(s):
    """Оставляет только буквы и цифры, приводит к нижнему регистру."""
    if not s:
        return ''
    return re.sub(r'[^a-z0-9а-яё]', '', str(s).lower())


def model_slug(model):
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
    current_slug = model_slug(model)
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

            if not is_common and not _is_file_match(rel, tokens):
                continue

            try:
                size = os.path.getsize(full)
            except OSError:
                size = 0

            can_delete = (
                not is_common
                and file_slug == current_slug
            )

            result.append({
                'path': rel,
                'name': fname,
                'size': size,
                'size_human': human_size(size),
                'group': 'Общие' if is_common else (group or 'Разное'),
                'is_common': is_common,
                'model_slug': file_slug,
                'can_delete': can_delete,
            })

        if count > _MAX_DRIVER_FILES:
            break

    result.sort(key=lambda x: (x['is_common'], x['name'].lower()))
    return result


# ------------------------------------------------------------
# Кеш сканера — TTL 30 сек
# ------------------------------------------------------------
_drivers_cache = {}   # model_slug → {'data': [...], 'ts': ...}
_DRIVERS_CACHE_TTL = 30


def scan_drivers_cached(model):
    """Обёртка над _scan_drivers с TTL-кешем по модели."""
    slug = model_slug(model or '')
    now = time.time()
    entry = _drivers_cache.get(slug)

    if entry and now - entry['ts'] <= _DRIVERS_CACHE_TTL:
        return entry['data']

    data = _scan_drivers(model or '')
    _drivers_cache[slug] = {'data': data, 'ts': now}
    return data


def invalidate_drivers_cache(model=None):
    """Сброс кеша драйверов. Без аргумента — полностью."""
    if model is None:
        _drivers_cache.clear()
    else:
        _drivers_cache.pop(model_slug(model), None)


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
# РОУТЫ
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

        drivers = scan_drivers_cached(pr['model'] or '')
        return jsonify({
            'printer_id': printer_id,
            'model': pr['model'],
            'model_slug': model_slug(pr['model'] or ''),
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

        original_name = file.filename
        ext = original_name.rsplit('.', 1)[-1].lower() if '.' in original_name else ''
        if not ext or ext not in _ALLOWED_DRIVER_EXT:
            return jsonify({
                'success': False,
                'error': 'Недопустимый формат. Разрешены: ' +
                         ', '.join(sorted(_ALLOWED_DRIVER_EXT)),
            }), 400

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

        slug = model_slug(pr['model'] or '')
        target_dir = os.path.join(_get_drivers_folder(), slug)
        try:
            os.makedirs(target_dir, exist_ok=True)
        except OSError as e:
            log.exception('upload_printer_driver: makedirs failed')
            return jsonify({
                'success': False,
                'error': f'Не удалось создать папку: {e}',
            }), 500

        from werkzeug.utils import secure_filename
        base_name = secure_filename(original_name)
        if not base_name:
            base_name = original_name

        final_name = base_name
        target_path = os.path.join(target_dir, final_name)
        if os.path.exists(target_path):
            root, ext_part = os.path.splitext(base_name)
            final_name = f'{root}_{uuid.uuid4().hex[:6]}{ext_part}'
            target_path = os.path.join(target_dir, final_name)

        file.save(target_path)

        rel_path = f'{slug}/{final_name}'

        # Сброс кеша драйверов
        invalidate_drivers_cache(pr['model'] or '')

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
            f'({human_size(size)})'
        )

        return jsonify({
            'success': True,
            'message': 'Драйвер загружен',
            'driver': {
                'path': rel_path,
                'name': final_name,
                'size': size,
                'size_human': human_size(size),
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

        current_slug = model_slug(pr['model'] or '')
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

        # Сброс кеша драйверов
        invalidate_drivers_cache(pr['model'] or '')

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