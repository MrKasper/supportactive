# dev_db_query.py
"""
Dev-консоль: SELECT-запросы (только чтение).
"""
import sqlite3

from flask import Blueprint, jsonify, request

from database import Database
from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER
from dev_helpers import _FORBIDDEN_SQL_KEYWORDS

log = get_logger(__name__)
db = Database()

dev_db_query_bp = Blueprint('dev_db_query', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


@dev_db_query_bp.route('/api/dev/db/query', methods=['POST'])
@role_required(*DEV_ROLES)
def db_query():
    try:
        data = request.get_json(silent=True) or {}
        sql = (data.get('sql') or '').strip()

        if not sql:
            return jsonify({'error': 'Пустой запрос'}), 400

        sql_upper = sql.upper().lstrip()
        if not sql_upper.startswith('SELECT') and not sql_upper.startswith('WITH'):
            return jsonify({
                'error': 'Разрешены только SELECT и WITH запросы',
            }), 403

        for kw in _FORBIDDEN_SQL_KEYWORDS:
            if kw in sql_upper:
                return jsonify({
                    'error': f'Ключевое слово {kw} запрещено',
                }), 403

        if len(sql) > 5000:
            return jsonify({'error': 'Запрос слишком длинный'}), 400

        conn = sqlite3.connect(db.db_name)
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.cursor()
            cur.execute(sql)
            rows = cur.fetchall()
            total = len(rows)
            rows = rows[:1000]

            if rows:
                columns = list(rows[0].keys())
                result_rows = [list(r) for r in rows]
            else:
                columns = []
                result_rows = []

            return jsonify({
                'columns': columns,
                'rows': result_rows,
                'total': total,
                'shown': len(result_rows),
                'truncated': total > 1000,
            })
        finally:
            conn.close()

    except sqlite3.Error as e:
        return jsonify({'error': f'SQL: {e}'}), 400
    except Exception as e:
        log.exception('db_query error')
        return jsonify({'error': str(e)}), 500