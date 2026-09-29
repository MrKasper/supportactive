# services/maintenance.py
"""
Сервис обслуживания: вычисление next_run и создание заявок по плану.
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

def compute_next_run_maintenance(recurrence_type, config, from_date=None):
    """
    Расширенная версия compute_next_run для ТО:
      daily / weekly / monthly / quarterly / yearly.

    Для quarterly / yearly используется start_date из config.
    Если её нет — берём сегодня.
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

    def _apply_time(d):
        return d.replace(hour=hh, minute=mm, second=0, microsecond=0)

    # ---------- daily ----------
    if recurrence_type == 'daily':
        c = _apply_time(now)
        if c <= now:
            c += timedelta(days=1)
        return c

    # ---------- weekly ----------
    if recurrence_type == 'weekly':
        days = []
        for d in (config.get('days') or []):
            try:
                di = int(d)
                if 0 <= di <= 6 and di not in days:
                    days.append(di)
            except (TypeError, ValueError):
                continue
        if not days:
            days = [0]

        for delta in range(0, 15):
            d = now + timedelta(days=delta)
            if d.weekday() not in days:
                continue
            c = _apply_time(d)
            if c > now:
                return c
        return now + timedelta(days=7)

    # ---------- monthly ----------
    if recurrence_type == 'monthly':
        days = []
        for d in (config.get('days') or []):
            try:
                di = int(d)
                if 1 <= di <= 31 and di not in days:
                    days.append(di)
            except (TypeError, ValueError):
                continue
        if not days:
            days = [1]
        days.sort()

        for add in range(0, 24):
            y, m = now.year, now.month + add
            while m > 12:
                m -= 12
                y += 1
            for day in days:
                try:
                    c = datetime(y, m, day, hh, mm, 0)
                except ValueError:
                    continue
                if c > now:
                    return c
        return now + timedelta(days=30)

    # ---------- quarterly / yearly ----------
    if recurrence_type in ('quarterly', 'yearly'):
        step_months = 3 if recurrence_type == 'quarterly' else 12

        start_str = config.get('start_date')
        base = now
        if start_str:
            try:
                base = datetime.strptime(start_str[:10], '%Y-%m-%d')
            except Exception:
                base = now

        # Найти ближайшую дату > now с шагом step_months, начиная от base
        candidate = _apply_time(base)
        for _ in range(0, 50):
            if candidate > now:
                return candidate
            # + шаг месяцев
            y, m = candidate.year, candidate.month + step_months
            while m > 12:
                m -= 12
                y += 1
            try:
                candidate = datetime(y, m, candidate.day, hh, mm, 0)
            except ValueError:
                # Например, 31 февраля → переносим на 1-е
                candidate = datetime(y, m, 1, hh, mm, 0)
        return now + timedelta(days=90)

    return now + timedelta(days=1)


# ============================================================
# ЗАПУСК DUE-ПЛАНОВ
# ============================================================

def run_due_maintenance():
    """Создаёт заявки по планам ТО, у которых next_run_at <= now."""
    now = datetime.now()
    now_str = now.strftime('%Y-%m-%d %H:%M:%S')
    created = 0
    failed = 0

    rows = db.query('''
        SELECT * FROM maintenance_plans
        WHERE is_active = 1
          AND deleted_at IS NULL
          AND next_run_at IS NOT NULL
          AND next_run_at <= ?
        ORDER BY next_run_at
        LIMIT 200
    ''', [now_str])

    for p in rows:
        try:
            with db.transaction(immediate=True) as tx:
                description = p['description'] or p['name']
                task_id = tx.execute('''
                    INSERT INTO tasks
                        (deadline, from_user, cabinet, description, work_type,
                         priority, executor, assistant, status, created_by,
                         created_date, duration_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    now_str,
                    p['from_user'] or '',
                    '',
                    f'[ТО] {description}',
                    p['work_type'] or 'Обслуживание',
                    p['priority'] or 'Средний',
                    p['executor'] or '',
                    '',
                    'Новое',
                    p['created_by'],
                    now_str,
                    p['duration_minutes'] or 60,
                ])

                try:
                    cfg = json.loads(p['recurrence_config'] or '{}')
                except Exception:
                    cfg = {}

                next_run = compute_next_run_maintenance(
                    p['recurrence_type'], cfg, now,
                )

                tx.execute('''
                    UPDATE maintenance_plans
                    SET last_run_at = ?, last_task_id = ?, next_run_at = ?
                    WHERE id = ?
                ''', [
                    now_str, task_id,
                    next_run.strftime('%Y-%m-%d %H:%M:%S'),
                    p['id'],
                ])

            created += 1
            log.info(
                f'[MAINTENANCE] Заявка #{task_id} по плану #{p["id"]}'
            )
        except Exception as e:
            failed += 1
            log.exception(f'[MAINTENANCE] Ошибка плана #{p["id"]}: {e}')

    if created or failed:
        log.info(
            f'[MAINTENANCE] Создано: {created}, ошибок: {failed}'
        )
    return created