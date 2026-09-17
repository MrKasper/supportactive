# services/ping.py
"""
Сервис пинга ПК: реальный ICMP-пинг, обновление статистики, фоновый планировщик.
"""
import os
import re
import time
import platform
import subprocess
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from database import Database
from logger import get_logger

log = get_logger(__name__)
db = Database()

# ---------- Настройки ----------
PING_INTERVAL_SEC = int(os.environ.get('PING_INTERVAL_SEC', 300))
PING_TIMEOUT_SEC = int(os.environ.get('PING_TIMEOUT_SEC', 2))
PING_MAX_WORKERS = int(os.environ.get('PING_MAX_WORKERS', 10))

# ---------- Состояние планировщика ----------
_scheduler_started = False
_scheduler_lock = threading.Lock()


def _now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def _ping_host(ip, timeout_sec=PING_TIMEOUT_SEC):
    """
    Реальный ping через системную команду.
    Возвращает 'online' / 'offline'.
    """
    if not ip:
        return 'offline'
    ip = str(ip).strip()
    if not ip:
        return 'offline'

    # Разрешаем hostname или IPv4
    if not re.match(r'^[a-zA-Z0-9\.\-]{1,253}$', ip):
        return 'offline'

    is_windows = platform.system().lower() == 'windows'

    try:
        if is_windows:
            cmd = ['ping', '-n', '1', '-w', str(int(timeout_sec * 1000)), ip]
        else:
            cmd = ['ping', '-c', '1', '-W', str(int(timeout_sec)), ip]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout_sec + 2,
        )
        return 'online' if result.returncode == 0 else 'offline'
    except subprocess.TimeoutExpired:
        return 'offline'
    except FileNotFoundError:
        log.error('Команда ping не найдена в системе')
        return 'offline'
    except Exception as e:
        log.warning(f'Ошибка ping {ip}: {e}')
        return 'offline'


def ping_one_computer(pc):
    """
    Пингует один ПК и обновляет статистику в БД.
    Возвращает {'id': ..., 'ip': ..., 'status': 'online'|'offline'} или None.
    """
    pc_id = pc['id']
    ip = (pc['ip_address'] or '').strip()
    if not ip:
        return None

    status = _ping_host(ip)
    now = _now()

    try:
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cabinet_computers
                SET status = ?,
                    ping_count = COALESCE(ping_count, 0) + 1,
                    ping_success_count = COALESCE(ping_success_count, 0) +
                                          CASE WHEN ? = 'online' THEN 1 ELSE 0 END,
                    last_ping_at = ?,
                    last_ping_status = ?,
                    updated_at = ?
                WHERE id = ?
            ''', [status, status, now, status, now, pc_id])
        return {'id': pc_id, 'ip': ip, 'status': status}
    except Exception as e:
        log.exception(f'Ошибка обновления статуса ПК #{pc_id}: {e}')
        return None


def ping_all_computers():
    """Пингует все ПК с указанным IP. Возвращает статистику."""
    try:
        pcs = db.query('''
            SELECT id, ip_address FROM cabinet_computers
            WHERE ip_address IS NOT NULL AND ip_address != ''
        ''')
        pcs_with_ip = [dict(p) for p in pcs]

        if not pcs_with_ip:
            return {'total': 0, 'online': 0, 'offline': 0, 'skipped': 0}

        online = 0
        offline = 0

        with ThreadPoolExecutor(max_workers=PING_MAX_WORKERS) as executor:
            futures = {executor.submit(ping_one_computer, pc): pc for pc in pcs_with_ip}
            for fut in as_completed(futures):
                result = fut.result()
                if result:
                    if result['status'] == 'online':
                        online += 1
                    else:
                        offline += 1

        log.info(f'[PING] Проверено: {online + offline}, online: {online}, offline: {offline}')
        return {'total': online + offline, 'online': online, 'offline': offline, 'skipped': 0}
    except Exception as e:
        log.exception(f'Ошибка ping_all_computers: {e}')
        return {'total': 0, 'online': 0, 'offline': 0, 'skipped': 0}


def _should_run_ping():
    """Защита от двойного запуска при multi-worker."""
    try:
        row = db.query(
            'SELECT MAX(last_ping_at) AS last FROM cabinet_computers',
            one=True,
        )
        if not row or not row['last']:
            return True
        try:
            last = datetime.strptime(row['last'], '%Y-%m-%d %H:%M:%S')
        except Exception:
            return True
        elapsed = (datetime.now() - last).total_seconds()
        return elapsed >= (PING_INTERVAL_SEC - 30)
    except Exception as e:
        log.warning(f'_should_run_ping error: {e}')
        return True


def _scheduler_loop():
    log.info(f'[PING] Планировщик запущен. Интервал: {PING_INTERVAL_SEC} сек')
    time.sleep(30)
    while True:
        try:
            if _should_run_ping():
                log.info('[PING] Запуск автоматической проверки...')
                ping_all_computers()
            else:
                log.debug('[PING] Пропуск — недавно проверяли')
        except Exception as e:
            log.exception(f'[PING] Ошибка в цикле: {e}')
        time.sleep(PING_INTERVAL_SEC)


def start_ping_scheduler():
    """Запускает фоновый поток авто-пинга (единожды)."""
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            log.info('[PING] Планировщик уже запущен')
            return
        _scheduler_started = True

    if os.environ.get('WERKZEUG_RUN_MAIN') == 'false':
        log.info('[PING] Flask reloader — не запускаем в родительском процессе')
        return

    t = threading.Thread(target=_scheduler_loop, daemon=True, name='ping-scheduler')
    t.start()
    log.info('[PING] Фоновый поток планировщика запущен')