# users_import.py
"""
Импорт пользователей из внешней SQLite БД.
Поддерживает две схемы: Support Active и legacy.
"""
import os
import sqlite3
import tempfile

from flask import Blueprint, jsonify, request

from database import Database
from utils import role_required
from passwords import hash_password
from logger import get_logger

log = get_logger(__name__)
users_import_bp = Blueprint('users_import', __name__)
db = Database()


def _normalize_role(raw_role, raw_type_access=''):
    s = f"{raw_role or ''} {raw_type_access or ''}".strip().lower()
    if any(k in s for k in ['admin', 'админ', 'root', 'administrator', 'super']):
        return 'Администратор'
    if any(k in s for k in ['tech', 'техник', 'мастер', 'engineer', 'support']):
        return 'Техник'
    return 'Пользователь'


def _build_full_name(ext_user):
    direct = (ext_user.get('full_name') or '').strip()
    if direct:
        return direct

    family = (
        ext_user.get('family')
        or ext_user.get('surname')
        or ext_user.get('last_name')
        or ''
    ).strip()
    name = (ext_user.get('name') or ext_user.get('first_name') or '').strip()
    father = (
        ext_user.get('father')
        or ext_user.get('patronymic')
        or ext_user.get('middle_name')
        or ''
    ).strip()

    parts = [p for p in (family, name, father) if p]
    if parts:
        return ' '.join(parts)
    return ''


@users_import_bp.route('/api/users/import', methods=['POST'])
@role_required('Администратор')
def import_users():
    tmp_path = None
    try:
        if 'database_file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        file = request.files['database_file']
        if not file or file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400

        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        if ext not in ('db', 'sqlite', 'sqlite3'):
            return jsonify({
                'success': False,
                'error': 'Поддерживаются только .db, .sqlite, .sqlite3'
            }), 400

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        tmp_path = tmp.name
        tmp.close()
        file.save(tmp_path)

        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        all_tables = [r['name'] for r in cursor.fetchall()]
        users_table = None
        for t in all_tables:
            if t.lower() == 'users':
                users_table = t
                break

        if not users_table:
            conn.close()
            return jsonify({
                'success': False,
                'error': (
                    f'В файле нет таблицы users. '
                    f'Найдены: {", ".join(all_tables) or "нет"}'
                )
            }), 400

        cursor.execute(f'SELECT * FROM "{users_table}"')
        external_users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not external_users:
            return jsonify({
                'success': True, 'imported': 0, 'skipped': 0, 'total': 0,
                'errors': ['Таблица users пуста'],
                'message': 'Таблица users пуста'
            })

        first_row_keys = set(k.lower() for k in external_users[0].keys())
        is_legacy = (
            ('family' in first_row_keys or 'father' in first_row_keys)
            and 'full_name' not in first_row_keys
        )

        imported = 0
        skipped = 0
        errors = []

        for ext_user in external_users:
            u = {k.lower(): v for k, v in ext_user.items()}
            full_name = _build_full_name(u)

            initials = (u.get('initials') or '').strip()
            if initials and initials not in full_name:
                full_name = f'{full_name} ({initials})'.strip()

            login = (u.get('login') or '').strip()

            if not login:
                skipped += 1
                errors.append(f'Пропущен: нет логина (ID={u.get("id")})')
                continue
            if not full_name:
                skipped += 1
                errors.append(f'Пропущен: не удалось собрать ФИО (логин={login})')
                continue

            existing = db.query(
                'SELECT id FROM users WHERE login = ?', [login], one=True
            )
            if existing:
                skipped += 1
                continue

            password = str(u.get('password') or u.get('pass') or '').strip()
            if not password:
                password = 'changeme123'
                errors.append(f'{login}: пароль не найден, установлен временный')

            raw_role = u.get('role') or u.get('groupuser') or u.get('group_user') or ''
            raw_type_access = u.get('typeaccess') or u.get('type_access') or ''
            role = _normalize_role(raw_role, raw_type_access)

            department = (u.get('department') or u.get('depart') or '').strip()
            position = (u.get('position') or '').strip()
            if position and position not in department:
                department = f'{department} / {position}' if department else position

            email = (u.get('email') or '').strip()
            phone = (u.get('phone') or u.get('number') or '').strip()
            avatar = (u.get('avatar') or u.get('image') or '').strip() or 'default.png'

            is_active = u.get('is_active')
            if is_active is None:
                is_active = 1
            else:
                try:
                    is_active = 1 if int(is_active) else 0
                except (ValueError, TypeError):
                    is_active = 1

            try:
                with db.transaction(immediate=True) as tx:
                    tx.execute('''
                        INSERT INTO users 
                            (full_name, role, avatar, email, phone, department,
                             login, password, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', [
                        full_name, role, avatar, email, phone, department, login,
                        hash_password(password), is_active
                    ])
                imported += 1
            except Exception as e:
                skipped += 1
                errors.append(f'{login}: {str(e)}')

        try:
            from audit import log_action
            log_action('import', 'user', None, {
                'imported': imported, 'skipped': skipped,
            })
        except Exception:
            pass

        schema_note = 'legacy' if is_legacy else 'support_active'
        return jsonify({
            'success': True,
            'imported': imported,
            'skipped': skipped,
            'total': len(external_users),
            'schema': schema_note,
            'errors': errors[:30],
            'message': f'Схема: {schema_note}. Импортировано: {imported}, пропущено: {skipped}'
        })
    except Exception as e:
        log.exception('Ошибка импорта пользователей')
        return jsonify({
            'success': False,
            'error': f'Ошибка импорта: {str(e)}'
        }), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass