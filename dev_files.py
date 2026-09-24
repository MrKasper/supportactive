# dev_files.py
"""
Dev-консоль: просмотр файлов и папок на сервере.
Доступ только для ролей Администратор и Разработчик.
Все операции ограничены предопределёнными корнями.
"""
import os
import shutil
from datetime import datetime

from flask import (
    Blueprint, jsonify, request, send_file,
    current_app, session,
)

from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER

log = get_logger(__name__)

dev_files_bp = Blueprint('dev_files', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ============================================================
# РАЗРЕШЁННЫЕ КОРНИ
# ============================================================

def _get_roots():
    """Возвращает dict {alias: {'path': abs, 'label': str}}."""
    cfg = current_app.config
    roots = {
        'avatars': {
            'path': cfg.get('UPLOAD_FOLDER_AVATARS'),
            'label': 'Аватары пользователей',
        },
        'attachments': {
            'path': cfg.get('ATTACHMENTS_FOLDER'),
            'label': 'Вложения заявок',
        },
        'documents': {
            'path': cfg.get('DOCUMENTS_FOLDER'),
            'label': 'Документы ПО кабинетов',
        },
        'drivers': {
            'path': cfg.get('DRIVERS_FOLDER'),
            'label': 'Драйверы принтеров',
        },
        'logs': {
            'path': cfg.get('LOG_DIR'),
            'label': 'Логи приложения',
        },
        'backups': {
            'path': os.path.join(BASE_DIR, 'backups'),
            'label': 'Бэкапы БД',
        },
        'private_uploads': {
            'path': os.path.join(BASE_DIR, 'private_uploads'),
            'label': 'Все приватные загрузки',
        },
        'flask_session': {
            'path': cfg.get('SESSION_FILE_DIR'),
            'label': 'Файловые сессии',
        },
    }
    return {k: v for k, v in roots.items() if v.get('path')}


def _resolve_safe(abs_path):
    """
    Проверяет, что abs_path находится внутри одного из разрешённых корней.
    Возвращает (root_alias, root_path) или (None, None).
    """
    if not abs_path:
        return None, None
    real = os.path.realpath(abs_path)
    for alias, info in _get_roots().items():
        root_real = os.path.realpath(info['path'])
        if real == root_real or real.startswith(root_real + os.sep):
            return alias, root_real
    return None, None


def _path_from_request():
    p = (request.args.get('path') or '').strip()
    if not p:
        return None
    if not os.path.isabs(p):
        p = os.path.join(BASE_DIR, p)
    return os.path.realpath(p)


def _human_size(b):
    if b is None:
        return '—'
    if b == 0:
        return '0 Б'
    k = 1024
    sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
    i = 0
    v = float(b)
    while v >= k and i < len(sizes) - 1:
        v /= k
        i += 1
    return f'{int(v)} {sizes[i]}' if i == 0 else f'{v:.1f} {sizes[i]}'


def _ext_icon(name, is_dir):
    """Возвращает emoji-иконку по расширению."""
    if is_dir:
        return '📁'
    ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
    icons = {
        'pdf': '📄',
        'doc': '📘', 'docx': '📘',
        'xls': '📗', 'xlsx': '📗', 'csv': '📗',
        'ppt': '📙', 'pptx': '📙',
        'txt': '📝', 'log': '📝', 'md': '📝',
        'json': '🧾', 'xml': '🧾',
        'png': '🖼', 'jpg': '🖼', 'jpeg': '🖼', 'gif': '🖼',
        'webp': '🖼', 'bmp': '🖼', 'svg': '🖼',
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        'exe': '⚙️', 'msi': '⚙️',
        'inf': '🔧', 'cab': '🔧',
        'db': '🗄', 'sqlite': '🗄', 'sqlite3': '🗄',
        'py': '🐍', 'js': '🟨', 'css': '🎨', 'html': '🌐',
    }
    return icons.get(ext, '📄')


# ============================================================
# ENDPOINTS
# ============================================================

@dev_files_bp.route('/api/dev/files/roots')
@role_required(*DEV_ROLES)
def list_roots():
    """Список разрешённых корневых папок с краткой информацией."""
    try:
        result = []
        for alias, info in _get_roots().items():
            path = info['path']
            exists = os.path.isdir(path)
            total_size = 0
            total_files = 0

            if exists:
                for dirpath, _, filenames in os.walk(path):
                    for fn in filenames:
                        try:
                            total_size += os.path.getsize(
                                os.path.join(dirpath, fn)
                            )
                            total_files += 1
                        except OSError:
                            pass

            result.append({
                'alias': alias,
                'label': info['label'],
                'path': path,
                'exists': exists,
                'file_count': total_files,
                'size': total_size,
                'size_human': _human_size(total_size),
            })

        result.sort(key=lambda x: x['label'].lower())
        return jsonify({'roots': result})
    except Exception as e:
        log.exception('dev_files list_roots error')
        return jsonify({'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/list')
@role_required(*DEV_ROLES)
def list_files():
    """
    Список файлов и подпапок в указанной папке.
    ?path=/abs/path — абсолютный путь (должен быть внутри разрешённых корней)
    """
    try:
        abs_path = _path_from_request()
        if not abs_path:
            return jsonify({'error': 'Не указан path'}), 400

        if not os.path.isdir(abs_path):
            return jsonify({'error': 'Папка не найдена'}), 404

        alias, root = _resolve_safe(abs_path)
        if not alias:
            return jsonify({'error': 'Доступ к этой папке запрещён'}), 403

        entries = []
        total_size = 0
        total_files = 0

        try:
            items = os.listdir(abs_path)
        except PermissionError:
            return jsonify({'error': 'Нет доступа к папке'}), 403

        for name in items:
            if name.startswith('.'):
                continue

            full = os.path.join(abs_path, name)
            try:
                stat = os.stat(full)
            except OSError:
                continue

            is_dir = os.path.isdir(full)
            ext = ''
            child_count = 0

            if is_dir:
                try:
                    child_count = len(os.listdir(full))
                except Exception:
                    child_count = 0
            else:
                _, ext = os.path.splitext(name)
                ext = ext.lstrip('.').lower()
                total_size += stat.st_size
                total_files += 1

            entries.append({
                'name': name,
                'path': full,
                'is_dir': is_dir,
                'size': stat.st_size,
                'size_human': _human_size(stat.st_size),
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'ext': ext,
                'child_count': child_count,
                'icon': _ext_icon(name, is_dir),
            })

        entries.sort(key=lambda e: (not e['is_dir'], e['name'].lower()))

        parent = None
        if os.path.realpath(abs_path) != os.path.realpath(root):
            parent = os.path.dirname(abs_path)
            if not _resolve_safe(parent)[0]:
                parent = root

        root_info = _get_roots()[alias]

        return jsonify({
            'path': abs_path,
            'parent': parent,
            'root_alias': alias,
            'root_label': root_info['label'],
            'root_path': root,
            'entries': entries,
            'total_size': total_size,
            'total_files': total_files,
            'total_size_human': _human_size(total_size),
        })
    except Exception as e:
        log.exception('dev_files list_files error')
        return jsonify({'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/download')
@role_required(*DEV_ROLES)
def download_file():
    try:
        abs_path = _path_from_request()
        if not abs_path:
            return jsonify({'error': 'Не указан path'}), 400

        if not os.path.isfile(abs_path):
            return jsonify({'error': 'Файл не найден'}), 404

        alias, _ = _resolve_safe(abs_path)
        if not alias:
            return jsonify({'error': 'Доступ запрещён'}), 403

        log.info(f'[{session.get("user_login")}] Dev скачал: {abs_path}')

        return send_file(
            abs_path,
            as_attachment=True,
            download_name=os.path.basename(abs_path),
        )
    except Exception as e:
        log.exception('dev_files download error')
        return jsonify({'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/preview')
@role_required(*DEV_ROLES)
def preview_file():
    try:
        abs_path = _path_from_request()
        if not abs_path:
            return jsonify({'error': 'Не указан path'}), 400

        if not os.path.isfile(abs_path):
            return jsonify({'error': 'Файл не найден'}), 404

        alias, _ = _resolve_safe(abs_path)
        if not alias:
            return jsonify({'error': 'Доступ запрещён'}), 403

        ext = abs_path.rsplit('.', 1)[-1].lower() if '.' in abs_path else ''
        mime_map = {
            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf',
            'txt': 'text/plain; charset=utf-8',
            'log': 'text/plain; charset=utf-8',
            'json': 'application/json; charset=utf-8',
            'md': 'text/plain; charset=utf-8',
        }
        mime = mime_map.get(ext, 'application/octet-stream')

        return send_file(abs_path, mimetype=mime, as_attachment=False)
    except Exception as e:
        log.exception('dev_files preview error')
        return jsonify({'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/read-text')
@role_required(*DEV_ROLES)
def read_text_file():
    """Содержимое текстового файла (до 500 КБ) для превью в модалке."""
    try:
        abs_path = _path_from_request()
        if not abs_path:
            return jsonify({'error': 'Не указан path'}), 400

        if not os.path.isfile(abs_path):
            return jsonify({'error': 'Файл не найден'}), 404

        alias, _ = _resolve_safe(abs_path)
        if not alias:
            return jsonify({'error': 'Доступ запрещён'}), 403

        size = os.path.getsize(abs_path)
        MAX = 500 * 1024
        if size > MAX:
            return jsonify({
                'error': f'Файл слишком большой ({_human_size(size)}). '
                         f'Максимум {_human_size(MAX)}.'
            }), 413

        try:
            with open(abs_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
        except Exception as e:
            return jsonify({'error': f'Не удалось прочитать: {e}'}), 500

        return jsonify({
            'path': abs_path,
            'name': os.path.basename(abs_path),
            'size': size,
            'size_human': _human_size(size),
            'content': content,
        })
    except Exception as e:
        log.exception('dev_files read_text error')
        return jsonify({'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/delete', methods=['POST'])
@role_required(*DEV_ROLES)
def delete_file():
    """
    Удаляет файл или папку.
    Body: { path, confirm, recursive }
    """
    try:
        data = request.get_json(silent=True) or {}
        rel_path = (data.get('path') or '').strip()
        confirm = (data.get('confirm') or '').strip()
        recursive = bool(data.get('recursive', False))

        if not rel_path:
            return jsonify({'success': False, 'error': 'Не указан path'}), 400

        abs_path = os.path.realpath(rel_path)
        if not os.path.exists(abs_path):
            return jsonify({'success': False, 'error': 'Не найдено'}), 404

        alias, root = _resolve_safe(abs_path)
        if not alias:
            return jsonify({'success': False, 'error': 'Доступ запрещён'}), 403

        if os.path.realpath(abs_path) == os.path.realpath(root):
            return jsonify({
                'success': False,
                'error': 'Нельзя удалить корневую папку',
            }), 400

        name = os.path.basename(abs_path)
        if confirm != name:
            return jsonify({
                'success': False,
                'error': 'Подтверждение не совпадает с именем',
            }), 400

        is_dir = os.path.isdir(abs_path)

        if is_dir:
            if recursive:
                shutil.rmtree(abs_path)
            else:
                try:
                    os.rmdir(abs_path)
                except OSError as e:
                    return jsonify({
                        'success': False,
                        'error': f'Папка не пуста: {e}',
                    }), 400
        else:
            os.remove(abs_path)

        log.warning(
            f'[DEV] [{session.get("user_login")}] Удалён '
            f'{"каталог" if is_dir else "файл"}: {abs_path}'
        )

        try:
            from audit import log_action
            log_action('delete', 'dev_file', None, {
                'path': abs_path,
                'type': 'dir' if is_dir else 'file',
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': f'Удалено: {name}'})
    except Exception as e:
        log.exception('dev_files delete error')
        return jsonify({'success': False, 'error': str(e)}), 500


@dev_files_bp.route('/api/dev/files/mkdir', methods=['POST'])
@role_required(*DEV_ROLES)
def make_dir():
    """Создать подпапку внутри разрешённого корня."""
    try:
        data = request.get_json(silent=True) or {}
        parent = (data.get('parent') or '').strip()
        name = (data.get('name') or '').strip()

        if not parent or not name:
            return jsonify({
                'success': False, 'error': 'Нужны parent и name',
            }), 400

        if any(c in name for c in ('/', '\\', '..')) or name.startswith('.'):
            return jsonify({
                'success': False, 'error': 'Недопустимое имя папки',
            }), 400

        parent_abs = os.path.realpath(parent)
        if not os.path.isdir(parent_abs):
            return jsonify({
                'success': False, 'error': 'Родительская папка не найдена',
            }), 404

        alias, root = _resolve_safe(parent_abs)
        if not alias:
            return jsonify({
                'success': False, 'error': 'Доступ запрещён',
            }), 403

        new_path = os.path.join(parent_abs, name)
        if os.path.exists(new_path):
            return jsonify({
                'success': False, 'error': 'Уже существует',
            }), 400

        os.makedirs(new_path)

        log.info(
            f'[DEV] [{session.get("user_login")}] Создана папка: {new_path}'
        )

        return jsonify({'success': True, 'path': new_path}), 201
    except Exception as e:
        log.exception('dev_files mkdir error')
        return jsonify({'success': False, 'error': str(e)}), 500