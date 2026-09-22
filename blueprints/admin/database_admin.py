# database_admin.py
"""
Инструменты разработчика:
  • Скачивание БД
  • Информация о структуре БД
  • Просмотр данных таблиц
  • Редактирование/удаление строк (для незащищённых таблиц)
  • Очистка таблиц (для незащищённых таблиц)
  • Read-only SELECT-запросы
  • Скачивание логов
  • Системная информация
  • Очистка кеша
  • Impersonation (вход под другим пользователем)

Доступ: роли «Разработчик» и «Администратор» (кроме impersonate).
"""
import io
import os
import re
import sys
import shutil
import sqlite3
from datetime import datetime

from flask import (
    Blueprint, jsonify, request, session,
    send_file, render_template, current_app,
)

from database import Database
from utils import role_required, human_size
from logger import get_logger
from constants import ROLE_ADMIN, ROLE_DEVELOPER

log = get_logger(__name__)
db = Database()

db_admin_bp = Blueprint('db_admin', __name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, 'logs')
BACKUP_DIR = os.path.join(BASE_DIR, 'backups')

os.makedirs(BACKUP_DIR, exist_ok=True)

DEV_ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

# Валидация имени таблицы
_TABLE_NAME_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]{0,63}$')

# ============================================================
# ЗАЩИЩЁННЫЕ ТАБЛИЦЫ
# ============================================================
# Полностью защищены от редактирования, удаления строк
# и очистки. Доступны только для чтения (SELECT).
_PROTECTED_TABLES = {
    # --- Системные SQLite ---
    'schema_version',       # версия схемы миграций
    'sqlite_sequence',      # автоинкремент
    'sqlite_stat1',         # статистика оптимизатора

    # --- Критичные для входа в систему ---
    'users',                # удаление сломает вход
    'login_attempts',       # счётчики брутфорса

    # --- Аудит и история (только чтение) ---
    'audit_log',            # журнал действий — не должен правиться
    'task_history',         # история изменений заявок

    # --- Генерируются системой ---
    'notifications',        # создаются автоматически
    'push_subscriptions',   # Web Push подписки
}

# Запрещённые SQL-ключевые слова для ручных запросов
_FORBIDDEN_SQL_KEYWORDS = (
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE',
    'TRUNCATE', 'REPLACE', 'ATTACH', 'DETACH', 'PRAGMA',
    'VACUUM', 'REINDEX',
)


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _is_protected(table_name):
    """
    Проверяет, защищена ли таблица.
    Учитывает как точные имена, так и маски (например, sqlite_*).
    """
    if table_name in _PROTECTED_TABLES:
        return True
    # Маска для sqlite_* — уже перечислены явно, но на всякий случай
    if table_name.startswith('sqlite_'):
        return True
    return False


def _validate_table(table_name):
    """
    Проверяет таблицу для операций ЗАПИСИ (update/delete/clear).
    Возвращает (ok, error_msg).
    """
    if not _TABLE_NAME_RE.match(table_name):
        return False, 'Некорректное имя таблицы'

    if _is_protected(table_name):
        return False, 'Эта таблица защищена от изменений'

    exists = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table_name], one=True,
    )
    if not exists:
        return False, 'Таблица не найдена'
    return True, None


def _validate_table_readonly(table_name):
    """
    Проверяет таблицу для операций ЧТЕНИЯ (select).
    Возвращает (ok, error_msg).
    """
    if not _TABLE_NAME_RE.match(table_name):
        return False, 'Некорректное имя таблицы'

    exists = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table_name], one=True,
    )
    if not exists:
        return False, 'Таблица не найдена'
    return True, None


def _get_table_columns(table_name):
    """Возвращает список dict с полями name, type, notnull, pk, default."""
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
    """Проверяет, есть ли в таблице колонка id (для редактирования/удаления)."""
    cols = _get_table_columns(table_name)
    return any(c['name'] == 'id' and c['pk'] for c in cols)


def _coerce_value(raw_value, col_type):
    """
    Приводит JSON-значение к типу колонки SQLite.
    Возвращает (ok, value, error).
    """
    col_type = (col_type or 'TEXT').upper()

    if raw_value is None or raw_value == '':
        return True, None, None

    if 'INT' in col_type:
        try:
            return True, int(raw_value), None
        except (TypeError, ValueError):
            return False, None, f'Ожидается целое число: {raw_value!r}'

    if 'REAL' in col_type or 'FLOAT' in col_type or 'DOUBLE' in col_type:
        try:
            return True, float(raw_value), None
        except (TypeError, ValueError):
            return False, None, f'Ожидается число: {raw_value!r}'

    return True, str(raw_value), None


# ============================================================
# СТРАНИЦА
# ============================================================

@db_admin_bp.route('/dev')
@role_required(*DEV_ROLES)
def dev_console_page():
    return render_template('dev_console.html')


