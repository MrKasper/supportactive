# equipment_helpers.py
"""
Общие хелперы для blueprint'ов оборудования кабинета.
"""
import os
from datetime import datetime

from flask import jsonify

from database import Database
from constants import EDITOR_ROLES, ALLOWED_DOCUMENT_EXT

db = Database()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ATTACHMENTS_FOLDER = os.path.join(BASE_DIR, 'private_uploads', 'attachments')
DOCUMENTS_FOLDER = os.path.join(BASE_DIR, 'private_uploads', 'documents')

MAX_DOC_SIZE = 20 * 1024 * 1024  # 20 МБ


def now_str():
    """Возвращает текущее время в формате БД."""
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def check_cabinet(cabinet_id):
    """
    Проверяет существование кабинета.
    Возвращает (cabinet_dict, None) или (None, (response, status)).
    """
    c = db.query('SELECT * FROM cabinets WHERE id = ?', [cabinet_id], one=True)
    if not c:
        return None, (jsonify({'error': 'Кабинет не найден'}), 404)
    return c, None


def next_sort_order(table, cabinet_id):
    """Возвращает следующий sort_order для записи в кабинете."""
    row = db.query(
        f'SELECT COALESCE(MAX(sort_order), 0) AS mx FROM {table} WHERE cabinet_id = ?',
        [cabinet_id], one=True,
    )
    return (row['mx'] or 0) + 1