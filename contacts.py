# contacts.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime

# Создаем Blueprint для контактов
contacts_bp = Blueprint('contacts', __name__)

# Инициализация базы данных
db = Database()


# ============= ДЕКОРАТОР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ =============
def login_required(f):
    """Декоратор для проверки авторизации пользователя"""
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Необходима авторизация'}), 401
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function


# ============= API ДЛЯ УПРАВЛЕНИЯ КОНТАКТАМИ =============

@contacts_bp.route('/api/contacts')
@login_required
def get_contacts():
    """Получение списка всех контактов"""
    try:
        contacts = db.query('''
            SELECT id, category, company_name, contact_person, position, 
                   phone, email, notes
            FROM external_contacts 
            ORDER BY category, company_name
        ''')
        return jsonify([dict(contact) for contact in contacts])

    except Exception as e:
        return jsonify({'error': f'Ошибка получения контактов: {str(e)}'}), 500


@contacts_bp.route('/api/contacts/<int:contact_id>')
@login_required
def get_contact(contact_id):
    """Получение информации о конкретном контакте"""
    try:
        contact = db.query('SELECT * FROM external_contacts WHERE id = ?', [contact_id], one=True)
        if not contact:
            return jsonify({'error': 'Контакт не найден'}), 404
        return jsonify(dict(contact))

    except Exception as e:
        return jsonify({'error': f'Ошибка получения контакта: {str(e)}'}), 500


@contacts_bp.route('/api/contacts', methods=['POST'])
@login_required
def create_contact():
    """Добавление нового контакта"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        category = data.get('category', '').strip()
        company_name = data.get('company_name', '').strip()
        contact_person = data.get('contact_person', '').strip()
        position = data.get('position', '').strip()
        phone = data.get('phone', '').strip()
        email = data.get('email', '').strip()
        notes = data.get('notes', '').strip()

        if not company_name:
            return jsonify({'success': False, 'error': 'Укажите название организации'}), 400

        contact_id = db.execute('''
            INSERT INTO external_contacts (category, company_name, contact_person, position, phone, email, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', [
            category,
            company_name,
            contact_person,
            position,
            phone,
            email,
            notes
        ])

        return jsonify({
            'success': True,
            'contact_id': contact_id,
            'message': 'Контакт успешно добавлен'
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка добавления контакта: {str(e)}'}), 500


@contacts_bp.route('/api/contacts/<int:contact_id>', methods=['PUT'])
@login_required
def update_contact(contact_id):
    """Обновление контакта"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM external_contacts WHERE id = ?', [contact_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Контакт не найден'}), 404

        db.execute('''
            UPDATE external_contacts 
            SET category = ?, company_name = ?, contact_person = ?, position = ?, 
                phone = ?, email = ?, notes = ?
            WHERE id = ?
        ''', [
            data.get('category', old['category']),
            data.get('company_name', old['company_name']),
            data.get('contact_person', old['contact_person']),
            data.get('position', old['position']),
            data.get('phone', old['phone']),
            data.get('email', old['email']),
            data.get('notes', old['notes']),
            contact_id
        ])

        return jsonify({
            'success': True,
            'message': 'Контакт успешно обновлен'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка обновления контакта: {str(e)}'}), 500


@contacts_bp.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
@login_required
def delete_contact(contact_id):
    """Удаление контакта"""
    try:
        contact = db.query('SELECT id FROM external_contacts WHERE id = ?', [contact_id], one=True)
        if not contact:
            return jsonify({'success': False, 'error': 'Контакт не найден'}), 404

        db.execute('DELETE FROM external_contacts WHERE id = ?', [contact_id])

        return jsonify({
            'success': True,
            'message': 'Контакт успешно удален'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка удаления контакта: {str(e)}'}), 500