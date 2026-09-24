# dev_logs.py
"""
Dev-консоль: работа с логами.
"""
import os
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file

from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER
from dev_helpers import LOG_DIR, human_size

log = get_logger(__name__)

dev_logs_bp = Blueprint('dev_logs', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


@dev_logs_bp.route('/api/dev/logs')
@role_required(*DEV_ROLES)
def logs_list():
    try:
        if not os.path.exists(LOG_DIR):
            return jsonify({'files': []})

        files = []
        for name in sorted(os.listdir(LOG_DIR)):
            full = os.path.join(LOG_DIR, name)
            if os.path.isfile(full):
                st = os.stat(full)
                files.append({
                    'name': name,
                    'size': st.st_size,
                    'size_human': human_size(st.st_size),
                    'modified_at': datetime.fromtimestamp(st.st_mtime).isoformat(),
                })

        return jsonify({'files': files})
    except Exception as e:
        log.exception('logs_list error')
        return jsonify({'error': str(e)}), 500


@dev_logs_bp.route('/api/dev/logs/<path:filename>')
@role_required(*DEV_ROLES)
def logs_view(filename):
    try:
        safe_name = os.path.basename(filename)
        full = os.path.join(LOG_DIR, safe_name)

        if not os.path.isfile(full):
            return jsonify({'error': 'Файл не найден'}), 404

        try:
            lines = int(request.args.get('lines', 500))
            lines = max(10, min(lines, 5000))
        except (TypeError, ValueError):
            lines = 500

        with open(full, 'r', encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()
            last = all_lines[-lines:]

        return jsonify({
            'name': safe_name,
            'lines': last,
            'total_lines': len(all_lines),
            'shown_lines': len(last),
        })
    except Exception as e:
        log.exception('logs_view error')
        return jsonify({'error': str(e)}), 500


@dev_logs_bp.route('/api/dev/logs/<path:filename>/download')
@role_required(*DEV_ROLES)
def logs_download(filename):
    try:
        safe_name = os.path.basename(filename)
        full = os.path.join(LOG_DIR, safe_name)
        if not os.path.isfile(full):
            return jsonify({'error': 'Файл не найден'}), 404

        return send_file(
            full,
            mimetype='text/plain',
            as_attachment=True,
            download_name=safe_name,
        )
    except Exception as e:
        log.exception('logs_download error')
        return jsonify({'error': str(e)}), 500