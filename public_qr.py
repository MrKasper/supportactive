# public_qr.py
"""
Публичные страницы для QR-кодов.
Без авторизации — показывают только базовую информацию об устройстве.
"""
from flask import Blueprint, render_template
from database import Database
from logger import get_logger
import json

log = get_logger(__name__)
public_qr_bp = Blueprint('public_qr', __name__)
db = Database()


@public_qr_bp.route('/qr/pc/<int:pc_id>')
def public_pc_card(pc_id):
    """
    Публичная карточка ПК.
    Показывает: название, IP, ОЗУ, диски, ПО, статус, кабинет.
    НЕ показывает: notes, служебные поля.
    """
    try:
        pc = db.query('''
            SELECT c.*, cab.cabinet_number AS cabinet_number,
                   cab.floor AS cabinet_floor,
                   cab.building AS cabinet_building
            FROM cabinet_computers c
            LEFT JOIN cabinets cab ON cab.id = c.cabinet_id
            WHERE c.id = ?
        ''', [pc_id], one=True)

        if not pc:
            return render_template('qr/not_found.html'), 404

        d = dict(pc)
        for field in ('ram', 'storage', 'software'):
            try:
                d[field] = json.loads(d.get(field) or '[]')
            except Exception:
                d[field] = []

        # Убираем служебные/приватные поля
        d.pop('notes', None)
        d.pop('last_ping_at', None)
        d.pop('last_ping_status', None)
        d.pop('ping_count', None)
        d.pop('ping_success_count', None)

        return render_template('qr/pc_card.html', pc=d)
    except Exception as e:
        log.exception('public_pc_card error')
        return render_template('qr/not_found.html'), 500


@public_qr_bp.route('/qr/printer/<int:printer_id>')
def public_printer_card(printer_id):
    """Публичная карточка принтера."""
    try:
        pr = db.query('''
            SELECT p.*, cab.cabinet_number AS cabinet_number,
                   cab.floor AS cabinet_floor,
                   cab.building AS cabinet_building
            FROM cabinet_printers p
            LEFT JOIN cabinets cab ON cab.id = p.cabinet_id
            WHERE p.id = ?
        ''', [printer_id], one=True)

        if not pr:
            return render_template('qr/not_found.html'), 404

        d = dict(pr)
        d.pop('notes', None)

        # Для USB-принтера — имя подключённого ПК
        connected_pc_name = None
        if d.get('connected_to_pc_id'):
            pc = db.query(
                'SELECT name FROM cabinet_computers WHERE id = ?',
                [d['connected_to_pc_id']], one=True,
            )
            if pc:
                connected_pc_name = pc['name']
        d['connected_pc_name'] = connected_pc_name

        return render_template('qr/printer_card.html', pr=d)
    except Exception as e:
        log.exception('public_printer_card error')
        return render_template('qr/not_found.html'), 500