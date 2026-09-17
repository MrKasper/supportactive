#!/usr/bin/env python
"""
Отдельный worker для пинга ПК.
Запускается как отдельный процесс (systemd / Docker service / cron).
"""
import os
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# .env.example
try:
    from dotenv import load_dotenv
    env_path = os.path.join(BASE_DIR, '.env.example')
    if os.path.exists(env_path):
        load_dotenv(env_path, override=True)
except ImportError:
    pass

# Логирование
from logger import setup_logging, get_logger
setup_logging()
log = get_logger('ping_worker')

# Сервис
from services.ping import ping_all_computers, PING_INTERVAL_SEC


def main():
    log.info('=' * 60)
    log.info('Support Active — Ping Worker')
    log.info(f'Интервал: {PING_INTERVAL_SEC} сек')
    log.info('=' * 60)

    # Небольшая задержка при старте — чтобы приложение поднялось первым
    time.sleep(15)

    while True:
        try:
            log.info('[PING] Запуск автопроверки...')
            result = ping_all_computers()
            log.info(f'[PING] Результат: {result}')
        except KeyboardInterrupt:
            log.info('[PING] Остановлен пользователем')
            break
        except Exception as e:
            log.exception(f'[PING] Ошибка: {e}')

        time.sleep(PING_INTERVAL_SEC)


if __name__ == '__main__':
    main()