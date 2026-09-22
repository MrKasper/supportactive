# equipment_computer_components.py
"""
Периферия ПК, мониторы и история замен компонентов.

Работает с полями cabinet_computers:
  • ram        — JSON-массив модулей [{size, type, speed}]
  • storage    — JSON-массив накопителей [{capacity, type}]
  • monitors   — JSON-массив мониторов [{model, inventory_number}]
  • speakers   — JSON-объект {model}
  • webcam     — JSON-объект {model}
  • headphones — JSON-объект {model}
  • microphone — JSON-объект {model}

Все изменения логируются в computer_components_history.

URL эндпоинтов:
  GET  /api/computers/<id>/history
  POST /api/computers/<id>/components/replace
  POST /api/computers/<id>/components/add
  POST /api/computers/<id>/components/remove
"""
import json
from datetime import datetime as _dt

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required
from logger import get_logger
from constants import EDITOR_ROLES

log = get_logger(__name__)
db = Database()

bp = Blueprint('equipment_computer_components', __name__)


# ============================================================
# ХЕЛПЕРЫ
# ============================================================

_COMPONENT_FIELDS = {
    'ram':        'ram',
    'storage':    'storage',
    'monitors':   'monitors',
    'speakers':   'speakers',
    'webcam':     'webcam',
    'headphones': 'headphones',
    'microphone': 'microphone',
}

# Типы, которые хранятся как JSON-массив (можно добавлять/удалять по индексу)
_ARRAY_COMPONENTS = {'ram', 'storage', 'monitors'}


def _now_ts():
    return _dt.now().strftime('%Y-%m-%d %H:%M:%S')


