# services/cartridge_sync.py
"""
Синхронизация замен картриджей с таблицей `cartridges`
(модуль «Картриджи»).

При замене картриджа через карточку принтера в модуле «Управление кабинетами»
нужно добавить запись в общую таблицу замен — иначе данные рассинхронизируются.

Логика:
  1. Ищем запись по (cabinet, printer, cartridge) — добавляем дату в
     `replacement_dates`.
  2. Если нет — создаём новую запись.
"""
from logger import get_logger

log = get_logger(__name__)


def append_replacement_date(dates_str, new_date):
    """Добавляет дату к CSV-строке replacement_dates."""
    dates_str = (dates_str or '').strip()
    if not dates_str:
        return new_date
    parts = [d.strip() for d in dates_str.split(',') if d.strip()]
    parts.append(new_date)
    return ','.join(parts)


def sync_cartridge_replacement(tx, cabinet_number, printer_model,
                                new_cartridge, responsible, now):
    """
    Синхронизирует замену картриджа с таблицей `cartridges`.

    Параметры:
        tx              — объект транзакции (db.transaction)
        cabinet_number  — номер кабинета (строка)
        printer_model   — модель принтера (строка)
        new_cartridge   — новая модель картриджа
        responsible     — ФИО ответственного (для новой записи)
        now             — timestamp в формате 'YYYY-MM-DD HH:MM:SS'

    Возвращает dict с описанием результата:
        {'action': 'updated_dates', 'id': N}  — обновили существующую
        {'action': 'created', 'id': N}        — создали новую
        {'action': 'skipped', 'reason': ...}  — нечего синхронизировать
    """
    if not cabinet_number or not printer_model:
        return {'action': 'skipped', 'reason': 'no_cabinet_or_printer'}

    cabinet_number = cabinet_number.strip()
    printer_model = printer_model.strip()
    new_cartridge = (new_cartridge or '').strip()

    # 1. Точное совпадение cabinet + printer + cartridge
    existing = tx.query('''
        SELECT id, replacement_dates FROM cartridges
        WHERE cabinet = ? AND printer = ? AND cartridge = ?
        ORDER BY id DESC LIMIT 1
    ''', [cabinet_number, printer_model, new_cartridge], one=True)

    if existing:
        new_dates = append_replacement_date(
            existing['replacement_dates'], now
        )
        tx.execute(
            'UPDATE cartridges SET replacement_dates = ? WHERE id = ?',
            [new_dates, existing['id']],
        )
        return {'action': 'updated_dates', 'id': existing['id']}

    # 2. Новая запись
    new_id = tx.execute('''
        INSERT INTO cartridges
            (cabinet, full_name, printer, cartridge,
             replacement_dates, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', [
        cabinet_number,
        responsible or '',
        printer_model,
        new_cartridge,
        now,
        'Создано автоматически при замене картриджа',
    ])
    return {'action': 'created', 'id': new_id}


def invalidate_cartridges_cache():
    """
    Сброс кеша статистики картриджей, чтобы UI обновился сразу.
    Ничего не делает, если кеш недоступен.
    """
    try:
        from extensions import cache
        cache.delete('cartridges_stats')
        cache.delete('cartridges_monthly_stats')
    except Exception as e:
        log.debug(f'invalidate_cartridges_cache: {e}')