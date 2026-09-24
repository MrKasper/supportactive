# dev_slow.py
"""
Dev-консоль: медленные запросы.
"""
import os
import re

from flask import Blueprint, jsonify, request, session

from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER

log = get_logger(__name__)

dev_slow_bp = Blueprint('dev_slow', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')
SLOW_LOG = os.path.join(LOG_DIR, 'slow_requests.log')


# Формат строки:
# 2026-09-24 16:25:50 [WARNING] slow_requests: 1234ms | GET /api/tasks | status=200 | user=admin | ip=127.0.0.1 | ua='Mozilla/5.0'
_LINE_RE = re.compile(
    r'^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+'
    r'\[WARNING\]\s+slow_requests:\s+'
    r'(?P<ms>\d+)ms\s+\|\s+'
    r'(?P<method>\S+)\s+(?P<path>[^|]+?)\s+\|\s+'
    r'status=(?P<status>\d+)\s+\|\s+'
    r'user=(?P<user>[^|]*?)\s+\|\s+'
    r'ip=(?P<ip>[^|]*?)\s+\|\s+'
    r'ua=(?P<ua>.*)$'
)


def _parse_line(line):
    m = _LINE_RE.match(line.strip())
    if not m:
        return None
    d = m.groupdict()
    return {
        'timestamp': d['ts'],
        'ms': int(d['ms']),
        'method': d['method'],
        'path': d['path'].strip(),
        'status': int(d['status']),
        'user': d['user'].strip() or '—',
        'ip': d['ip'].strip() or '—',
        'ua': d['ua'].strip().strip("'"),
    }


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


@dev_slow_bp.route('/api/dev/slow-requests')
@role_required(*DEV_ROLES)
def list_slow_requests():
    """
    ?lines=200 — сколько последних строк
    ?min_ms=0 — минимальная длительность
    """
    try:
        try:
            lines_limit = int(request.args.get('lines', 200))
            lines_limit = max(10, min(lines_limit, 5000))
        except (TypeError, ValueError):
            lines_limit = 200

        try:
            min_ms = int(request.args.get('min_ms', 0))
        except (TypeError, ValueError):
            min_ms = 0

        if not os.path.isfile(SLOW_LOG):
            return jsonify({
                'exists': False,
                'entries': [],
                'total': 0,
                'file_size': 0,
                'file_size_human': '0 Б',
            })

        with open(SLOW_LOG, 'r', encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()

        last = all_lines[-lines_limit:] if lines_limit < len(all_lines) \
            else all_lines

        entries = []
        for line in reversed(last):
            parsed = _parse_line(line)
            if parsed and parsed['ms'] >= min_ms:
                entries.append(parsed)

        size = os.path.getsize(SLOW_LOG)

        return jsonify({
            'exists': True,
            'entries': entries,
            'total': len(entries),
            'file_size': size,
            'file_size_human': _human_size(size),
        })
    except Exception as e:
        log.exception('dev_slow list error')
        return jsonify({'error': str(e)}), 500


@dev_slow_bp.route('/api/dev/slow-requests/clear', methods=['POST'])
@role_required(*DEV_ROLES)
def clear_slow_requests():
    """Очищает slow_requests.log."""
    try:
        if os.path.isfile(SLOW_LOG):
            with open(SLOW_LOG, 'w', encoding='utf-8'):
                pass

        log.info(
            f'[DEV] [{session.get("user_login")}] Очищен slow_requests.log'
        )
        return jsonify({'success': True, 'message': 'Лог очищен'})
    except Exception as e:
        log.exception('dev_slow clear error')
        return jsonify({'success': False, 'error': str(e)}), 500