# ============================================================
# ИНФОРМАЦИЯ О БД
# ============================================================

@db_admin_bp.route('/api/dev/db/info')
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


@db_admin_bp.route('/api/dev/db/schema')
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
                cnt = db.query(f'SELECT COUNT(*) AS c FROM {name}', one=True)['c']
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
                'has_id': any(
                    c['name'] == 'id' and c['pk'] for c in cols
                ),
                'protected': _is_protected(name),
            })

        return jsonify({'tables': result})
    except Exception as e:
        log.exception('db_schema error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# ДАННЫЕ ТАБЛИЦ
# ============================================================

@db_admin_bp.route('/api/dev/db/table/<table_name>')
@role_required(*DEV_ROLES)
def db_table_data(table_name):
    # Для чтения защищённые таблицы разрешены
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

        has_id = 'id' in columns
        is_protected = _is_protected(table_name)

        return jsonify({
            'table': table_name,
            'columns': columns,
            'rows': result_rows,
            'total': total,
            'limit': limit,
            'offset': offset,
            'shown': len(result_rows),
            'has_id': has_id,
            'protected': is_protected,
        })
    except Exception as e:
        log.exception(f'db_table_data error ({table_name})')
        return jsonify({'error': str(e)}), 500


# ============================================================
# РЕДАКТИРОВАНИЕ СТРОКИ
# ============================================================

@db_admin_bp.route('/api/dev/db/row/<table_name>/<int:row_id>', methods=['PUT'])
@role_required(*DEV_ROLES)
def db_row_update(table_name, row_id):
    """Обновляет строку таблицы по id. Защищённые таблицы — запрещены."""
    try:
        # Для записи защищённые таблицы НЕ разрешены
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

            ok, value, err = _coerce_value(raw_value, col['type'])
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

@db_admin_bp.route('/api/dev/db/row/<table_name>/<int:row_id>', methods=['DELETE'])
@role_required(*DEV_ROLES)
def db_row_delete(table_name, row_id):
    """Удаляет строку таблицы по id. Защищённые таблицы — запрещены."""
    try:
        # Для записи защищённые таблицы НЕ разрешены
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

@db_admin_bp.route('/api/dev/db/table/<table_name>/clear', methods=['DELETE'])
@role_required(*DEV_ROLES)
def db_table_clear(table_name):
    """
    Удаляет ВСЕ строки таблицы.
    Требует подтверждения именем таблицы.
    Защищённые таблицы — запрещены.
    Принимает confirm из body ИЛИ из query-параметров.
    """
    try:
        # Для записи защищённые таблицы НЕ разрешены
        ok, err = _validate_table(table_name)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        data = request.get_json(silent=True) or {}
        # Принимаем confirm из body ИЛИ из query
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


# ============================================================
# СКАЧИВАНИЕ БД
# ============================================================

@db_admin_bp.route('/api/dev/db/download')
@role_required(*DEV_ROLES)
def db_download():
    try:
        db_path = db.db_name
        if not os.path.exists(db_path):
            return jsonify({'error': 'БД не найдена'}), 404

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


# ============================================================
# SELECT-ЗАПРОСЫ
# ============================================================

@db_admin_bp.route('/api/dev/db/query', methods=['POST'])
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


# ============================================================
# IMPERSONATION
# ============================================================

@db_admin_bp.route('/api/dev/users')
@role_required(*DEV_ROLES)
def dev_users_list():
    try:
        rows = db.query('''
            SELECT id, full_name, role, login, is_active, department
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY full_name
        ''')
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('dev_users_list error')
        return jsonify({'error': str(e)}), 500


@db_admin_bp.route('/api/dev/impersonate/<int:user_id>', methods=['POST'])
@role_required(ROLE_DEVELOPER)
def dev_impersonate(user_id):
    try:
        target = db.query(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
            [user_id], one=True,
        )
        if not target:
            return jsonify({
                'success': False,
                'error': 'Пользователь не найден',
            }), 404

        if not target['is_active']:
            return jsonify({
                'success': False,
                'error': 'Пользователь заблокирован',
            }), 400

        if target['id'] == session.get('user_id'):
            return jsonify({
                'success': False,
                'error': 'Вы уже находитесь под этой учётной записью',
            }), 400

        if not session.get('original_dev_user_id'):
            session['original_dev_user_id'] = session.get('user_id')
            session['original_dev_data'] = {
                'user_name': session.get('user_name'),
                'user_role': session.get('user_role'),
                'user_avatar': session.get('user_avatar'),
                'user_email': session.get('user_email'),
                'user_phone': session.get('user_phone'),
                'user_department': session.get('user_department'),
                'user_login': session.get('user_login'),
            }

        session['user_id'] = target['id']
        session['user_name'] = target['full_name']
        session['user_role'] = target['role']
        session['user_avatar'] = target['avatar']
        session['user_email'] = target['email']
        session['user_phone'] = target['phone']
        session['user_department'] = target['department']
        session['user_login'] = target['login']
        session['impersonating'] = True

        log.info(
            f'[IMPERSONATE] {session.get("original_dev_data", {}).get("user_login")} '
            f'вошёл как {target["login"]} ({target["role"]})'
        )

        return jsonify({
            'success': True,
            'redirect': '/',
            'message': f'Вы вошли как {target["full_name"]}',
        })
    except Exception as e:
        log.exception('dev_impersonate error')
        return jsonify({'success': False, 'error': str(e)}), 500


@db_admin_bp.route('/api/dev/impersonate/back', methods=['POST'])
def dev_impersonate_back():
    try:
        original_id = session.get('original_dev_user_id')
        if not original_id:
            return jsonify({
                'success': False,
                'error': 'Нет активной подмены пользователя',
            }), 400

        original = session.get('original_dev_data') or {}

        session['user_id'] = original_id
        session['user_name'] = original.get('user_name', '')
        session['user_role'] = original.get('user_role', '')
        session['user_avatar'] = original.get('user_avatar', '')
        session['user_email'] = original.get('user_email', '')
        session['user_phone'] = original.get('user_phone', '')
        session['user_department'] = original.get('user_department', '')
        session['user_login'] = original.get('user_login', '')

        session.pop('original_dev_user_id', None)
        session.pop('original_dev_data', None)
        session.pop('impersonating', None)

        log.info(f'[IMPERSONATE] Возврат к {original.get("user_login", "?")}')

        return jsonify({
            'success': True,
            'redirect': '/dev',
            'message': 'Возврат к сессии разработчика',
        })
    except Exception as e:
        log.exception('dev_impersonate_back error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ЛОГИ
# ============================================================

@db_admin_bp.route('/api/dev/logs')
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


@db_admin_bp.route('/api/dev/logs/<path:filename>')
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


@db_admin_bp.route('/api/dev/logs/<path:filename>/download')
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


# ============================================================
# СИСТЕМА
# ============================================================

@db_admin_bp.route('/api/dev/system-info')
@role_required(*DEV_ROLES)
def system_info():
    try:
        import platform

        packages = []
        try:
            from importlib.metadata import distributions
            for dist in distributions():
                name = dist.metadata['Name']
                if name and name.lower() in (
                    'flask', 'werkzeug', 'flask-session', 'flask-wtf',
                    'flask-limiter', 'flask-caching', 'jinja2',
                    'python-dotenv', 'openpyxl', 'pywebpush', 'py-vapid',
                    'cryptography', 'gunicorn', 'redis', 'puremagic',
                    'qrcode', 'weasyprint',
                ):
                    packages.append({
                        'name': name,
                        'version': dist.version,
                    })
        except Exception:
            pass

        packages.sort(key=lambda x: x['name'].lower())

        safe_env_keys = (
            'FLASK_ENV', 'FLASK_DEBUG', 'SESSION_TYPE', 'CACHE_TYPE',
            'RATELIMIT_STORAGE_URI', 'DISABLE_PING_SCHEDULER',
            'PING_INTERVAL_SEC', 'ENABLE_SSE',
        )
        env_values = {
            k: os.environ.get(k, '—') for k in safe_env_keys
        }

        return jsonify({
            'python': {
                'version': sys.version.split()[0],
                'executable': sys.executable,
                'platform': platform.platform(),
            },
            'flask': {
                'version': __import__('flask').__version__,
                'debug': current_app.config.get('DEBUG', False),
                'session_type': current_app.config.get('SESSION_TYPE'),
                'cache_type': current_app.config.get('CACHE_TYPE'),
            },
            'packages': packages,
            'env': env_values,
            'paths': {
                'base_dir': BASE_DIR,
                'db_path': db.db_name,
                'logs_dir': LOG_DIR,
                'backups_dir': BACKUP_DIR,
            },
        })
    except Exception as e:
        log.exception('system_info error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# ОЧИСТКА КЕША
# ============================================================

@db_admin_bp.route('/api/dev/cache/clear', methods=['POST'])
@role_required(*DEV_ROLES)
def cache_clear():
    try:
        from extensions import cache
        try:
            cache.clear()
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'cache.clear() failed: {e}',
            }), 500

        try:
            from audit import log_action
            log_action('clear', 'cache', None, {'action': 'dev_clear'})
        except Exception:
            pass

        log.info(f'[{session.get("user_login")}] Кеш очищен')
        return jsonify({'success': True, 'message': 'Кеш очищен'})
    except Exception as e:
        log.exception('cache_clear error')
        return jsonify({'success': False, 'error': str(e)}), 500