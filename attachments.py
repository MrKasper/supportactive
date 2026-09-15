# attachments.py
"""
Вложения к заявкам: загрузка, скачивание, удаление, предпросмотр.
"""
import os
import uuid
from flask import Blueprint, request, jsonify, session, send_file, abort
from werkzeug.utils import secure_filename
from database import Database
from datetime import datetime
from utils import login_required
from logger import get_logger

log = get_logger(__name__)

attachments_bp = Blueprint('attachments', __name__)
db = Database()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ATTACHMENTS_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads', 'attachments')

ALLOWED_EXT = {
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'txt', 'csv', 'zip', 'rar', '7z', 'tar', 'gz',
    'log', 'json', 'xml', 'md'
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 МБ

os.makedirs(ATTACHMENTS_FOLDER, exist_ok=True)


def _allowed_ext(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT


def _get_task_folder(task_id):
    """Папка для вложений конкретной заявки."""
    folder = os.path.join(ATTACHMENTS_FOLDER, str(task_id))
    os.makedirs(folder, exist_ok=True)
    return folder


def _resolve_filepath(record):
    """
    Возвращает реальный путь к файлу с учётом возможных legacy-форматов.
    Хранимые в БД пути:
      • новый формат: '<task_id>/<uuid>.<ext>'
      • старый формат (баг): 'task_<task_id>/<uuid>.<ext>'
      • совсем старый: только имя файла
    Пробуем все варианты.
    """
    stored = (record['filename'] or '').strip()
    if not stored:
        return None

    task_id = record['task_id']

    candidates = [
        os.path.join(ATTACHMENTS_FOLDER, stored),                    # как есть
        os.path.join(ATTACHMENTS_FOLDER, str(task_id), os.path.basename(stored)),   # <task_id>/<file>
        os.path.join(ATTACHMENTS_FOLDER, f'task_{task_id}', os.path.basename(stored)),  # legacy
        os.path.join(ATTACHMENTS_FOLDER, os.path.basename(stored)),  # в корне
    ]

    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def _check_task_access(task_id):
    """
    Возвращает (task, error_response).
    Проверяет существование заявки и права Пользователя.
    """
    task = db.query('SELECT * FROM tasks WHERE id = ?', [task_id], one=True)
    if not task:
        return None, (jsonify({'error': 'Заявка не найдена'}), 404)

    if session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
        return None, (jsonify({'error': 'Недостаточно прав'}), 403)

    return task, None


# ============= СПИСОК ВЛОЖЕНИЙ =============

@attachments_bp.route('/api/tasks/<int:task_id>/attachments', methods=['GET'])
@login_required
def list_attachments(task_id):
    try:
        task, err = _check_task_access(task_id)
        if err:
            return err

        rows = db.query('''
            SELECT a.*, u.full_name as user_name
            FROM task_attachments a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.task_id = ?
            ORDER BY a.uploaded_at DESC, a.id DESC
        ''', [task_id])

        result = []
        for r in rows:
            d = dict(r)
            # Помечаем файлы, которых нет на диске
            d['file_exists'] = _resolve_filepath(d) is not None
            result.append(d)

        return jsonify(result)
    except Exception as e:
        log.exception('Ошибка списка вложений')
        return jsonify({'error': str(e)}), 500


# ============= ЗАГРУЗКА =============

@attachments_bp.route('/api/tasks/<int:task_id>/attachments', methods=['POST'])
@login_required
def upload_attachment(task_id):
    try:
        task, err = _check_task_access(task_id)
        if err:
            return err

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не передан'}), 400

        file = request.files['file']
        if not file or file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        if not _allowed_ext(file.filename):
            return jsonify({
                'success': False,
                'error': f'Недопустимый формат. Разрешены: {", ".join(sorted(ALLOWED_EXT))}'
            }), 400

        # Размер
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > MAX_FILE_SIZE:
            return jsonify({
                'success': False,
                'error': f'Файл слишком большой (макс. {MAX_FILE_SIZE // 1024 // 1024} МБ)'
            }), 413

        original_name = file.filename
        ext = original_name.rsplit('.', 1)[1].lower()
        unique_name = f'{uuid.uuid4().hex}.{ext}'
        safe_name = secure_filename(unique_name) or unique_name

        folder = _get_task_folder(task_id)
        filepath = os.path.join(folder, safe_name)
        file.save(filepath)

        # 🔧 Путь в БД — БЕЗ префикса task_, чтобы совпадал с реальной папкой
        rel_path = f'{task_id}/{safe_name}'

        attachment_id = db.execute('''
            INSERT INTO task_attachments
                (task_id, user_id, filename, original_name, file_size, mime_type, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [
            task_id,
            session.get('user_id'),
            rel_path,
            original_name,
            size,
            file.mimetype or 'application/octet-stream',
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ])

        try:
            from audit import log_action
            log_action('create', 'attachment', attachment_id, {
                'task_id': task_id, 'filename': original_name, 'size': size
            })
        except Exception:
            pass

        log.info(f'Загружено вложение #{attachment_id} к заявке #{task_id}: '
                 f'{original_name} ({size} байт) → {rel_path}')

        return jsonify({
            'success': True,
            'attachment_id': attachment_id,
            'message': 'Файл загружен'
        }), 201
    except Exception as e:
        log.exception('Ошибка загрузки вложения')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============= СКАЧИВАНИЕ =============

@attachments_bp.route('/api/attachments/<int:attachment_id>/download', methods=['GET'])
@login_required
def download_attachment(attachment_id):
    try:
        a = db.query('SELECT * FROM task_attachments WHERE id = ?', [attachment_id], one=True)
        if not a:
            return jsonify({'error': 'Вложение не найдено'}), 404

        # Права на заявку
        task = db.query('SELECT * FROM tasks WHERE id = ?', [a['task_id']], one=True)
        if task and session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
            return jsonify({'error': 'Недостаточно прав'}), 403

        filepath = _resolve_filepath(a)
        if not filepath:
            log.warning(f'Файл вложения #{attachment_id} не найден. Запись в БД: {a["filename"]}')
            return jsonify({
                'error': 'Файл не найден на диске. Возможно, он был удалён или путь повреждён.'
            }), 404

        download_name = a['original_name'] or os.path.basename(filepath)

        return send_file(
            filepath,
            as_attachment=True,
            download_name=download_name
        )
    except Exception as e:
        log.exception('Ошибка скачивания вложения')
        return jsonify({'error': str(e)}), 500


# ============= ПРЕДПРОСМОТР =============

@attachments_bp.route('/api/attachments/<int:attachment_id>/preview', methods=['GET'])
@login_required
def preview_attachment(attachment_id):
    try:
        a = db.query('SELECT * FROM task_attachments WHERE id = ?', [attachment_id], one=True)
        if not a:
            return jsonify({'error': 'Вложение не найдено'}), 404

        # Права на заявку
        task = db.query('SELECT * FROM tasks WHERE id = ?', [a['task_id']], one=True)
        if task and session.get('user_role') == 'Пользователь' and task['created_by'] != session.get('user_id'):
            return jsonify({'error': 'Недостаточно прав'}), 403

        if not (a['mime_type'] or '').startswith('image/'):
            return jsonify({'error': 'Предпросмотр доступен только для изображений'}), 400

        filepath = _resolve_filepath(a)
        if not filepath:
            log.warning(f'Файл вложения #{attachment_id} не найден. Запись в БД: {a["filename"]}')
            return jsonify({'error': 'Файл не найден на диске'}), 404

        return send_file(filepath, mimetype=a['mime_type'])
    except Exception as e:
        log.exception('Ошибка предпросмотра')
        return jsonify({'error': str(e)}), 500


# ============= УДАЛЕНИЕ =============

@attachments_bp.route('/api/attachments/<int:attachment_id>', methods=['DELETE'])
@login_required
def delete_attachment(attachment_id):
    try:
        a = db.query('SELECT * FROM task_attachments WHERE id = ?', [attachment_id], one=True)
        if not a:
            return jsonify({'success': False, 'error': 'Вложение не найдено'}), 404

        is_admin = session.get('user_role') == 'Администратор'
        is_author = a['user_id'] == session.get('user_id')
        if not (is_admin or is_author):
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        filepath = _resolve_filepath(a)
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as e:
                log.warning(f'Не удалось удалить файл {filepath}: {e}')

        db.execute('DELETE FROM task_attachments WHERE id = ?', [attachment_id])

        try:
            from audit import log_action
            log_action('delete', 'attachment', attachment_id, {
                'task_id': a['task_id'], 'filename': a['original_name']
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Вложение удалено'})
    except Exception as e:
        log.exception('Ошибка удаления вложения')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============= УТИЛИТА: ПОЧИНИТЬ ПУТИ В БД (для legacy-записей) =============

@attachments_bp.route('/api/admin/attachments/fix-paths', methods=['POST'])
@login_required
def fix_attachment_paths():
    """
    Проходит по всем записям, находит реальные файлы на диске
    и обновляет filename в БД на корректный путь.
    Только для Администратора.
    """
    if session.get('user_role') != 'Администратор':
        return jsonify({'error': 'Недостаточно прав'}), 403

    rows = db.query('SELECT id, task_id, filename FROM task_attachments')
    fixed = 0
    missing = 0
    details = []

    for r in rows:
        real = _resolve_filepath({
            'task_id': r['task_id'],
            'filename': r['filename']
        })
        if not real:
            missing += 1
            details.append(f'#{r["id"]}: файл не найден ({r["filename"]})')
            continue

        # Канонический путь относительно ATTACHMENTS_FOLDER
        rel = os.path.relpath(real, ATTACHMENTS_FOLDER).replace('\\', '/')

        if rel != r['filename']:
            db.execute(
                'UPDATE task_attachments SET filename = ? WHERE id = ?',
                [rel, r['id']]
            )
            fixed += 1
            details.append(f'#{r["id"]}: {r["filename"]} → {rel}')

    return jsonify({
        'success': True,
        'total': len(rows),
        'fixed': fixed,
        'missing': missing,
        'details': details
    })