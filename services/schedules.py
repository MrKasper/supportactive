# services/schedules.py
"""
Сервис расписаний: вычисление next_run_at и создание заявок по расписанию.
"""
import json
from datetime import datetime, timedelta

from database import Database
from logger import get_logger

log = get_logger(__name__)
db = Database()


# ============================================================
# ВЫЧИСЛЕНИЕ СЛЕДУЮЩЕГО ЗАПУСКА
# ============================================================

def compute_next_run(recurrence_type, config, from_date=None):
    """
    Возвращает datetime следующего запуска.

    recurrence_type:
      • 'daily'   — config = {"time": "09:00"}
      • 'weekly'  — config = {"time": "09:00", "days": [1,2,3,4,5]}   # 0=Пн
      • 'monthly' — config = {"time": "09:00", "days": [1, 15]}
    """
    now = from_date or datetime.now()
    config = config or {}

    time_str = str(config.get('time') or '09:00')
    try:
        hh, mm = map(int, time_str.split(':'))
    except Exception:
        hh, mm = 9, 0
    hh = max(0, min(23, hh))
    mm = max(0, min(59, mm))

    # ----- daily -----
    if recurrence_type == 'daily':
        candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate

    # ----- weekly -----
    if recurrence_type == 'weekly':
        raw_days = config.get('days') or []
        days = []
        for d in raw_days:
            try:
                di = int(d)
            except (TypeError, ValueError):
                continue
            if 0 <= di <= 6 and di not in days:
                days.append(di)
        if not days:
            days = [0]  # по умолчанию понедельник

        for delta in range(0, 15):
            d = now + timedelta(days=delta)
            if d.weekday() not in days:
                continue
            candidate = d.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if candidate > now:
                return candidate
        return now + timedelta(days=7)

    # ----- monthly -----
    if recurrence_type == 'monthly':
        raw_days = config.get('days') or []
        days = []
        for d in raw_days:
            try:
                di = int(d)
            except (TypeError, ValueError):
                continue
            if 1 <= di <= 31 and di not in days:
                days.append(di)
        if not days:
            days = [1]
        days.sort()

        for add_month in range(0, 24):
            y = now.year
            m = now.month + add_month
            while m > 12:
                m -= 12
                y += 1
            for day in days:
                try:
                    candidate = datetime(y, m, day, hh, mm, 0)
                except ValueError:
                    continue
                if candidate > now:
                    return candidate
        return now + timedelta(days=30)

    # Fallback: завтра
    return now + timedelta(days=1)


# ============================================================
# СОЗДАНИЕ ЗАЯВОК ПО РАСПИСАНИЮ
# ============================================================

def _due_schedules(now):
    return db.query('''
        SELECT * FROM task_schedules
        WHERE is_active = 1
          AND deleted_at IS NULL
          AND next_run_at IS NOT NULL
          AND next_run_at <= ?
        ORDER BY next_run_at
        LIMIT 200
    ''', [now.strftime('%Y-%m-%d %H:%M:%S')])


def run_due_schedules():
    """Создаёт заявки по расписанию, у которых next_run_at <= now."""
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M:%S')
    created = 0
    failed = 0

    for s in _due_schedules(now):
        try:
            with db.transaction(immediate=True) as tx:
                # --- 1. Заявка ---
                task_id = tx.execute('''
                    INSERT INTO tasks
                        (deadline, from_user, cabinet, description, work_type,
                         priority, executor, assistant, status, created_by,
                         created_date, duration_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    now_str,
                    s['from_user'] or '',
                    s['cabinet'] or '',
                    s['description'] or '',
                    s['work_type'] or '',
                    s['priority'] or 'Средний',
                    s['executor'] or '',
                    s['assistant'] or '',
                    'Новое',
                    s['created_by'],
                    now_str,
                    s['duration_minutes'] or 60,
                ])

                # --- 2. Копируем теги ---
                tag_rows = tx.query(
                    'SELECT tag_id FROM schedule_tags WHERE schedule_id = ?',
                    [s['id']],
                )
                for t in tag_rows:
                    tx.execute('''
                        INSERT OR IGNORE INTO task_tags
                            (task_id, tag_id, created_at)
                        VALUES (?, ?, ?)
                    ''', [task_id, t['tag_id'], now_str])

                # --- 3. Считаем следующий запуск ---
                try:
                    config = json.loads(s['recurrence_config'] or '{}')
                except Exception:
                    config = {}

                next_run = compute_next_run(s['recurrence_type'], config, now)
                tx.execute('''
                    UPDATE task_schedules
                    SET last_run_at = ?, next_run_at = ?
                    WHERE id = ?
                ''', [
                    now_str,
                    next_run.strftime('%Y-%m-%d %H:%M:%S'),
                    s['id'],
                ])

            created += 1
            log.info(f'[SCHEDULE] Создана задача #{task_id} из расписания #{s["id"]}')
        except Exception as e:
            failed += 1
            log.exception(f'[SCHEDULE] Ошибка расписания #{s["id"]}: {e}')

    if created or failed:
        log.info(f'[SCHEDULE] Создано: {created}, ошибок: {failed}')

    return created