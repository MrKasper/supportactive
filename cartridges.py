# cartridges.py
from flask import Blueprint, request, jsonify, session
from database import Database
from datetime import datetime
from collections import Counter
from utils import login_required
from extensions import cache
from logger import get_logger

log = get_logger(__name__)

cartridges_bp = Blueprint('cartridges', __name__)
db = Database()

MONTH_NAMES_RU = ['', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
                  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
MONTH_FULL_RU = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']


def _invalidate_cartridges_cache():
    """Сброс кеша статистики картриджей."""
    try:
        cache.delete('cartridges_stats')
    except Exception:
        pass


# ============= СПИСОК =============

@cartridges_bp.route('/api/cartridges')
@login_required
def get_cartridges():
    """
    Получение списка всех записей о замене картриджей.
    Сортировка: сначала с самой свежей заменой.
    """
    try:
        cartridges = db.query('''
            SELECT id, cabinet, full_name, printer, cartridge, 
                   replacement_dates, notes
            FROM cartridges
        ''')

        result = []
        for cart in cartridges:
            cart_dict = dict(cart)

            dates_list = []
            if cart_dict['replacement_dates']:
                dates_list = [d.strip() for d in cart_dict['replacement_dates'].split(',') if d.strip()]

            cart_dict['replacement_dates'] = dates_list

            if dates_list:
                try:
                    cart_dict['latest_date'] = max(dates_list)
                except Exception:
                    cart_dict['latest_date'] = dates_list[-1]
            else:
                cart_dict['latest_date'] = ''

            result.append(cart_dict)

        result.sort(key=lambda x: x['latest_date'] or '0000-00-00 00:00:00', reverse=True)
        return jsonify(result)
    except Exception as e:
        log.exception('Ошибка получения картриджей')
        return jsonify({'error': f'Ошибка получения картриджей: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>')
@login_required
def get_cartridge(cartridge_id):
    try:
        cartridge = db.query('SELECT * FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'error': 'Запись не найдена'}), 404

        cart_dict = dict(cartridge)
        if cart_dict['replacement_dates']:
            cart_dict['replacement_dates'] = [
                d.strip() for d in cart_dict['replacement_dates'].split(',') if d.strip()
            ]
        else:
            cart_dict['replacement_dates'] = []

        return jsonify(cart_dict)
    except Exception as e:
        return jsonify({'error': f'Ошибка получения записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges', methods=['POST'])
@login_required
def create_cartridge():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        cabinet = data.get('cabinet', '').strip()
        full_name = data.get('full_name', '').strip()
        printer = data.get('printer', '').strip()
        cartridge = data.get('cartridge', '').strip()
        replacement_dates = data.get('replacement_dates', [])
        notes = data.get('notes', '').strip()

        if not cabinet:
            return jsonify({'success': False, 'error': 'Укажите кабинет'}), 400
        if not printer:
            return jsonify({'success': False, 'error': 'Укажите модель принтера'}), 400
        if not cartridge:
            return jsonify({'success': False, 'error': 'Укажите модель картриджа'}), 400

        existing = db.query(
            'SELECT id FROM cartridges WHERE cabinet = ? AND printer = ? AND cartridge = ?',
            [cabinet, printer, cartridge], one=True
        )
        if existing:
            return jsonify({
                'success': False,
                'error': 'Запись для этого кабинета с таким принтером и картриджем уже существует.'
            }), 400

        dates_str = ','.join(replacement_dates) if replacement_dates else ''

        with db.transaction(immediate=True) as tx:
            cartridge_id = tx.execute('''
                INSERT INTO cartridges (cabinet, full_name, printer, cartridge, replacement_dates, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', [cabinet, full_name, printer, cartridge, dates_str, notes])

        _invalidate_cartridges_cache()

        return jsonify({
            'success': True,
            'cartridge_id': cartridge_id,
            'message': 'Запись о замене картриджа добавлена'
        }), 201
    except Exception as e:
        log.exception('Ошибка добавления записи картриджа')
        return jsonify({'success': False, 'error': f'Ошибка добавления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>', methods=['PUT'])
@login_required
def update_cartridge(cartridge_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Нет данных'}), 400

        old = db.query('SELECT * FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not old:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        cabinet = data.get('cabinet', old['cabinet']).strip()
        printer = data.get('printer', old['printer']).strip()
        cartridge = data.get('cartridge', old['cartridge']).strip()

        existing = db.query(
            'SELECT id FROM cartridges WHERE cabinet = ? AND printer = ? AND cartridge = ? AND id != ?',
            [cabinet, printer, cartridge, cartridge_id], one=True
        )
        if existing:
            return jsonify({
                'success': False,
                'error': 'Запись для этого кабинета с таким принтером и картриджем уже существует.'
            }), 400

        replacement_dates = data.get('replacement_dates', [])
        dates_str = ','.join(replacement_dates) if replacement_dates else ''

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE cartridges 
                SET cabinet = ?, full_name = ?, printer = ?, cartridge = ?, 
                    replacement_dates = ?, notes = ?
                WHERE id = ?
            ''', [
                cabinet,
                data.get('full_name', old['full_name']),
                printer,
                cartridge,
                dates_str,
                data.get('notes', old['notes']),
                cartridge_id
            ])

        _invalidate_cartridges_cache()

        return jsonify({'success': True, 'message': 'Запись успешно обновлена'})
    except Exception as e:
        log.exception('Ошибка обновления записи картриджа')
        return jsonify({'success': False, 'error': f'Ошибка обновления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>', methods=['DELETE'])
@login_required
def delete_cartridge(cartridge_id):
    try:
        cartridge = db.query('SELECT id FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('DELETE FROM cartridges WHERE id = ?', [cartridge_id])

        _invalidate_cartridges_cache()
        return jsonify({'success': True, 'message': 'Запись успешно удалена'})
    except Exception as e:
        log.exception('Ошибка удаления записи картриджа')
        return jsonify({'success': False, 'error': f'Ошибка удаления записи: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/<int:cartridge_id>/clear-dates', methods=['POST'])
@login_required
def clear_cartridge_dates(cartridge_id):
    try:
        cartridge = db.query('SELECT id FROM cartridges WHERE id = ?', [cartridge_id], one=True)
        if not cartridge:
            return jsonify({'success': False, 'error': 'Запись не найдена'}), 404

        with db.transaction(immediate=True) as tx:
            tx.execute('UPDATE cartridges SET replacement_dates = NULL WHERE id = ?', [cartridge_id])

        _invalidate_cartridges_cache()
        return jsonify({'success': True, 'message': 'Даты замены очищены'})
    except Exception as e:
        log.exception('Ошибка очистки дат')
        return jsonify({'success': False, 'error': f'Ошибка очистки дат: {str(e)}'}), 500


# ============= СТАТИСТИКА =============

@cartridges_bp.route('/api/cartridges/statistics')
@login_required
@cache.cached(timeout=120, key_prefix='cartridges_stats')
def get_cartridge_statistics():
    """
    Общая статистика по заменам картриджей.
    ✅ Оптимизировано: 3 запроса вместо 2+N.
    """
    try:
        # Запрос 1: общее количество записей
        total = db.query('SELECT COUNT(*) as count FROM cartridges', one=True)['count']

        # Запрос 2: все записи с датами и кабинетами
        all_records = db.query('''
            SELECT cabinet, printer, cartridge, replacement_dates
            FROM cartridges
            WHERE replacement_dates IS NOT NULL AND replacement_dates != ''
        ''')

        # Разбор CSV-дат в памяти + группировка по кабинетам
        all_dates = []
        by_cabinet = Counter()
        last_replacements = []

        for r in all_records:
            raw = r['replacement_dates'] or ''
            if not raw:
                continue

            dates = [d.strip() for d in raw.split(',') if d.strip()]
            if not dates:
                continue

            all_dates.extend(dates)

            cab = (r['cabinet'] or '').strip()
            if cab:
                by_cabinet[cab] += len(dates)

            for d in dates:
                last_replacements.append({
                    'cabinet': cab,
                    'printer': r['printer'] or '',
                    'cartridge': r['cartridge'] or '',
                    'replacement_date': d
                })

        total_replacements = len(all_dates)

        # Подсчёт по месяцам и годам из уже собранного списка
        now = datetime.now()
        current_month = now.strftime('%Y-%m')
        current_year = now.strftime('%Y')

        month_replacements = sum(1 for d in all_dates if d.startswith(current_month))
        year_replacements = sum(1 for d in all_dates if d.startswith(current_year))

        # Сортировка кабинетов по количеству замен
        cabinet_stats = sorted(
            [{'cabinet': cab, 'replacements': cnt} for cab, cnt in by_cabinet.items()],
            key=lambda x: x['replacements'],
            reverse=True
        )

        # Последние 10 замен
        last_replacements.sort(key=lambda x: x['replacement_date'], reverse=True)
        last_replacements = last_replacements[:10]

        # Запрос 3: статистика по принтерам и картриджам (одним заходом через GROUP BY)
        printer_stats = db.query('''
            SELECT printer, COUNT(*) as count
            FROM cartridges
            WHERE printer != ''
            GROUP BY printer
            ORDER BY count DESC
        ''')

        cartridge_stats = db.query('''
            SELECT cartridge, COUNT(*) as count
            FROM cartridges
            WHERE cartridge != ''
            GROUP BY cartridge
            ORDER BY count DESC
        ''')

        return jsonify({
            'total': total,
            'total_replacements': total_replacements,
            'month_replacements': month_replacements,
            'year_replacements': year_replacements,
            'cabinet_stats': cabinet_stats,
            'printer_stats': [dict(s) for s in printer_stats],
            'cartridge_stats': [dict(s) for s in cartridge_stats],
            'last_replacements': last_replacements
        })
    except Exception as e:
        log.exception('Ошибка получения статистики картриджей')
        return jsonify({'error': f'Ошибка получения статистики: {str(e)}'}), 500


@cartridges_bp.route('/api/cartridges/statistics/monthly')
@login_required
@cache.cached(timeout=120, key_prefix='cartridges_monthly_stats')
def get_cartridge_monthly_stats():
    """
    Помесячная статистика за последние 12 месяцев + по годам.
    """
    try:
        # Один запрос — все даты
        all_records = db.query('''
            SELECT replacement_dates FROM cartridges
            WHERE replacement_dates IS NOT NULL AND replacement_dates != ''
        ''')

        all_dates = []
        for r in all_records:
            if r['replacement_dates']:
                all_dates.extend([d.strip() for d in r['replacement_dates'].split(',') if d.strip()])

        month_counter = Counter()
        year_counter = Counter()
        for d in all_dates:
            if len(d) >= 7:
                month_counter[d[:7]] += 1
                year_counter[d[:4]] += 1

        now = datetime.now()
        months_series = []
        year = now.year
        month = now.month
        sequence = []
        for _ in range(12):
            sequence.append((year, month))
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        sequence.reverse()

        for (y, m) in sequence:
            key = f'{y:04d}-{m:02d}'
            months_series.append({
                'month': key,
                'month_name': MONTH_NAMES_RU[m],
                'month_full': MONTH_FULL_RU[m],
                'year': y,
                'count': month_counter.get(key, 0)
            })

        years_series = []
        for y in sorted(year_counter.keys(), reverse=True):
            years_series.append({'year': y, 'count': year_counter[y]})

        max_month = max((m['count'] for m in months_series), default=0)

        return jsonify({
            'months': months_series,
            'years': years_series,
            'max_month': max_month,
            'total_all_time': len(all_dates)
        })
    except Exception as e:
        log.exception('Ошибка помесячной статистики')
        return jsonify({'error': f'Ошибка получения помесячной статистики: {str(e)}'}), 500