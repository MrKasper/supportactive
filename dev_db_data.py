# dev_db_data.py
"""
Dev-консоль: просмотр и редактирование данных таблиц.
"""
from flask import Blueprint, jsonify, request, session

from database import Database
from utils import role_required
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER
from dev_helpers import (
    is_protected, validate_table_name, coerce_value,
)

log = get_logger(__name__)
db = Database()

dev_db_data_bp = Blueprint('dev_db_data', __name__)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)


# ============================================================
# ВАЛИДАЦИЯ
# ============================================================

def _validate_table(table_name):
    """Для операций ЗАПИСИ."""
    if not validate_table_name(table_name):
        return False, 'Некорректное имя таблицы'
    if is_protected(table_name):
        return False, 'Эта таблица защищена от изменений'

    exists = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table_name], one=True,
    )
    if not exists:
        return False, 'Таблица не найдена'
    return True, None


def _validate_table_readonly(table_name):
    """Для операций ЧТЕНИЯ."""
    if not validate_table_name(table_name):
        return False, 'Некорректное имя таблицы'

    exists = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table_name], one=True,
    )
    if not exists:
        return False, 'Таблица не найдена'
    return True, None


def _get_table_columns(table_name):
    cols = db.query(f'PRAGMA table_info({table_name})')
    return [
        {
            'name': c['name'],
            'type': (c['type'] or 'TEXT').upper(),
            'notnull': bool(c['notnull']),
            'pk': bool(c['pk']),
            'default': c['dflt_value'],
        }
        for c in cols
    ]


def _has_id_column(table_name):
    cols = _get_table_columns(table_name)
    return any(c['name'] == 'id' and c['pk'] for c in cols)


# ============================================================
# ПРОСМОТР
# ============================================================

@dev_db_data_bp.route('/api/dev/db/table/<table_name>')
@role_required(*DEV_ROLES)
def db_table_data(table_name):
    ok, err = _validate_table_readonly(table_name)
    if not ok:
        return jsonify({'error': err}), 400

    try:
        limit = max(1, min(int(request.args.get('limit', 100)), 1000))
    except (TypeError, ValueError):
        limit = 100

    try:
        offset = max(0, int(request.args.get('offset', 0)))
    except (TypeError, ValueError):
        offset = 0

    try:
        cols = db.query(f'PRAGMA table_info({table_name})')
        columns = [c['name'] for c in cols]

        total = db.query(
            f'SELECT COUNT(*) AS c FROM {table_name}', one=True
        )['c']

        rows = db.query(
            f'SELECT * FROM {table_name} LIMIT ? OFFSET ?',
            [limit, offset],
        )

        result_rows = []
        for r in rows:
            row_data = []
            for col in columns:
                val = r[col]
                if isinstance(val, str) and len(val) > 1000:
                    val = val[:1000] + '...'
                row_data.append(val)
            result_rows.append(row_data)

        return jsonify({
            'table': table_name,
            'columns': columns,
            'rows': result_rows,
            'total': total,
            'limit': limit,
            'offset': offset,
            'shown': len(result_rows),
            'has_id': 'id' in columns,
            'protected': is_protected(table_name),
        })
    except Exception as e:
        log.exception(f'db_table_data error ({table_name})')
        return jsonify({'error': str(e)}), 500


# ============================================================
# РЕДАКТИРОВАНИЕ СТРОКИ
# ============================================================

