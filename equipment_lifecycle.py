# equipment_lifecycle.py
"""
Жизненный цикл оборудования: метаданные + история событий.

Работает с тремя типами:
  • computer — cabinet_computers
  • printer  — cabinet_printers
  • network  — cabinet_network_devices
"""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required, get_json_safe
from constants import EDITOR_ROLES
from logger import get_logger

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_lifecycle', __name__)

# type → (table, label)
_TYPES = {
    'computer': ('cabinet_computers', 'Компьютер'),
    'printer':  ('cabinet_printers',  'Принтер'),
    'network':  ('cabinet_network_devices', 'Сетевое устройство'),
}

_LIFE_STATUSES = ('active', 'repair', 'reserve', 'decommissioned')
_EVENT_TYPES = (
    'purchase', 'commission', 'repair', 'return_to_service',
    'move', 'decommission', 'other',
)

_LIFECYCLE_FIELDS = (
    'purchase_date', 'warranty_until', 'commissioned_at',
    'decommissioned_at', 'life_status', 'supplier',
    'cost', 'serial_number',
)


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

def _resolve_type(t):
    if t not in _TYPES:
        return None, None
    return _TYPES[t]


def _get_eq_or_404(etype, eq_id):
    info = _resolve_type(etype)
    if not info:
        return None, (jsonify({'error': 'Неизвестный тип оборудования'}), 400)
    table, label = info
    row = db.query(
        f'SELECT * FROM {table} WHERE id = ?',
        [eq_id], one=True,
    )
    if not row:
        return None, (jsonify({'error': f'{label} не найден'}), 404)
    return dict(row), None


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _norm(value):
    """Пустые строки → None."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _to_float(v):
    if v in (None, ''):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _coerce_payload(data):
    """Приводит данные к типам, валидирует life_status."""
    out = {}
    for f in _LIFECYCLE_FIELDS:
        if f not in data:
            continue
        if f == 'cost':
            out[f] = _to_float(data.get(f))
        else:
            out[f] = _norm(data.get(f))

    if 'life_status' in out and out['life_status'] not in _LIFE_STATUSES:
        out['life_status'] = 'active'

    return out


# ============================================================
# CRUD МЕТАДАННЫХ
# ============================================================

@bp.route('/api/equipment/<etype>/<int:eq_id>/lifecycle', methods=['GET'])
@login_required
def get_lifecycle(etype, eq_id):
    try:
        eq, err = _get_eq_or_404(etype, eq_id)
        if err:
            return err

        # Метаданные берём из самой записи оборудования
        meta = {f: eq.get(f) for f in _LIFECYCLE_FIELDS}

        # Последние события
        events = db.query('''
            SELECT * FROM equipment_lifecycle_events
            WHERE equipment_type = ? AND equipment_id = ?
            ORDER BY event_date DESC, id DESC
            LIMIT 100
        ''', [etype, eq_id])

        # Считаем остаток гарантии (в днях)
        warranty_days_left = None
        if meta.get('warranty_until'):
            try:
                wd = datetime.strptime(meta['warranty_until'][:10], '%Y-%m-%d')
                warranty_days_left = (wd - datetime.now()).days
            except Exception:
                pass

        return jsonify({
            'equipment_type': etype,
            'equipment_id': eq_id,
            'equipment_name': eq.get('name') or eq.get('model') or
                              eq.get('device_type') or f'#{eq_id}',
            'meta': meta,
            'events': [dict(e) for e in events],
            'warranty_days_left': warranty_days_left,
        })
    except Exception as e:
        log.exception('lifecycle get error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/equipment/<etype>/<int:eq_id>/lifecycle', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_lifecycle(etype, eq_id):
    try:
        eq, err = _get_eq_or_404(etype, eq_id)
        if err:
            return err

        data = get_json_safe()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        patch = _coerce_payload(data)
        if not patch:
            return jsonify({
                'success': False, 'error': 'Нет полей для обновления'
            }), 400

        info = _resolve_type(etype)
        table = info[0]

        set_parts = [f'{k} = ?' for k in patch.keys()]
        params = list(patch.values())

        # Автологика: при списании — фиксируем дату
        if (patch.get('life_status') == 'decommissioned'
                and 'decommissioned_at' not in patch
                and not eq.get('decommissioned_at')):
            set_parts.append('decommissioned_at = ?')
            params.append(_now())
        # При возврате в строй — снимаем дату списания
        if (patch.get('life_status') == 'active'
                and eq.get('life_status') == 'decommissioned'):
            set_parts.append('decommissioned_at = ?')
            params.append(None)

        params.append(eq_id)

        with db.transaction(immediate=True) as tx:
            tx.execute(
                f'UPDATE {table} SET {", ".join(set_parts)} WHERE id = ?',
                params,
            )

            # Событие «изменение статуса» — если статус изменился
            old_status = eq.get('life_status') or 'active'
            new_status = patch.get('life_status')
            if new_status and new_status != old_status:
                etype_map = {
                    'active': 'return_to_service',
                    'repair': 'repair',
                    'decommissioned': 'decommission',
                    'reserve': 'other',
                }
                tx.execute('''
                    INSERT INTO equipment_lifecycle_events
                        (equipment_type, equipment_id, cabinet_id,
                         event_type, event_date, old_status, new_status,
                         description, user_id, user_name, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    etype, eq_id, eq.get('cabinet_id'),
                    etype_map.get(new_status, 'other'),
                    _now(), old_status, new_status,
                    f'Статус изменён: {old_status} → {new_status}',
                    session.get('user_id'), session.get('user_name', ''),
                    _now(),
                ])

        try:
            from audit import log_action
            log_action('update', f'equipment_lifecycle:{etype}', eq_id, {
                'changes': list(patch.keys()),
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Сохранено'})
    except Exception as e:
        log.exception('lifecycle update error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# СОБЫТИЯ
# ============================================================

@bp.route('/api/equipment/<etype>/<int:eq_id>/events', methods=['POST'])
@role_required(*EDITOR_ROLES)
def add_event(etype, eq_id):
    try:
        eq, err = _get_eq_or_404(etype, eq_id)
        if err:
            return err

        data = get_json_safe()
        event_type = (data.get('event_type') or '').strip()
        if event_type not in _EVENT_TYPES:
            return jsonify({
                'success': False, 'error': 'Недопустимый тип события'
            }), 400

        event_date = _norm(data.get('event_date')) or _now()
        description = _norm(data.get('description'))
        new_status = _norm(data.get('new_status'))

        if new_status and new_status not in _LIFE_STATUSES:
            new_status = None

        old_status = eq.get('life_status') or 'active'

        info = _resolve_type(etype)
        table = info[0]

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO equipment_lifecycle_events
                    (equipment_type, equipment_id, cabinet_id,
                     event_type, event_date, old_status, new_status,
                     description, user_id, user_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                etype, eq_id, eq.get('cabinet_id'),
                event_type, event_date, old_status, new_status,
                description, session.get('user_id'),
                session.get('user_name', ''), _now(),
            ])

            # Если new_status передан — обновляем у оборудования
            if new_status and new_status != old_status:
                tx.execute(
                    f'UPDATE {table} SET life_status = ? WHERE id = ?',
                    [new_status, eq_id],
                )

        try:
            from audit import log_action
            log_action('create', f'equipment_event:{etype}', eq_id, {
                'event_type': event_type,
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Событие добавлено'}), 201
    except Exception as e:
        log.exception('lifecycle add_event error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/equipment/events/<int:event_id>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_event(event_id):
    try:
        row = db.query(
            'SELECT * FROM equipment_lifecycle_events WHERE id = ?',
            [event_id], one=True,
        )
        if not row:
            return jsonify({'success': False, 'error': 'Событие не найдено'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'DELETE FROM equipment_lifecycle_events WHERE id = ?',
                [event_id],
            )

        try:
            from audit import log_action
            log_action('delete', 'equipment_event', event_id, {
                'equipment_type': row['equipment_type'],
                'equipment_id': row['equipment_id'],
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('lifecycle delete_event error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# СВОДКИ
# ============================================================

@bp.route('/api/equipment/lifecycle/stats')
@login_required
def lifecycle_stats():
    """
    Статистика по трём таблицам:
      • по статусам (active / repair / reserve / decommissioned)
      • истекающие гарантии (в ближайшие 30/90 дней)
      • ближайшие события (последние 20)
    """
    try:
        statuses = {'active': 0, 'repair': 0, 'reserve': 0, 'decommissioned': 0}
        total = 0

        for t, table in _TYPES.items():
            rows = db.query(f'''
                SELECT COALESCE(life_status, 'active') AS s,
                       COUNT(*) AS c
                FROM {table}
                GROUP BY s
            ''')
            for r in rows:
                statuses[r['s']] = statuses.get(r['s'], 0) + r['c']
                total += r['c']

        # Истекающие гарантии
        today = datetime.now().strftime('%Y-%m-%d')
        in_30 = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
        in_90 = (datetime.now() + timedelta(days=90)).strftime('%Y-%m-%d')

        expiring_30 = []
        expiring_90 = []

        for etype, (table, label) in _TYPES.items():
            rows = db.query(f'''
                SELECT id, cabinet_id, warranty_until
                FROM {table}
                WHERE warranty_until IS NOT NULL
                  AND warranty_until != ''
                  AND warranty_until >= ?
                  AND warranty_until <= ?
            ''', [today, in_90])

            for r in rows:
                name_col = 'name'
                info_cols = db.query(
                    f'SELECT * FROM {table} WHERE id = ?',
                    [r['id']], one=True,
                )
                if not info_cols:
                    continue
                d = dict(info_cols)
                item = {
                    'equipment_type': etype,
                    'equipment_id': r['id'],
                    'cabinet_id': r['cabinet_id'],
                    'label': label,
                    'name': d.get('name') or d.get('model') or
                            d.get('device_type') or f'#{r["id"]}',
                    'warranty_until': r['warranty_until'],
                }
                if r['warranty_until'] <= in_30:
                    expiring_30.append(item)
                expiring_90.append(item)

        # Последние события (глобально)
        recent = db.query('''
            SELECT * FROM equipment_lifecycle_events
            ORDER BY event_date DESC, id DESC
            LIMIT 20
        ''')

        return jsonify({
            'total': total,
            'statuses': statuses,
            'expiring_30': expiring_30,
            'expiring_90': expiring_90,
            'recent_events': [dict(e) for e in recent],
        })
    except Exception as e:
        log.exception('lifecycle_stats error')
        return jsonify({'error': str(e)}), 500