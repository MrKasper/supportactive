# schedules.py
"""
Расписания / повторяющиеся задачи.

CRUD шаблонов + операции «запустить сейчас» и «вкл/выкл».
"""
import json
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from database import Database
from utils import login_required, role_required
from constants import EDITOR_ROLES
from logger import get_logger
from services.schedules import compute_next_run

log = get_logger(__name__)
schedules_bp = Blueprint('schedules', __name__)
db = Database()


ALLOWED_RECURRENCE = {'daily', 'weekly', 'monthly'}


def _now_str():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _serialize(row):
    """Приводит запись из БД к JSON-виду."""
    try:
        config = json.loads(row['recurrence_config'] or '{}')
    except Exception:
        config = {}

    tag_rows = db.query('''
        SELECT t.id, t.name, t.color
        FROM schedule_tags st
        JOIN tags t ON t.id = st.tag_id
        WHERE st.schedule_id = ? AND t.deleted_at IS NULL
        ORDER BY t.name
    ''', [row['id']])

    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'] or '',
        'work_type': row['work_type'] or '',
        'cabinet': row['cabinet'] or '',
        'priority': row['priority'] or 'Средний',
        'from_user': row['from_user'] or '',
        'executor': row['executor'] or '',
        'assistant': row['assistant'] or '',
        'duration_minutes': row['duration_minutes'] or 60,
        'recurrence_type': row['recurrence_type'],
        'recurrence_config': config,
        'next_run_at': row['next_run_at'],
        'last_run_at': row['last_run_at'],
        'is_active': bool(row['is_active']),
        'created_by': row['created_by'],
        'created_at': row['created_at'],
        'tags': [
            {'id': t['id'], 'name': t['name'], 'color': t['color']}
            for t in tag_rows
        ],
    }


def _validate(data, partial=False, old=None):
    """Общая валидация полей. Возвращает (ok, error)."""
    old = old or {}

    name = (data.get('name', old.get('name')) or '').strip()
    if not name:
        return False, 'Укажите название расписания'
    if len(name) > 200:
        return False, 'Название слишком длинное'

    rec_type = (data.get('recurrence_type', old.get('recurrence_type')) or '').strip()
    if rec_type not in ALLOWED_RECURRENCE:
        return False, 'Недопустимый тип повторения'

    config = data.get('recurrence_config', old.get('recurrence_config')) or {}
    if not isinstance(config, dict):
        return False, 'Некорректный формат конфига'

    time_str = str(config.get('time') or '09:00')
    try:
        hh, mm = map(int, time_str.split(':'))
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise ValueError
    except Exception:
        return False, 'Некорректное время (формат HH:MM)'

    if rec_type == 'weekly':
        days = config.get('days') or []
        if not isinstance(days, list) or not days:
            return False, 'Выберите хотя бы один день недели'
        for d in days:
            try:
                if not (0 <= int(d) <= 6):
                    return False, 'День недели вне диапазона'
            except (TypeError, ValueError):
                return False, 'Некорректный день недели'

    if rec_type == 'monthly':
        days = config.get('days') or []
        if not isinstance(days, list) or not days:
            return False, 'Выберите хотя бы один день месяца'
        for d in days:
            try:
                if not (1 <= int(d) <= 31):
                    return False, 'День месяца вне диапазона'
            except (TypeError, ValueError):
                return False, 'Некорректный день месяца'

    return True, None


# ============================================================
# СПИСОК
# ============================================================

@schedules_bp.route('/api/schedules', methods=['GET'])
@login_required
def list_schedules():
    try:
        only_active = request.args.get('only_active') == '1'
        sql = '''
            SELECT * FROM task_schedules
            WHERE deleted_at IS NULL
        '''
        params = []
        if only_active:
            sql += ' AND is_active = 1'
        sql += ' ORDER BY is_active DESC, next_run_at ASC, id DESC'

        rows = db.query(sql, params)
        return jsonify([_serialize(r) for r in rows])
    except Exception as e:
        log.exception('schedules.list error')
        return jsonify({'error': str(e)}), 500


