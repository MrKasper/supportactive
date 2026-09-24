# equipment_documents.py
"""Документы ПО кабинета + доступное ПО из лицензий."""
import os

from flask import Blueprint, jsonify, request, send_file

from database import Database
from utils import login_required, role_required
from logger import get_logger
from constants import EDITOR_ROLES, ALLOWED_DOCUMENT_EXT
from equipment_helpers import (
    check_cabinet, now_str,
    DOCUMENTS_FOLDER, BASE_DIR, MAX_DOC_SIZE,
)
from services.files import save_upload, resolve_file_path, delete_file_safe

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_documents', __name__)

# Папки для поиска (включая legacy)
_DOC_SEARCH_FOLDERS = [
    DOCUMENTS_FOLDER,
    os.path.join(BASE_DIR, 'static', 'uploads', 'documents'),
]


def _resolve_doc(record):
    stored = record.get('filename') if isinstance(record, dict) else record['filename']
    return resolve_file_path(stored, _DOC_SEARCH_FOLDERS)


# ============================================================
# ДОСТУПНОЕ ПО
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/available-software')
@login_required
def available_software(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        rows = db.query('''
            SELECT DISTINCT software_name, license_type
            FROM licenses WHERE cabinet = ?
            ORDER BY software_name
        ''', [cab['cabinet_number']])

        return jsonify([
            {'name': r['software_name'].strip(),
             'type': (r['license_type'] or '').strip()}
            for r in rows if r['software_name']
        ])
    except Exception as e:
        log.exception('available_software error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СПИСОК ДОКУМЕНТОВ
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/documents', methods=['GET'])
@login_required
def list_cabinet_documents(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        rows = db.query('''
            SELECT d.*, u.full_name AS uploaded_by_name
            FROM license_documents d
            LEFT JOIN users u ON u.id = d.uploaded_by
            WHERE d.cabinet_number = ?
            ORDER BY d.uploaded_at DESC
        ''', [cab['cabinet_number']])

        result = []
        for r in rows:
            d = dict(r)
            d['file_exists'] = _resolve_doc(d) is not None
            result.append(d)
        return jsonify(result)
    except Exception as e:
        log.exception('list_cabinet_documents error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# ЗАГРУЗКА
# ============================================================

@bp.route('/api/cabinets/<int:cabinet_id>/documents', methods=['POST'])
@role_required(*EDITOR_ROLES)
def upload_cabinet_document(cabinet_id):
    try:
        cab, err = check_cabinet(cabinet_id)
        if err:
            return err

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не передан'}), 400

        file = request.files['file']

        # Подпапка по номеру кабинета
        cab_folder_name = str(cab['cabinet_number']).replace('/', '_').replace('\\', '_')
        target_folder = os.path.join(DOCUMENTS_FOLDER, cab_folder_name)

        saved = save_upload(file, target_folder, ALLOWED_DOCUMENT_EXT, MAX_DOC_SIZE)
        if not saved['ok']:
            status = 413 if 'большой' in (saved['error'] or '') else 400
            return jsonify({'success': False, 'error': saved['error']}), status

        # Привязка к лицензии
        license_id = request.form.get('license_id')
        try:
            license_id = int(license_id) if license_id else None
        except (ValueError, TypeError):
            license_id = None

        software_name = (request.form.get('software_name') or '').strip()
        if license_id:
            lic = db.query(
                'SELECT * FROM licenses WHERE id = ?',
                [license_id], one=True,
            )
            if lic:
                software_name = lic['software_name'] or software_name

        rel_path = f'{cab_folder_name}/{saved["unique_name"]}'

        with db.transaction(immediate=True) as tx:
            doc_id = tx.execute('''
                INSERT INTO license_documents
                    (license_id, cabinet_number, software_name, filename,
                     original_name, file_size, mime_type, uploaded_by, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                license_id, cab['cabinet_number'], software_name,
                rel_path, saved['original_name'],
                saved['size'], saved['mime'],
                __import__('flask').session.get('user_id'),
                now_str(),
            ])

        try:
            from audit import log_action
            log_action('create', 'license_document', doc_id, {
                'cabinet': cab['cabinet_number'],
                'software': software_name,
                'filename': saved['original_name'],
            })
        except Exception:
            pass

        return jsonify({
            'success': True,
            'document_id': doc_id,
            'message': 'Документ загружен',
        }), 201
    except Exception as e:
        log.exception('upload_cabinet_document error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# СКАЧИВАНИЕ / ПРОСМОТР / УДАЛЕНИЕ
# ============================================================

@bp.route('/api/documents/<int:doc_id>/download', methods=['GET'])
@login_required
def download_document(doc_id):
    try:
        doc = db.query(
            'SELECT * FROM license_documents WHERE id = ?',
            [doc_id], one=True,
        )
        if not doc:
            return jsonify({'error': 'Документ не найден'}), 404

        path = _resolve_doc(doc)
        if not path:
            return jsonify({'error': 'Файл не найден на диске'}), 404

        return send_file(
            path, as_attachment=True,
            download_name=doc['original_name'] or os.path.basename(path),
        )
    except Exception as e:
        log.exception('download_document error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documents/<int:doc_id>/view', methods=['GET'])
@login_required
def view_document(doc_id):
    try:
        doc = db.query(
            'SELECT * FROM license_documents WHERE id = ?',
            [doc_id], one=True,
        )
        if not doc:
            return jsonify({'error': 'Документ не найден'}), 404

        path = _resolve_doc(doc)
        if not path:
            return jsonify({'error': 'Файл не найден'}), 404

        return send_file(path, mimetype=doc['mime_type'] or 'application/octet-stream')
    except Exception as e:
        log.exception('view_document error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/documents/<int:doc_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_document(doc_id):
    try:
        doc = db.query(
            'SELECT * FROM license_documents WHERE id = ?',
            [doc_id], one=True,
        )
        if not doc:
            return jsonify({'success': False, 'error': 'Документ не найден'}), 404

        path = _resolve_doc(doc)
        if path:
            delete_file_safe(path)

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM license_documents WHERE id = ?', [doc_id])

        try:
            from audit import log_action
            log_action('delete', 'license_document', doc_id, {
                'cabinet': doc['cabinet_number'],
                'filename': doc['original_name'],
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Документ удалён'})
    except Exception as e:
        log.exception('delete_document error')
        return jsonify({'success': False, 'error': str(e)}), 500