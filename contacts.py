# contacts.py
"""Внешние контакты: поставщики, сервис, партнёры."""
from flask import Blueprint, request, jsonify
from database import Database
from utils import (
    login_required, get_json_safe,
    json_ok, json_error, json_list,
)
from validators import (
    validate_required, validate_length,
    validate_email, validate_phone,
)
from constants import CONTACT_CATEGORIES
from logger import get_logger

log = get_logger(__name__)
contacts_bp = Blueprint('contacts', __name__)
db = Database()


def _validate_contact(data, is_update=False):
    """Валидация. Возвращает (ok, error_msg)."""
    ok, err = validate_required(data.get('company_name'), 'Название организации')
    if not ok:
        return ok, err

    ok, err = validate_length(data.get('company_name'), 'Организация', max_len=200)
    if not ok:
        return ok, err

    if data.get('email'):
        ok, err = validate_email(data['email'])
        if not ok:
            return ok, err

    if data.get('phone'):
        ok, err = validate_phone(data['phone'])
        if not ok:
            return ok, err

    if data.get('category') and data['category'] not in CONTACT_CATEGORIES:
        return False, 'Недопустимая категория'

    return True, None


def _normalize_contact(data):
    """Приводит поля к единому виду."""
    return {
        'category': (data.get('category') or '').strip(),
        'company_name': (data.get('company_name') or '').strip(),
        'contact_person': (data.get('contact_person') or '').strip(),
        'position': (data.get('position') or '').strip(),
        'phone': (data.get('phone') or '').strip(),
        'email': (data.get('email') or '').strip(),
        'notes': (data.get('notes') or '').strip(),
    }


# ============================================================
# СПИСОК
# ============================================================

@contacts_bp.route('/api/contacts')
@login_required
def get_contacts():
    try:
        contacts = db.query('''
            SELECT id, category, company_name, contact_person, position,
                   phone, email, notes
            FROM external_contacts
            ORDER BY category, company_name
        ''')
        return json_list([dict(c) for c in contacts])
    except Exception as e:
        log.exception('Ошибка получения контактов')
        return json_error(f'Ошибка: {str(e)}', 500)


@contacts_bp.route('/api/contacts/<int:contact_id>')
@login_required
def get_contact(contact_id):
    try:
        contact = db.query(
            'SELECT * FROM external_contacts WHERE id = ?',
            [contact_id], one=True,
        )
        if not contact:
            return json_error('Контакт не найден', 404)
        return jsonify(dict(contact))
    except Exception as e:
        log.exception('Ошибка получения контакта')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# СОЗДАНИЕ
# ============================================================

@contacts_bp.route('/api/contacts', methods=['POST'])
@login_required
def create_contact():
    try:
        data = get_json_safe()
        if not data:
            return json_error('Нет данных', 400)

        ok, err = _validate_contact(data)
        if not ok:
            return json_error(err, 400)

        normalized = _normalize_contact(data)

        with db.transaction(immediate=True) as tx:
            contact_id = tx.execute('''
                INSERT INTO external_contacts
                    (category, company_name, contact_person, position,
                     phone, email, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', [
                normalized['category'],
                normalized['company_name'],
                normalized['contact_person'],
                normalized['position'],
                normalized['phone'],
                normalized['email'],
                normalized['notes'],
            ])

        return json_ok(contact_id=contact_id, message='Контакт добавлен'), 201
    except Exception as e:
        log.exception('Ошибка добавления контакта')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# ОБНОВЛЕНИЕ
# ============================================================

@contacts_bp.route('/api/contacts/<int:contact_id>', methods=['PUT'])
@login_required
def update_contact(contact_id):
    try:
        data = get_json_safe()
        if not data:
            return json_error('Нет данных', 400)

        old = db.query(
            'SELECT * FROM external_contacts WHERE id = ?',
            [contact_id], one=True,
        )
        if not old:
            return json_error('Контакт не найден', 404)

        # Мержим старые и новые значения
        merged = {
            'category': data.get('category', old['category']),
            'company_name': data.get('company_name', old['company_name']),
            'contact_person': data.get('contact_person', old['contact_person']),
            'position': data.get('position', old['position']),
            'phone': data.get('phone', old['phone']),
            'email': data.get('email', old['email']),
            'notes': data.get('notes', old['notes']),
        }

        ok, err = _validate_contact(merged)
        if not ok:
            return json_error(err, 400)

        normalized = _normalize_contact(merged)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE external_contacts
                SET category = ?, company_name = ?, contact_person = ?,
                    position = ?, phone = ?, email = ?, notes = ?
                WHERE id = ?
            ''', [
                normalized['category'],
                normalized['company_name'],
                normalized['contact_person'],
                normalized['position'],
                normalized['phone'],
                normalized['email'],
                normalized['notes'],
                contact_id,
            ])

        return json_ok(message='Контакт обновлён')
    except Exception as e:
        log.exception('Ошибка обновления контакта')
        return json_error(f'Ошибка: {str(e)}', 500)


# ============================================================
# УДАЛЕНИЕ
# ============================================================

@contacts_bp.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@login_required
def delete_contact(contact_id):
    try:
        contact = db.query(
            'SELECT id FROM external_contacts WHERE id = ?',
            [contact_id], one=True,
        )
        if not contact:
            return json_error('Контакт не найден', 404)

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM external_contacts WHERE id = ?', [contact_id])

        return json_ok(message='Контакт удалён')
    except Exception as e:
        log.exception('Ошибка удаления контакта')
        return json_error(f'Ошибка: {str(e)}', 500)