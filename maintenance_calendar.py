# maintenance_calendar.py
"""
Календарь обслуживания оборудования.

CRUD планов ТО + просмотр календаря + ручной запуск.
Автоматический запуск — через services/maintenance.py в ping_worker.py.
"""
import json
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required, get_json_safe
from constants import EDITOR_ROLES
from logger import get_logger
from services.maintenance import compute_next_run_maintenance

log = get_logger(__name__)
db = Database()

bp = Blueprint('maintenance_calendar', __name__)

ALLOWED_RECURRENCE = {'daily', 'weekly', 'monthly', 'quarterly', 'yearly'}


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _serialize(row):
    try:
        cfg = json.loads(row['recurrence_config'] or '{}')
    except Exception:
        cfg = {}

    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'] or '',
        'equipment_type': row['equipment_type'] or '',
        'equipment_id': row['equipment_id'],
        'cabinet_id': row['cabinet_id'],
        'work_type': row['work_type'] or '',
        'priority': row['priority'] or 'Средний',
        'duration_minutes': row['duration_minutes'] or 60,
        'executor': row['executor'] or '',
        'from_user': row['from_user'] or '',
        'recurrence_type': row['recurrence_type'],
        'recurrence_config': cfg,
        'next_run_at': row['next_run_at'],
        'last_run_at': row['last_run_at'],
        'last_task_id': row['last_task_id'],
        'is_active': bool(row['is_active']),
        'created_at': row['created_at'],
    }


def _validate(data, old=None):
    old = old or {}

    name = (data.get('name', old.get('name')) or '').strip()
    if not name:
        return False, 'Укажите название'
    if len(name) > 200:
        return False, 'Слишком длинное название'

    rec_type = (data.get('recurrence_type', old.get('recurrence_type')) or '').strip()
    if rec_type not in ALLOWED_RECURRENCE:
        return False, 'Недопустимый тип повторения'

    cfg = data.get('recurrence_config', old.get('recurrence_config')) or {}
    if not isinstance(cfg, dict):
        return False, 'Некорректный конфиг повторения'

    time_str = str(cfg.get('time') or '09:00')
    try:
        hh, mm = map(int, time_str.split(':'))
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise ValueError
    except Exception:
        return False, 'Некорректное время (HH:MM)'

    if rec_type == 'weekly':
        days = cfg.get('days') or []
        if not isinstance(days, list) or not days:
            return False, 'Выберите хотя бы один день недели'
        for d in days:
            try:
                if not (0 <= int(d) <= 6):
                    return False, 'День недели вне диапазона'
            except (TypeError, ValueError):
                return False, 'Некорректный день недели'

    if rec_type == 'monthly':
        days = cfg.get('days') or []
        if not isinstance(days, list) or not days:
            return False, 'Выберите хотя бы одно число месяца'
        for d in days:
            try:
                if not (1 <= int(d) <= 31):
                    return False, 'Число месяца вне диапазона'
            except (TypeError, ValueError):
                return False, 'Некорректное число месяца'

    return True, None


# ============================================================
# СПИСОК
# ============================================================

@bp.route('/api/maintenance', methods=['GET'])
@login_required
def list_plans():
    try:
        only_active = request.args.get('only_active') == '1'
        sql = 'SELECT * FROM maintenance_plans WHERE deleted_at IS NULL'
        params = []
        if only_active:
            sql += ' AND is_active = 1'
        sql += ' ORDER BY is_active DESC, next_run_at ASC, id DESC'
        rows = db.query(sql, params)
        return jsonify([_serialize(r) for r in rows])
    except Exception as e:
        log.exception('maintenance list error')
        return jsonify({'error': str(e)}), 500


