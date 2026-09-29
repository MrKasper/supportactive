# inventory.py
"""
Инвентаризация оборудования.

Сессии + позиции. Автогенерация позиций по scope.
"""
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required, get_json_safe
from constants import EDITOR_ROLES
from logger import get_logger

log = get_logger(__name__)
db = Database()

bp = Blueprint('inventory', __name__)

_STATUSES = ('pending', 'found', 'missing', 'moved', 'damaged', 'extra')
_SCOPE_TYPES = ('all', 'cabinet', 'building')


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


# ============================================================
# ХЕЛПЕРЫ: генерация позиций
# ============================================================

def _collect_equipment(scope_type, scope_value):
    """
    Возвращает список dict:
      {type, id, cabinet_id, location}
    """
    items = []

    where_cab = ''
    params = []

    if scope_type == 'cabinet' and scope_value:
        # scope_value — это cabinet_number (текстовое поле)
        cab = db.query(
            'SELECT id, cabinet_number FROM cabinets WHERE cabinet_number = ?',
            [scope_value], one=True,
        )
        if cab:
            where_cab = ' WHERE cabinet_id = ?'
            params = [cab['id']]
    elif scope_type == 'building' and scope_value:
        cab_ids = db.query(
            'SELECT id FROM cabinets WHERE building = ?',
            [scope_value],
        )
        ids = [c['id'] for c in cab_ids]
        if ids:
            ph = ','.join('?' * len(ids))
            where_cab = f' WHERE cabinet_id IN ({ph})'
            params = ids

    # Компьютеры
    pcs = db.query(f'SELECT * FROM cabinet_computers{where_cab}', params)
    for p in pcs:
        cab_num = _cabinet_number(p['cabinet_id'])
        items.append({
            'type': 'computer',
            'id': p['id'],
            'cabinet_id': p['cabinet_id'],
            'location': cab_num,
        })

    # Принтеры
    prs = db.query(f'SELECT * FROM cabinet_printers{where_cab}', params)
    for p in prs:
        cab_num = _cabinet_number(p['cabinet_id'])
        items.append({
            'type': 'printer',
            'id': p['id'],
            'cabinet_id': p['cabinet_id'],
            'location': cab_num,
        })

    # Сетевое
    net = db.query(
        f'SELECT * FROM cabinet_network_devices{where_cab}', params,
    )
    for n in net:
        cab_num = _cabinet_number(n['cabinet_id'])
        items.append({
            'type': 'network',
            'id': n['id'],
            'cabinet_id': n['cabinet_id'],
            'location': cab_num,
        })

    return items


_cab_cache = {}


def _cabinet_number(cabinet_id):
    if cabinet_id is None:
        return ''
    if cabinet_id in _cab_cache:
        return _cab_cache[cabinet_id]
    row = db.query(
        'SELECT cabinet_number FROM cabinets WHERE id = ?',
        [cabinet_id], one=True,
    )
    val = (row['cabinet_number'] if row else '') or ''
    _cab_cache[cabinet_id] = val
    return val


def _clear_cab_cache():
    _cab_cache.clear()


# ============================================================
# СПИСОК СЕССИЙ
# ============================================================