def _safe_json_loads(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _log_component_change(tx, pc_id, component_type, action,
                          old_value, new_value, note=None):
    """Пишет запись в историю замен компонента."""
    tx.execute('''
        INSERT INTO computer_components_history
            (computer_id, component_type, action, old_value, new_value,
             user_id, user_name, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
        pc_id,
        component_type,
        action,
        json.dumps(old_value, ensure_ascii=False) if old_value is not None else None,
        json.dumps(new_value, ensure_ascii=False) if new_value is not None else None,
        session.get('user_id'),
        session.get('user_name', ''),
        note or '',
        _now_ts(),
    ])


def _get_pc_or_404(pc_id):
    return db.query(
        'SELECT * FROM cabinet_computers WHERE id = ?',
        [pc_id], one=True,
    )


# ============================================================
# ИСТОРИЯ ЗАМЕН
# ============================================================

@bp.route('/api/computers/<int:pc_id>/history', methods=['GET'])
@login_required
def computer_history(pc_id):
    """История замен компонентов ПК. ?type=ram|storage|monitors|speakers|..."""
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'error': 'ПК не найден'}), 404

        component_type = (request.args.get('type') or '').strip().lower()

        if component_type:
            if component_type not in _COMPONENT_FIELDS:
                return jsonify({'error': 'Неизвестный тип компонента'}), 400
            rows = db.query('''
                SELECT * FROM computer_components_history
                WHERE computer_id = ? AND component_type = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 200
            ''', [pc_id, component_type])
        else:
            rows = db.query('''
                SELECT * FROM computer_components_history
                WHERE computer_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 300
            ''', [pc_id])

        result = []
        for r in rows:
            d = dict(r)
            for f in ('old_value', 'new_value'):
                if d.get(f):
                    try:
                        d[f] = json.loads(d[f])
                    except Exception:
                        pass
            result.append(d)

        return jsonify({'items': result, 'total': len(result)})
    except Exception as e:
        log.exception('computer_history error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# ЗАМЕНА КОМПОНЕНТА
# ============================================================

@bp.route('/api/computers/<int:pc_id>/components/replace', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_replace(pc_id):
    """
    Заменить компонент ПК.
    Body: { type: 'ram'|'storage'|'monitors'|'speakers'|..., index?: number,
            value: {...}, note?: string }
    """
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _COMPONENT_FIELDS:
            return jsonify({'success': False, 'error': 'Неизвестный тип'}), 400

        new_value = data.get('value')
        if new_value is None:
            return jsonify({'success': False, 'error': 'Нет значения'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            if ctype in _ARRAY_COMPONENTS:
                # RAM / Storage / Monitors — массив
                arr = _safe_json_loads(pc[column], [])
                if not isinstance(arr, list):
                    arr = []

                idx = data.get('index')
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = -1

                if idx < 0 or idx >= len(arr):
                    return jsonify({
                        'success': False,
                        'error': 'Индекс компонента вне диапазона',
                    }), 400

                old_value = arr[idx]
                arr[idx] = new_value

                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, updated_at = ? WHERE id = ?',
                    [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
                )
            else:
                # Периферия — одиночный объект
                old_value = _safe_json_loads(pc[column], None)

                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, updated_at = ? WHERE id = ?',
                    [json.dumps(new_value, ensure_ascii=False), _now_ts(), pc_id],
                )

            _log_component_change(
                tx, pc_id, ctype, 'replace', old_value, new_value, note,
            )

        try:
            from audit import log_action
            log_action('update', 'cabinet_computers', pc_id, {
                'action': 'component_replace',
                'type': ctype,
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Компонент заменён'})
    except Exception as e:
        log.exception('computer_component_replace error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ДОБАВЛЕНИЕ КОМПОНЕНТА
# ============================================================

@bp.route('/api/computers/<int:pc_id>/components/add', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_add(pc_id):
    """
    Добавить RAM/диск/монитор.
    Body: { type: 'ram'|'storage'|'monitors', value: {...}, note? }
    """
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _ARRAY_COMPONENTS:
            return jsonify({'success': False, 'error': 'Неверный тип'}), 400

        new_value = data.get('value')
        if new_value is None:
            return jsonify({'success': False, 'error': 'Нет значения'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            arr = _safe_json_loads(pc[column], [])
            if not isinstance(arr, list):
                arr = []
            arr.append(new_value)

            tx.execute(
                f'UPDATE cabinet_computers SET {column} = ?, updated_at = ? WHERE id = ?',
                [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
            )
            _log_component_change(
                tx, pc_id, ctype, 'add', None, new_value, note,
            )

        return jsonify({'success': True, 'message': 'Компонент добавлен'})
    except Exception as e:
        log.exception('computer_component_add error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ КОМПОНЕНТА
# ============================================================

@bp.route('/api/computers/<int:pc_id>/components/remove', methods=['POST'])
@role_required(*EDITOR_ROLES)
def computer_component_remove(pc_id):
    """
    Удалить компонент.
    Body: { type: 'ram'|'storage'|'monitors'|'speakers'|..., index?: number, note? }
    """
    try:
        pc = _get_pc_or_404(pc_id)
        if not pc:
            return jsonify({'success': False, 'error': 'ПК не найден'}), 404

        data = request.get_json(silent=True) or {}
        ctype = (data.get('type') or '').strip().lower()
        if ctype not in _COMPONENT_FIELDS:
            return jsonify({'success': False, 'error': 'Неверный тип'}), 400

        note = (data.get('note') or '').strip()
        column = _COMPONENT_FIELDS[ctype]

        with db.transaction(immediate=True) as tx:
            if ctype in _ARRAY_COMPONENTS:
                arr = _safe_json_loads(pc[column], [])
                if not isinstance(arr, list):
                    arr = []

                idx = data.get('index')
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = -1

                if idx < 0 or idx >= len(arr):
                    return jsonify({
                        'success': False,
                        'error': 'Индекс вне диапазона',
                    }), 400

                old_value = arr.pop(idx)
                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = ?, updated_at = ? WHERE id = ?',
                    [json.dumps(arr, ensure_ascii=False), _now_ts(), pc_id],
                )
                _log_component_change(
                    tx, pc_id, ctype, 'remove', old_value, None, note,
                )
            else:
                old_value = _safe_json_loads(pc[column], None)
                tx.execute(
                    f'UPDATE cabinet_computers SET {column} = NULL, updated_at = ? WHERE id = ?',
                    [_now_ts(), pc_id],
                )
                _log_component_change(
                    tx, pc_id, ctype, 'remove', old_value, None, note,
                )

        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('computer_component_remove error')
        return jsonify({'success': False, 'error': str(e)}), 500