@dev_db_data_bp.route(
    '/api/dev/db/row/<table_name>/<int:row_id>', methods=['PUT']
)
@role_required(*DEV_ROLES)
def db_row_update(table_name, row_id):
    try:
        ok, err = _validate_table(table_name)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        if not _has_id_column(table_name):
            return jsonify({
                'success': False,
                'error': 'У таблицы нет колонки id',
            }), 400

        row = db.query(
            f'SELECT * FROM {table_name} WHERE id = ?',
            [row_id], one=True,
        )
        if not row:
            return jsonify({
                'success': False,
                'error': 'Строка не найдена',
            }), 404

        data = request.get_json(silent=True) or {}
        if not data:
            return jsonify({
                'success': False,
                'error': 'Нет данных',
            }), 400

        cols = _get_table_columns(table_name)
        col_map = {c['name']: c for c in cols}

        set_parts = []
        params = []
        for key, raw_value in data.items():
            if key == 'id':
                continue
            col = col_map.get(key)
            if not col:
                return jsonify({
                    'success': False,
                    'error': f'Неизвестная колонка: {key}',
                }), 400

            ok, value, err = coerce_value(raw_value, col['type'])
            if not ok:
                return jsonify({
                    'success': False,
                    'error': f'{key}: {err}',
                }), 400

            set_parts.append(f'{key} = ?')
            params.append(value)

        if not set_parts:
            return jsonify({
                'success': False,
                'error': 'Нечего обновлять',
            }), 400

        params.append(row_id)
        sql = f'UPDATE {table_name} SET {", ".join(set_parts)} WHERE id = ?'

        with db.transaction(immediate=True) as tx:
            tx.execute(sql, params)

        try:
            from audit import log_action
            log_action('update', f'db_table:{table_name}', row_id, {
                'fields': list(data.keys()),
                'updated_by': session.get('user_login'),
            })
        except Exception:
            pass

        log.warning(
            f'[DEV] {session.get("user_login")} обновил '
            f'{table_name}#{row_id}: {list(data.keys())}'
        )

        return jsonify({
            'success': True,
            'message': f'Строка #{row_id} обновлена',
        })
    except Exception as e:
        log.exception('db_row_update error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ СТРОКИ
# ============================================================

@dev_db_data_bp.route(
    '/api/dev/db/row/<table_name>/<int:row_id>', methods=['DELETE']
)
@role_required(*DEV_ROLES)
def db_row_delete(table_name, row_id):
    try:
        ok, err = _validate_table(table_name)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        if not _has_id_column(table_name):
            return jsonify({
                'success': False,
                'error': 'У таблицы нет колонки id',
            }), 400

        row = db.query(
            f'SELECT * FROM {table_name} WHERE id = ?',
            [row_id], one=True,
        )
        if not row:
            return jsonify({
                'success': False,
                'error': 'Строка не найдена',
            }), 404

        with db.transaction(immediate=True) as tx:
            tx.execute(f'DELETE FROM {table_name} WHERE id = ?', [row_id])

        try:
            from audit import log_action
            log_action('delete', f'db_table:{table_name}', row_id, {
                'deleted_by': session.get('user_login'),
            })
        except Exception:
            pass

        log.warning(
            f'[DEV] {session.get("user_login")} удалил '
            f'{table_name}#{row_id}'
        )

        return jsonify({
            'success': True,
            'message': f'Строка #{row_id} удалена',
        })
    except Exception as e:
        log.exception('db_row_delete error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ОЧИСТКА ТАБЛИЦЫ
# ============================================================

@dev_db_data_bp.route(
    '/api/dev/db/table/<table_name>/clear', methods=['DELETE']
)
@role_required(*DEV_ROLES)
def db_table_clear(table_name):
    """
    Удаляет ВСЕ строки таблицы.
    Требует подтверждения именем таблицы.
    """
    try:
        ok, err = _validate_table(table_name)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        data = request.get_json(silent=True) or {}
        confirm = (
            data.get('confirm')
            or request.args.get('confirm')
            or ''
        ).strip()

        if confirm != table_name:
            return jsonify({
                'success': False,
                'error': 'Подтверждение не совпадает с именем таблицы',
            }), 400

        try:
            count_before = db.query(
                f'SELECT COUNT(*) AS c FROM {table_name}', one=True
            )['c']
        except Exception:
            count_before = 0

        with db.transaction(immediate=True) as tx:
            tx.execute(f'DELETE FROM {table_name}')

        try:
            from audit import log_action
            log_action('delete', f'db_table:{table_name}', None, {
                'action': 'clear_all',
                'rows_deleted': count_before,
                'by': session.get('user_login'),
            })
        except Exception:
            pass

        log.warning(
            f'[DEV] {session.get("user_login")} ОЧИСТИЛ таблицу '
            f'{table_name} ({count_before} строк)'
        )

        return jsonify({
            'success': True,
            'deleted': count_before,
            'message': f'Удалено {count_before} строк',
        })
    except Exception as e:
        log.exception('db_table_clear error')
        return jsonify({'success': False, 'error': str(e)}), 500