@schedules_bp.route('/api/schedules/<int:sid>', methods=['GET'])
@login_required
def get_schedule(sid):
    try:
        row = db.query(
            'SELECT * FROM task_schedules WHERE id = ? AND deleted_at IS NULL',
            [sid], one=True,
        )
        if not row:
            return jsonify({'error': 'Расписание не найдено'}), 404
        return jsonify(_serialize(row))
    except Exception as e:
        log.exception('schedules.get error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# СОЗДАНИЕ
# ============================================================

@schedules_bp.route('/api/schedules', methods=['POST'])
@role_required(*EDITOR_ROLES)
def create_schedule():
    try:
        data = request.get_json(silent=True) or {}

        ok, err = _validate(data)
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        rec_type = data['recurrence_type']
        config = data.get('recurrence_config') or {}
        next_run = compute_next_run(rec_type, config)

        tag_ids = []
        for x in (data.get('tag_ids') or []):
            try:
                tag_ids.append(int(x))
            except (TypeError, ValueError):
                pass

        now = _now_str()
        with db.transaction(immediate=True) as tx:
            sid = tx.execute('''
                INSERT INTO task_schedules
                    (name, description, work_type, cabinet, priority,
                     from_user, executor, assistant, duration_minutes,
                     recurrence_type, recurrence_config,
                     next_run_at, last_run_at, is_active, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
            ''', [
                (data.get('name') or '').strip(),
                (data.get('description') or '').strip(),
                (data.get('work_type') or '').strip(),
                (data.get('cabinet') or '').strip(),
                (data.get('priority') or 'Средний').strip(),
                (data.get('from_user') or '').strip(),
                (data.get('executor') or '').strip(),
                (data.get('assistant') or '').strip(),
                int(data.get('duration_minutes') or 60),
                rec_type,
                json.dumps(config, ensure_ascii=False),
                next_run.strftime('%Y-%m-%d %H:%M:%S'),
                session.get('user_id'),
                now,
            ])

            for tid in tag_ids:
                valid = tx.query(
                    'SELECT id FROM tags WHERE id = ? AND deleted_at IS NULL',
                    [tid], one=True,
                )
                if not valid:
                    continue
                tx.execute('''
                    INSERT OR IGNORE INTO schedule_tags (schedule_id, tag_id)
                    VALUES (?, ?)
                ''', [sid, tid])

        return jsonify({
            'success': True,
            'schedule_id': sid,
            'next_run_at': next_run.strftime('%Y-%m-%d %H:%M:%S'),
            'message': 'Расписание создано',
        }), 201
    except Exception as e:
        log.exception('schedules.create error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ОБНОВЛЕНИЕ
# ============================================================

@schedules_bp.route('/api/schedules/<int:sid>', methods=['PUT'])
@role_required(*EDITOR_ROLES)
def update_schedule(sid):
    try:
        old = db.query(
            'SELECT * FROM task_schedules WHERE id = ? AND deleted_at IS NULL',
            [sid], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Расписание не найдено'}), 404

        data = request.get_json(silent=True) or {}

        ok, err = _validate(data, old=dict(old))
        if not ok:
            return jsonify({'success': False, 'error': err}), 400

        rec_type = data.get('recurrence_type', old['recurrence_type'])
        try:
            old_config = json.loads(old['recurrence_config'] or '{}')
        except Exception:
            old_config = {}
        config = data.get('recurrence_config', old_config)

        # Пересчитываем next_run_at при изменении типа или конфига
        next_run_str = old['next_run_at']
        if rec_type != old['recurrence_type'] or config != old_config:
            next_run = compute_next_run(rec_type, config)
            next_run_str = next_run.strftime('%Y-%m-%d %H:%M:%S')

        replace_tags = 'tag_ids' in data
        tag_ids = []
        if replace_tags:
            for x in (data.get('tag_ids') or []):
                try:
                    tag_ids.append(int(x))
                except (TypeError, ValueError):
                    pass

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE task_schedules SET
                    name = ?, description = ?, work_type = ?, cabinet = ?,
                    priority = ?, from_user = ?, executor = ?, assistant = ?,
                    duration_minutes = ?, recurrence_type = ?,
                    recurrence_config = ?, next_run_at = ?
                WHERE id = ?
            ''', [
                (data.get('name', old['name']) or '').strip(),
                (data.get('description', old['description']) or '').strip(),
                (data.get('work_type', old['work_type']) or '').strip(),
                (data.get('cabinet', old['cabinet']) or '').strip(),
                (data.get('priority', old['priority']) or 'Средний').strip(),
                (data.get('from_user', old['from_user']) or '').strip(),
                (data.get('executor', old['executor']) or '').strip(),
                (data.get('assistant', old['assistant']) or '').strip(),
                int(data.get('duration_minutes', old['duration_minutes']) or 60),
                rec_type,
                json.dumps(config, ensure_ascii=False),
                next_run_str,
                sid,
            ])

            if replace_tags:
                tx.execute('DELETE FROM schedule_tags WHERE schedule_id = ?', [sid])
                for tid in tag_ids:
                    valid = tx.query(
                        'SELECT id FROM tags WHERE id = ? AND deleted_at IS NULL',
                        [tid], one=True,
                    )
                    if not valid:
                        continue
                    tx.execute('''
                        INSERT OR IGNORE INTO schedule_tags (schedule_id, tag_id)
                        VALUES (?, ?)
                    ''', [sid, tid])

        return jsonify({
            'success': True,
            'next_run_at': next_run_str,
            'message': 'Расписание обновлено',
        })
    except Exception as e:
        log.exception('schedules.update error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# УДАЛЕНИЕ (мягкое)
# ============================================================

@schedules_bp.route('/api/schedules/<int:sid>', methods=['DELETE'])
@role_required(*EDITOR_ROLES)
def delete_schedule(sid):
    try:
        exists = db.query(
            'SELECT id FROM task_schedules WHERE id = ? AND deleted_at IS NULL',
            [sid], one=True,
        )
        if not exists:
            return jsonify({'success': False, 'error': 'Расписание не найдено'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE task_schedules SET deleted_at = ? WHERE id = ?',
                       [_now_str(), sid])

        return jsonify({'success': True, 'message': 'Расписание удалено'})
    except Exception as e:
        log.exception('schedules.delete error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ВКЛ / ВЫКЛ
# ============================================================

@schedules_bp.route('/api/schedules/<int:sid>/toggle', methods=['POST'])
@role_required(*EDITOR_ROLES)
def toggle_schedule(sid):
    try:
        row = db.query(
            'SELECT * FROM task_schedules WHERE id = ? AND deleted_at IS NULL',
            [sid], one=True,
        )
        if not row:
            return jsonify({'success': False, 'error': 'Расписание не найдено'}), 404

        new_state = 0 if row['is_active'] else 1

        update_sql = 'UPDATE task_schedules SET is_active = ?'
        params = [new_state]

        # При включении и отсутствии next_run_at — пересчитываем
        if new_state == 1 and not row['next_run_at']:
            try:
                config = json.loads(row['recurrence_config'] or '{}')
            except Exception:
                config = {}
            next_run = compute_next_run(row['recurrence_type'], config)
            update_sql += ', next_run_at = ?'
            params.append(next_run.strftime('%Y-%m-%d %H:%M:%S'))

        update_sql += ' WHERE id = ?'
        params.append(sid)

        with db.transaction(immediate=True) as tx:
            tx.execute(update_sql, params)

        return jsonify({
            'success': True,
            'is_active': bool(new_state),
            'message': 'Включено' if new_state else 'Отключено',
        })
    except Exception as e:
        log.exception('schedules.toggle error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# ЗАПУСТИТЬ СЕЙЧАС
# ============================================================

@schedules_bp.route('/api/schedules/<int:sid>/run-now', methods=['POST'])
@role_required(*EDITOR_ROLES)
def run_schedule_now(sid):
    """Создать заявку сейчас, не меняя next_run_at."""
    try:
        row = db.query(
            'SELECT * FROM task_schedules WHERE id = ? AND deleted_at IS NULL',
            [sid], one=True,
        )
        if not row:
            return jsonify({'success': False, 'error': 'Расписание не найдено'}), 404

        now = _now_str()
        with db.transaction(immediate=True) as tx:
            task_id = tx.execute('''
                INSERT INTO tasks
                    (deadline, from_user, cabinet, description, work_type,
                     priority, executor, assistant, status, created_by,
                     created_date, duration_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', [
                now,
                row['from_user'] or '',
                row['cabinet'] or '',
                row['description'] or '',
                row['work_type'] or '',
                row['priority'] or 'Средний',
                row['executor'] or '',
                row['assistant'] or '',
                'Новое',
                row['created_by'],
                now,
                row['duration_minutes'] or 60,
            ])

            tag_rows = tx.query(
                'SELECT tag_id FROM schedule_tags WHERE schedule_id = ?',
                [sid],
            )
            for t in tag_rows:
                tx.execute('''
                    INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at)
                    VALUES (?, ?, ?)
                ''', [task_id, t['tag_id'], now])

            tx.execute(
                'UPDATE task_schedules SET last_run_at = ? WHERE id = ?',
                [now, sid],
            )

        return jsonify({
            'success': True,
            'task_id': task_id,
            'message': f'Создана заявка #{task_id}',
        })
    except Exception as e:
        log.exception('schedules.run_now error')
        return jsonify({'success': False, 'error': str(e)}), 500