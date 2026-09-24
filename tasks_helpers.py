# tasks_helpers.py
"""
Общие хелперы для работы с заявками.
"""
from datetime import datetime, timedelta

from database import Database
from extensions import cache
from logger import get_logger
from constants import STATUS_NEW, STATUS_IN_PROGRESS

log = get_logger(__name__)
db = Database()


def invalidate_task_caches():
    """Сбрасывает кеши, зависящие от списка заявок."""
    try:
        cache.delete('filters_data')
    except Exception:
        pass


def check_executor_busy(executor, deadline_str, duration_minutes,
                        exclude_task_id=None):
    """
    Проверяет пересечение интервалов у исполнителя.
    Возвращает (ok, error_msg, conflict_task_id).
    """
    if not executor or not deadline_str:
        return True, None, None

    try:
        new_deadline_str = deadline_str.replace('T', ' ') + ':00'
        new_deadline = datetime.strptime(
            new_deadline_str, '%Y-%m-%d %H:%M:%S'
        )
    except Exception:
        return True, None, None

    sql = '''
        SELECT id, deadline, duration_minutes FROM tasks
        WHERE executor = ?
          AND status IN (?, ?)
          AND deleted_at IS NULL
    '''
    params = [executor, STATUS_NEW, STATUS_IN_PROGRESS]

    if exclude_task_id:
        sql += ' AND id != ?'
        params.append(exclude_task_id)

    existing = db.query(sql, params)

    new_start = new_deadline
    new_end = new_deadline + timedelta(minutes=duration_minutes)

    for t in existing:
        if not t['deadline']:
            continue

        td = None
        for fmt in (
            '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M',
            '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M',
        ):
            try:
                td = datetime.strptime(t['deadline'], fmt)
                break
            except Exception:
                continue

        if not td:
            continue

        existing_duration = int(t['duration_minutes'] or 60)
        existing_start = td
        existing_end = td + timedelta(minutes=existing_duration)

        if new_start < existing_end and existing_start < new_end:
            return (
                False,
                f'Техник занят в это время! Заявка №{t["id"]} '
                f'с {t["deadline"]} на {existing_duration} мин.',
                t['id'],
            )

    return True, None, None