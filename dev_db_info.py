# dev_db_info.py
"""
Dev-консоль: информация о БД, схема, скачивание.
"""
import os
import sqlite3
from datetime import datetime

from flask import Blueprint, jsonify, send_file, session

from database import Database
from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER
from dev_helpers import (
    BACKUP_DIR, human_size, is_protected,
)

log = get_logger(__name__)
db = Database()

dev_db_info_bp = Blueprint('dev_db_info', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


# ============================================================
# ИНФО
# ============================================================

@dev_db_info_bp.route('/api/dev/db/info')
@role_required(*DEV_ROLES)
def db_info():
    try:
        db_path = db.db_name
        exists = os.path.exists(db_path)
        size = os.path.getsize(db_path) if exists else 0
        modified = (
            datetime.fromtimestamp(os.path.getmtime(db_path)).isoformat()
            if exists else None
        )

        counts = {}
        for table in (
            'users', 'tasks', 'cabinets', 'cartridges', 'licenses',
            'notifications', 'audit_log', 'task_comments',
            'task_attachments', 'cabinet_computers', 'cabinet_printers',
            'cabinet_network_devices', 'license_documents',
        ):
            try:
                r = db.query(f'SELECT COUNT(*) AS c FROM {table}', one=True)
                counts[table] = r['c'] if r else 0
            except Exception:
                counts[table] = None

        return jsonify({
            'path': db_path,
            'exists': exists,
            'size_bytes': size,
            'size_human': human_size(size),
            'modified_at': modified,
            'counts': counts,
        })
    except Exception as e:
        log.exception('db_info error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СХЕМА
# ============================================================

@dev_db_info_bp.route('/api/dev/db/schema')
@role_required(*DEV_ROLES)
def db_schema():
    try:
        tables = db.query('''
            SELECT name FROM sqlite_master
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        ''')

        result = []
        for t in tables:
            name = t['name']
            cols = db.query(f'PRAGMA table_info({name})')
            idx = db.query(f'PRAGMA index_list({name})')
            try:
                cnt = db.query(
                    f'SELECT COUNT(*) AS c FROM {name}', one=True
                )['c']
            except Exception:
                cnt = 0

            result.append({
                'name': name,
                'columns': [
                    {
                        'name': c['name'],
                        'type': c['type'],
                        'notnull': bool(c['notnull']),
                        'pk': bool(c['pk']),
                        'default': c['dflt_value'],
                    }
                    for c in cols
                ],
                'indexes': [dict(i) for i in idx],
                'row_count': cnt,
                'has_id': any(c['name'] == 'id' and c['pk'] for c in cols),
                'protected': is_protected(name),
            })

        return jsonify({'tables': result})
    except Exception as e:
        log.exception('db_schema error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СКАЧИВАНИЕ
# ============================================================

@dev_db_info_bp.route('/api/dev/db/download')
@role_required(*DEV_ROLES)
def db_download():
    try:
        db_path = db.db_name
        if not os.path.exists(db_path):
            return jsonify({'error': 'БД не найдена'}), 404

        os.makedirs(BACKUP_DIR, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f'supportactive_{timestamp}.db'
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(backup_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()

        log.info(
            f'[{session.get("user_login")}] Скачивание БД '
            f'({human_size(os.path.getsize(backup_path))})'
        )

        return send_file(
            backup_path,
            mimetype='application/x-sqlite3',
            as_attachment=True,
            download_name=backup_name,
        )
    except Exception as e:
        log.exception('db_download error')
        return jsonify({'error': str(e)}), 500