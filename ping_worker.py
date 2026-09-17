#!/usr/bin/env python
"""
Support Active — отдельный worker для пинга ПК.

Запускается как отдельный процесс (systemd / Docker / cron),
чтобы не дублировать фоновые задачи в каждом воркере gunicorn.

Использование:
    python ping_worker.py

Переменные окружения (.env):
    DISABLE_PING_SCHEDULER=true   ← обязательно для основного приложения
    PING_INTERVAL_SEC=300          ← интервал между проверками

Дополнительно worker:
    • Раз в сутки чистит старые уведомления (>60 дней)
    • Раз в сутки чистит старые login_attempts (>1 дня)
"""
import os
import sys
import time
from datetime import datetime

# ============================================================
# Пути и ENV
# ============================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

try:
    from dotenv import load_dotenv
    env_path = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path, override=True)
except ImportError:
    pass


# ============================================================
# Логирование
# ============================================================
from logger import setup_logging, get_logger
setup_logging()
log = get_logger('ping_worker')


# ============================================================
# Сервисы
# ============================================================
from services.ping import ping_all_computers, PING_INTERVAL_SEC
from database import Database

db = Database()


# ============================================================
# CLEANUP — раз в сутки
# ============================================================
CLEANUP_INTERVAL_SEC = 24 * 60 * 60  # раз в 24 часа
_last_cleanup_at = None


def _run_cleanup():
    """
    Раз в сутки:
      • Удаляет уведомления старше 60 дней
      • Удаляет login_attempts старше 1 дня (истёкшие блокировки)
      • Удаляет пустые/старые записи из task_history (опционально)
    """
    global _last_cleanup_at

    now = datetime.now()
    if _last_cleanup_at is not None:
        elapsed = (now - _last_cleanup_at).total_seconds()
        if elapsed < CLEANUP_INTERVAL_SEC:
            return
    _last_cleanup_at = now

    log.info('[CLEANUP] Запуск ежедневной очистки...')

    # 1. Уведомления старше 60 дней
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute("""
                DELETE FROM notifications
                WHERE created_date < datetime('now', '-60 days')
            """)
        log.info('[CLEANUP] Старые уведомления (>60 дней) удалены')
    except Exception as e:
        log.warning(f'[CLEANUP] Ошибка удаления уведомлений: {e}')

    # 2. Login attempts — истёкшие блокировки
    try:
        with db.transaction(immediate=True) as tx:
            tx.execute("""
                DELETE FROM login_attempts
                WHERE blocked_until IS NOT NULL
                  AND blocked_until < datetime('now', '-1 day')
            """)
        log.info('[CLEANUP] Старые login_attempts (>1 дня) удалены')
    except Exception as e:
        log.warning(f'[CLEANUP] Ошибка удаления login_attempts: {e}')

    # 3. Пустые сессии (если используется filesystem) — опционально
    # (не трогаем, чтобы не мешать работающим сессиям)

    log.info('[CLEANUP] Ежедневная очистка завершена')


# ============================================================
# ГЛАВНЫЙ ЦИКЛ
# ============================================================
def main():
    log.info('=' * 60)
    log.info('Support Active — Ping Worker')
    log.info(f'Интервал пинга: {PING_INTERVAL_SEC} сек')
    log.info(f'Очистка: раз в {CLEANUP_INTERVAL_SEC // 3600} ч')
    log.info('=' * 60)

    # Небольшая задержка — чтобы основное приложение поднялось первым
    log.info('Ожидание 15 секунд перед первым запуском...')
    time.sleep(15)

    while True:
        # ---------- Пинг всех ПК ----------
        try:
            log.info('[PING] Запуск автопроверки...')
            result = ping_all_computers()
            log.info(
                f'[PING] Результат: '
                f'total={result["total"]}, '
                f'online={result["online"]}, '
                f'offline={result["offline"]}'
            )
        except KeyboardInterrupt:
            log.info('[PING] Остановлен пользователем (Ctrl+C)')
            break
        except Exception as e:
            log.exception(f'[PING] Ошибка: {e}')

        # ---------- Очистка (раз в сутки) ----------
        try:
            _run_cleanup()
        except Exception as e:
            log.exception(f'[CLEANUP] Ошибка: {e}')

        # ---------- Ожидание ----------
        try:
            time.sleep(PING_INTERVAL_SEC)
        except KeyboardInterrupt:
            log.info('[PING] Остановлен пользователем (Ctrl+C)')
            break

    log.info('Ping worker остановлен')


# ============================================================
# ТОЧКА ВХОДА
# ============================================================
if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log.info('Прервано пользователем')
        sys.exit(0)
    except Exception as e:
        log.exception('Критическая ошибка ping_worker')
        sys.exit(1)