@bp.route('/api/inventory/sessions')
@login_required
def list_sessions():
    try:
        rows = db.query('''
            SELECT s.*,
                   (SELECT COUNT(*) FROM inventory_items
                    WHERE session_id = s.id) AS total_items,
                   (SELECT COUNT(*) FROM inventory_items
                    WHERE session_id = s.id
                      AND status != 'pending') AS checked_items,
                   (SELECT COUNT(*) FROM inventory_items
                    WHERE session_id = s.id
                      AND status IN ('missing','damaged','moved')) AS issue_items
            FROM inventory_sessions s
            ORDER BY
                CASE s.status
                    WHEN 'in_progress' THEN 1
                    WHEN 'draft'       THEN 2
                    WHEN 'completed'   THEN 3
                    ELSE 4
                END,
                s.created_at DESC
        ''')
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        log.exception('inventory list_sessions error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/inventory/sessions/<int:sid>')
@login_required
def get_session(sid):
    try:
        s = db.query(
            'SELECT * FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not s:
            return jsonify({'error': 'Сессия не найдена'}), 404

        items = db.query('''
            SELECT * FROM inventory_items
            WHERE session_id = ?
            ORDER BY
                CASE status
                    WHEN 'missing'   THEN 1
                    WHEN 'damaged'   THEN 2
                    WHEN 'moved'     THEN 3
                    WHEN 'extra'     THEN 4
                    WHEN 'pending'   THEN 5
                    ELSE 6
                END,
                expected_location, id
        ''', [sid])

        # Оборудование — обогащаем именем
        enriched = []
        for it in items:
            d = dict(it)
            d['equipment_name'] = _equipment_name(
                d['equipment_type'], d['equipment_id'],
            )
            enriched.append(d)

        return jsonify({
            'session': dict(s),
            'items': enriched,
        })
    except Exception as e:
        log.exception('inventory get_session error')
        return jsonify({'error': str(e)}), 500


def _equipment_name(etype, eq_id):
    if etype == 'computer':
        t, col = 'cabinet_computers', 'name'
    elif etype == 'printer':
        t, col = 'cabinet_printers', 'model'
    elif etype == 'network':
        t, col = 'cabinet_network_devices', 'model'
    else:
        return f'#{eq_id}'

    row = db.query(
        f'SELECT {col} AS n, device_type FROM {t} WHERE id = ?',
        [eq_id], one=True,
    ) if etype == 'network' else db.query(
        f'SELECT {col} AS n FROM {t} WHERE id = ?',
        [eq_id], one=True,
    )
    if not row:
        return f'#{eq_id}'
    return row['n'] or f'#{eq_id}'


# ============================================================
# СОЗДАНИЕ / ОБНОВЛЕНИЕ / УДАЛЕНИЕ
# ============================================================

@bp.route('/api/inventory/sessions', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_session():
    try:
        data = get_json_safe()
        name = (data.get('name') or '').strip()
        scope_type = (data.get('scope_type') or 'all').strip()

        if not name:
            return jsonify({'success': False, 'error': 'Укажите название'}), 400
        if scope_type not in _SCOPE_TYPES:
            return jsonify({'success': False, 'error': 'Неверный охват'}), 400

        scope_value = (data.get('scope_value') or '').strip()
        if scope_type == 'cabinet' and not scope_value:
            return jsonify({
                'success': False,
                'error': 'Укажите кабинет'
            }), 400

        _clear_cab_cache()
        now = _now()

        with db.transaction(immediate=True) as tx:
            sid = tx.execute('''
                INSERT INTO inventory_sessions
                    (name, description, scope_type, scope_value,
                     responsible_person, status, created_by, created_at, notes)
                VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)
            ''', [
                name,
                (data.get('description') or '').strip(),
                scope_type,
                scope_value,
                (data.get('responsible_person') or '').strip(),
                session.get('user_id'),
                now,
                (data.get('notes') or '').strip(),
            ])

            items = _collect_equipment(scope_type, scope_value)
            for it in items:
                tx.execute('''
                    INSERT INTO inventory_items
                        (session_id, equipment_type, equipment_id,
                         cabinet_id, expected_location, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')
                ''', [
                    sid, it['type'], it['id'],
                    it['cabinet_id'], it['location'],
                ])

        return jsonify({
            'success': True,
            'session_id': sid,
            'items_count': len(items),
            'message': f'Сессия создана ({len(items)} позиций)',
        }), 201
    except Exception as e:
        log.exception('inventory create_session error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/inventory/sessions/<int:sid>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_session(sid):
    try:
        old = db.query(
            'SELECT * FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Не найдено'}), 404

        data = get_json_safe()

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE inventory_sessions SET
                    name = ?, description = ?, responsible_person = ?,
                    notes = ?
                WHERE id = ?
            ''', [
                (data.get('name', old['name']) or '').strip(),
                (data.get('description', old['description']) or '').strip(),
                (data.get('responsible_person',
                          old['responsible_person']) or '').strip(),
                (data.get('notes', old['notes']) or '').strip(),
                sid,
            ])

        return jsonify({'success': True, 'message': 'Сохранено'})
    except Exception as e:
        log.exception('inventory update_session error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/inventory/sessions/<int:sid>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_session(sid):
    try:
        exists = db.query(
            'SELECT id FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not exists:
            return jsonify({'success': False, 'error': 'Не найдено'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM inventory_items WHERE session_id = ?', [sid])
            tx.execute('DELETE FROM inventory_sessions WHERE id = ?', [sid])

        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('inventory delete_session error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# СТАРТ / ЗАВЕРШЕНИЕ
# ============================================================

@bp.route('/api/inventory/sessions/<int:sid>/start', methods=['POST'])
@role_required(*EDITOR_ROLES)
def start_session(sid):
    try:
        s = db.query(
            'SELECT * FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not s:
            return jsonify({'success': False, 'error': 'Не найдено'}), 404
        if s['status'] == 'completed':
            return jsonify({
                'success': False, 'error': 'Сессия уже завершена'
            }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE inventory_sessions
                SET status = 'in_progress',
                    started_at = COALESCE(started_at, ?)
                WHERE id = ?
            ''', [_now(), sid])

        return jsonify({'success': True, 'message': 'Инвентаризация начата'})
    except Exception as e:
        log.exception('inventory start_session error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/inventory/sessions/<int:sid>/finish', methods=['POST'])
@role_required(*EDITOR_ROLES)
def finish_session(sid):
    try:
        s = db.query(
            'SELECT * FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not s:
            return jsonify({'success': False, 'error': 'Не найдено'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE inventory_sessions
                SET status = 'completed', finished_at = ?
                WHERE id = ?
            ''', [_now(), sid])

        return jsonify({'success': True, 'message': 'Инвентаризация завершена'})
    except Exception as e:
        log.exception('inventory finish_session error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ПОЗИЦИИ
# ============================================================

@bp.route('/api/inventory/items/<int:item_id>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_item(item_id):
    try:
        old = db.query(
            'SELECT * FROM inventory_items WHERE id = ?',
            [item_id], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Позиция не найдена'}), 404

        data = get_json_safe()
        new_status = (data.get('status') or old['status']).strip()
        if new_status not in _STATUSES:
            return jsonify({
                'success': False, 'error': 'Недопустимый статус'
            }), 400

        actual_location = (data.get('actual_location',
                                    old['actual_location']) or '').strip()
        notes = (data.get('notes', old['notes']) or '').strip()

        # Если статус поставлен «найден/пропал/перемещён/повреждён/лишний» —
        # фиксируем кто и когда
        checked_by = old['checked_by']
        checked_at = old['checked_at']
        if new_status != 'pending':
            checked_by = session.get('user_id')
            checked_at = _now()

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE inventory_items
                SET status = ?, actual_location = ?, notes = ?,
                    checked_by = ?, checked_at = ?
                WHERE id = ?
            ''', [
                new_status, actual_location, notes,
                checked_by, checked_at, item_id,
            ])

        return jsonify({'success': True, 'message': 'Сохранено'})
    except Exception as e:
        log.exception('inventory update_item error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/inventory/items/<int:item_id>/mark', methods=['POST'])
@role_required(*EDITOR_ROLES)
def mark_item(item_id):
    """Быстрая отметка статуса."""
    try:
        data = get_json_safe()
        new_status = (data.get('status') or '').strip()
        if new_status not in _STATUSES:
            return jsonify({
                'success': False, 'error': 'Недопустимый статус'
            }), 400

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE inventory_items
                SET status = ?, checked_by = ?, checked_at = ?
                WHERE id = ?
            ''', [
                new_status,
                session.get('user_id'),
                _now(),
                item_id,
            ])

        return jsonify({'success': True})
    except Exception as e:
        log.exception('inventory mark_item error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ОТЧЁТ
# ============================================================

@bp.route('/api/inventory/sessions/<int:sid>/report')
@login_required
def session_report(sid):
    try:
        s = db.query(
            'SELECT * FROM inventory_sessions WHERE id = ?',
            [sid], one=True,
        )
        if not s:
            return jsonify({'error': 'Не найдено'}), 404

        rows = db.query('''
            SELECT status, COUNT(*) AS c
            FROM inventory_items
            WHERE session_id = ?
            GROUP BY status
        ''', [sid])

        by_status = {st: 0 for st in _STATUSES}
        for r in rows:
            by_status[r['status']] = r['c']

        total = sum(by_status.values())

        # Список проблемных позиций
        issues = db.query('''
            SELECT * FROM inventory_items
            WHERE session_id = ?
              AND status IN ('missing', 'damaged', 'moved', 'extra')
            ORDER BY status, expected_location
        ''', [sid])

        enriched_issues = []
        for it in issues:
            d = dict(it)
            d['equipment_name'] = _equipment_name(
                d['equipment_type'], d['equipment_id'],
            )
            enriched_issues.append(d)

        return jsonify({
            'session': dict(s),
            'total': total,
            'by_status': by_status,
            'issues': enriched_issues,
        })
    except Exception as e:
        log.exception('inventory session_report error')
        return jsonify({'error': str(e)}), 500