@bp.route('/api/maintenance/<int:pid>', methods=['GET'])
@login_required
def get_plan(pid):
    try:
        row = db.query(
            'SELECT * FROM maintenance_plans '
            'WHERE id = ? AND deleted_at IS NULL',
            [pid], one=True,
        )
        if not row:
            return jsonify({'error': 'План не найден'}), 404
        return jsonify(_serialize(row))
    except Exception as e:
        log.exception('maintenance get error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СОЗДАНИЕ / ОБНОВЛЕНИЕ
# ============================================================

@bp.route('/api/maintenance', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_plan():
    try:
        data = get_json_safe()
        ok, err = _validate(data)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        rec_type = data['recurrence_type']
        cfg = data.get('recurrence_config') or {}
        next_run = compute_next_run_maintenance(rec_type, cfg)

        now = _now()
        with db.transaction(immediate=True) as tx:
            pid = tx.execute('''
                INSERT INTO maintenance_plans
                    (name, description, equipment_type, equipment_id,
                     cabinet_id, work_type, priority, duration_minutes,
                     executor, from_user, recurrence_type, recurrence_config,
                     next_run_at, is_active, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ''', [
                (data.get('name') or '').strip(),
                (data.get('description') or '').strip(),
                (data.get('equipment_type') or '').strip(),
                data.get('equipment_id') or None,
                data.get('cabinet_id') or None,
                (data.get('work_type') or '').strip(),
                (data.get('priority') or 'Средний').strip(),
                int(data.get('duration_minutes') or 60),
                (data.get('executor') or '').strip(),
                (data.get('from_user') or '').strip(),
                rec_type,
                json.dumps(cfg, ensure_ascii=False),
                next_run.strftime('%Y-%m-%d %H:%M:%S'),
                session.get('user_id'),
                now,
            ])

        return jsonify({
            'success': True,
            'plan_id': pid,
            'next_run_at': next_run.strftime('%Y-%m-%d %H:%M:%S'),
            'message': 'План создан',
        }), 201
    except Exception as e:
        log.exception('maintenance create error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/maintenance/<int:pid>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_plan(pid):
    try:
        old = db.query(
            'SELECT * FROM maintenance_plans '
            'WHERE id = ? AND deleted_at IS NULL',
            [pid], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'План не найден'}), 404

        data = get_json_safe()
        ok, err = _validate(data, old=dict(old))
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        rec_type = data.get('recurrence_type', old['recurrence_type'])
        try:
            old_cfg = json.loads(old['recurrence_config'] or '{}')
        except Exception:
            old_cfg = {}
        cfg = data.get('recurrence_config', old_cfg)

        next_run_str = old['next_run_at']
        if rec_type != old['recurrence_type'] or cfg != old_cfg:
            next_run = compute_next_run_maintenance(rec_type, cfg)
            next_run_str = next_run.strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE maintenance_plans SET
                    name = ?, description = ?, equipment_type = ?,
                    equipment_id = ?, cabinet_id = ?, work_type = ?,
                    priority = ?, duration_minutes = ?, executor = ?,
                    from_user = ?, recurrence_type = ?,
                    recurrence_config = ?, next_run_at = ?
                WHERE id = ?
            ''', [
                (data.get('name', old['name']) or '').strip(),
                (data.get('description', old['description']) or '').strip(),
                (data.get('equipment_type', old['equipment_type']) or '').strip(),
                data.get('equipment_id', old['equipment_id']),
                data.get('cabinet_id', old['cabinet_id']),
                (data.get('work_type', old['work_type']) or '').strip(),
                (data.get('priority', old['priority']) or 'Средний').strip(),
                int(data.get('duration_minutes', old['duration_minutes']) or 60),
                (data.get('executor', old['executor']) or '').strip(),
                (data.get('from_user', old['from_user']) or '').strip(),
                rec_type,
                json.dumps(cfg, ensure_ascii=False),
                next_run_str,
                pid,
            ])

        return jsonify({
            'success': True,
            'next_run_at': next_run_str,
            'message': 'Сохранено',
        })
    except Exception as e:
        log.exception('maintenance update error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ / ВКЛ-ВЫКЛ
# ============================================================

@bp.route('/api/maintenance/<int:pid>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_plan(pid):
    try:
        exists = db.query(
            'SELECT id FROM maintenance_plans '
            'WHERE id = ? AND deleted_at IS NULL',
            [pid], one=True,
        )
        if not exists:
            return jsonify({'success': False, 'error': 'План не найден'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE maintenance_plans SET deleted_at = ? WHERE id = ?',
                [_now(), pid],
            )
        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('maintenance delete error')
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/maintenance/<int:pid>/toggle', methods=['POST'])
@role_required(*EDITOR_ROLES)
def toggle_plan(pid):
    try:
        row = db.query(
            'SELECT * FROM maintenance_plans '
            'WHERE id = ? AND deleted_at IS NULL',
            [pid], one=True,
        )
        if not row:
            return jsonify({'success': False, 'error': 'План не найден'}), 404

        new_state = 0 if row['is_active'] else 1
        sql = 'UPDATE maintenance_plans SET is_active = ?'
        params = [new_state]

        if new_state == 1 and not row['next_run_at']:
            try:
                cfg = json.loads(row['recurrence_config'] or '{}')
            except Exception:
                cfg = {}
            nxt = compute_next_run_maintenance(row['recurrence_type'], cfg)
            sql += ', next_run_at = ?'
            params.append(nxt.strftime('%Y-%m-%d %H:%M:%S'))

        sql += ' WHERE id = ?'
        params.append(pid)

        with db.transaction(immediate=True) as tx:
            tx.execute(sql, params)

        return jsonify({
            'success': True,
            'is_active': bool(new_state),
            'message': 'Включено' if new_state else 'Отключено',
        })
    except Exception as e:
        log.exception('maintenance toggle error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ЗАПУСТИТЬ СЕЙЧАС
# ============================================================

@bp.route('/api/maintenance/<int:pid>/run-now', methods=['POST'])
@role_required(*EDITOR_ROLES)
def run_now(pid):
    try:
        row = db.query(
            'SELECT * FROM maintenance_plans '
            'WHERE id = ? AND deleted_at IS NULL',
            [pid], one=True,
        )
        if not row:
            return jsonify({'success': False, 'error': 'План не найден'}), 404

        now_str = _now()
        description = row['description'] or row['name']

        with db.transaction(immediate=True) as tx:
            task_id = tx.execute('''
                INSERT INTO tasks
                    (deadline, from_user, cabinet, description, work_type,
                     priority, executor, assistant, status, created_by,
                     created_date, duration_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                now_str,
                row['from_user'] or '',
                '',  # cabinet — строка, может быть позже
                f'[ТО] {description}',
                row['work_type'] or 'Обслуживание',
                row['priority'] or 'Средний',
                row['executor'] or '',
                '',
                'Новое',
                row['created_by'],
                now_str,
                row['duration_minutes'] or 60,
            ])

            tx.execute(
                'UPDATE maintenance_plans SET last_run_at = ?, '
                'last_task_id = ? WHERE id = ?',
                [now_str, task_id, pid],
            )

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': f'Создана заявка #{task_id}',
        })
    except Exception as e:
        log.exception('maintenance run_now error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# КАЛЕНДАРЬ
# ============================================================

@bp.route('/api/maintenance/calendar', methods=['GET'])
@login_required
def calendar_view():
    """
    ?from=YYYY-MM-DD&to=YYYY-MM-DD
    Возвращает события:
      • planned   — предстоящие next_run_at из активных планов
      • finished  — last_run_at для каждого плана
      • tasks     — созданные заявки (last_task_id) в диапазоне
    """
    try:
        date_from = request.args.get('from') or datetime.now().strftime('%Y-%m-%d')
        date_to = request.args.get('to') or (
            datetime.now() + timedelta(days=90)
        ).strftime('%Y-%m-%d')

        plans = db.query('''
            SELECT * FROM maintenance_plans
            WHERE deleted_at IS NULL
            ORDER BY next_run_at ASC
        ''')

        planned = []
        for p in plans:
            if not p['next_run_at']:
                continue
            day = p['next_run_at'][:10]
            if day < date_from or day > date_to:
                continue
            planned.append({
                'plan_id': p['id'],
                'name': p['name'],
                'date': day,
                'datetime': p['next_run_at'],
                'priority': p['priority'],
                'equipment_type': p['equipment_type'],
                'equipment_id': p['equipment_id'],
                'cabinet_id': p['cabinet_id'],
                'is_active': bool(p['is_active']),
            })

        # Созданные заявки за период (по last_task_id)
        task_rows = []
        task_ids = [p['last_task_id'] for p in plans if p['last_task_id']]
        if task_ids:
            placeholders = ','.join('?' * len(task_ids))
            task_rows = db.query(f'''
                SELECT id, description, status, created_date, deadline,
                       executor, priority
                FROM tasks
                WHERE id IN ({placeholders})
                  AND deleted_at IS NULL
                  AND created_date >= ?
                  AND created_date <= ?
                ORDER BY created_date DESC
            ''', task_ids + [date_from + ' 00:00:00',
                             date_to + ' 23:59:59'])

        return jsonify({
            'from': date_from,
            'to': date_to,
            'planned': planned,
            'tasks': [dict(t) for t in task_rows],
        })
    except Exception as e:
        log.exception('maintenance calendar error')
        return jsonify({'error': str(e)}), 500