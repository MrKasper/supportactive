# reports_builder.py
"""
Конструктор отчётов.

Даёт API:
  • GET  /api/reports/fields           — справочник полей и метрик
  • POST /api/reports/run              — выполнить отчёт по конфигу
  • POST /api/reports/export           — выгрузить в XLSX
  • GET  /api/reports/templates        — список шаблонов
  • POST /api/reports/templates        — сохранить шаблон
  • PUT  /api/reports/templates/<id>   — обновить шаблон
  • DELETE /api/reports/templates/<id> — удалить (soft)
"""
import io
import json
from datetime import datetime

from flask import Blueprint, jsonify, request, session, send_file

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from database import Database
from utils import login_required, role_required
from constants import ROLE_ADMIN, ROLE_TECH, ROLE_DEVELOPER
from logger import get_logger

log = get_logger(__name__)
db = Database()

reports_builder_bp = Blueprint('reports_builder', __name__)

REPORT_ROLES = (ROLE_ADMIN, ROLE_TECH, ROLE_DEVELOPER)


# ============================================================
# СПРАВОЧНИК ПОЛЕЙ И МЕТРИК
# ============================================================

_FIELDS = [
    {'key': 'id',             'label': '№',                    'type': 'int',  'groupable': False},
    {'key': 'created_date',   'label': 'Дата создания',        'type': 'date', 'groupable': True},
    {'key': 'deadline',       'label': 'Срок',                 'type': 'date', 'groupable': True},
    {'key': 'completed_date', 'label': 'Дата выполнения',      'type': 'date', 'groupable': True},
    {'key': 'from_user',      'label': 'От кого',              'type': 'str',  'groupable': True},
    {'key': 'cabinet',        'label': 'Кабинет',              'type': 'str',  'groupable': True},
    {'key': 'description',    'label': 'Описание',             'type': 'text', 'groupable': False},
    {'key': 'work_type',      'label': 'Тип работы',           'type': 'str',  'groupable': True},
    {'key': 'status',         'label': 'Статус',               'type': 'str',  'groupable': True},
    {'key': 'priority',       'label': 'Приоритет',            'type': 'str',  'groupable': True},
    {'key': 'executor',       'label': 'Исполнитель',          'type': 'str',  'groupable': True},
    {'key': 'assistant',      'label': 'Помощник',             'type': 'str',  'groupable': True},
    {'key': 'duration_minutes', 'label': 'Длительность, мин',  'type': 'int',  'groupable': False},
]

_FIELDS_BY_KEY = {f['key']: f for f in _FIELDS}

_METRICS = [
    {
        'key': 'count',
        'label': 'Количество',
        'sql': 'COUNT(*)',
    },
    {
        'key': 'avg_duration',
        'label': 'Ср. длительность, мин',
        'sql': 'ROUND(AVG(duration_minutes), 1)',
    },
    {
        'key': 'avg_close_hours',
        'label': 'Ср. время закрытия, ч',
        'sql': (
            "ROUND(AVG(CASE WHEN completed_date IS NOT NULL "
            "AND created_date IS NOT NULL "
            "THEN (julianday(completed_date) - julianday(created_date)) * 24 "
            "ELSE NULL END), 1)"
        ),
    },
    {
        'key': 'overdue_count',
        'label': 'Просрочено',
        'sql': (
            "SUM(CASE WHEN status NOT IN ('Выполнено','Отменено') "
            "AND deadline IS NOT NULL AND deadline < datetime('now') "
            "THEN 1 ELSE 0 END)"
        ),
    },
    {
        'key': 'completed_count',
        'label': 'Выполнено',
        'sql': "SUM(CASE WHEN status = 'Выполнено' THEN 1 ELSE 0 END)",
    },
]

_METRICS_BY_KEY = {m['key']: m for m in _METRICS}


# ============================================================
# СБОРКА SQL
# ============================================================

_ALLOWED_SORT_FIELDS = {f['key'] for f in _FIELDS}
_ALLOWED_OPERATORS = {'=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'}


def _build_where(filters):
    """
    Возвращает (where_sql, params).
    filters — dict с ключами:
      date_field, date_from, date_to,
      status (list), priority (list), work_type (str),
      executor (str), cabinet (str), from_user (str),
      tags (list of ids), search (str),
      user_role (str — для ограничений по ролям),
      user_name (str)
    """
    where = 'WHERE t.deleted_at IS NULL'
    params = []

    date_field = filters.get('date_field') or 'created_date'
    if date_field not in ('created_date', 'deadline', 'completed_date'):
        date_field = 'created_date'

    date_from = (filters.get('date_from') or '').strip()
    date_to = (filters.get('date_to') or '').strip()
    if date_from:
        where += f' AND date(t.{date_field}) >= date(?)'
        params.append(date_from[:10])
    if date_to:
        where += f' AND date(t.{date_field}) <= date(?)'
        params.append(date_to[:10])

    status = filters.get('status') or []
    if isinstance(status, str):
        status = [status] if status else []
    status = [s for s in status if s]
    if status:
        ph = ','.join('?' * len(status))
        where += f' AND t.status IN ({ph})'
        params.extend(status)

    priority = filters.get('priority') or []
    if isinstance(priority, str):
        priority = [priority] if priority else []
    priority = [p for p in priority if p]
    if priority:
        ph = ','.join('?' * len(priority))
        where += f' AND t.priority IN ({ph})'
        params.extend(priority)

    work_type = (filters.get('work_type') or '').strip()
    if work_type:
        where += ' AND t.work_type = ?'
        params.append(work_type)

    executor = (filters.get('executor') or '').strip()
    if executor:
        where += ' AND t.executor = ?'
        params.append(executor)

    cabinet = (filters.get('cabinet') or '').strip()
    if cabinet:
        where += ' AND t.cabinet LIKE ?'
        params.append(f'%{cabinet}%')

    from_user = (filters.get('from_user') or '').strip()
    if from_user:
        where += ' AND t.from_user LIKE ?'
        params.append(f'%{from_user}%')

    search = (filters.get('search') or '').strip()
    if search:
        s = f'%{search}%'
        where += ' AND (t.description LIKE ? OR t.from_user LIKE ? OR t.cabinet LIKE ?)'
        params.extend([s, s, s])

    tags = filters.get('tags') or []
    if isinstance(tags, str):
        tags = [tags]
    tag_ids = []
    for x in tags:
        try:
            tag_ids.append(int(x))
        except (TypeError, ValueError):
            pass
    if tag_ids:
        ph = ','.join('?' * len(tag_ids))
        where += (
            f' AND t.id IN (SELECT task_id FROM task_tags '
            f'WHERE tag_id IN ({ph}))'
        )
        params.extend(tag_ids)

    # Ограничение по роли
    user_role = (filters.get('user_role') or '').strip()
    user_name = (filters.get('user_name') or '').strip()
    if user_role == ROLE_TECH and user_name:
        where += (
            " AND (t.executor = ? "
            "OR (t.status = 'Новое' AND (t.executor IS NULL OR t.executor = '')))"
        )
        params.append(user_name)

    return where, params


def _build_select(config):
    """
    Возвращает (select_sql, headers, is_grouped).
    headers — список dict: {key, label, type}
    """
    fields = config.get('fields') or []
    fields = [f for f in fields if f in _FIELDS_BY_KEY]
    if not fields:
        fields = ['id', 'created_date', 'cabinet', 'description', 'status', 'executor']

    group_by = config.get('group_by') or []
    group_by = [g for g in group_by if g in _FIELDS_BY_KEY and _FIELDS_BY_KEY[g]['groupable']]

    metrics = config.get('metrics') or []
    metrics = [m for m in metrics if m in _METRICS_BY_KEY]

    is_grouped = bool(group_by) or bool(metrics)

    if is_grouped:
        select_parts = []
        headers = []

        # Сначала — поля группировки
        for g in group_by:
            info = _FIELDS_BY_KEY[g]
            select_parts.append(f't.{g} AS g_{g}')
            headers.append({'key': f'g_{g}', 'label': info['label'], 'type': info['type']})

        # Если group_by пусто, но есть метрики — просто метрики по всему набору
        if not group_by:
            pass

        # Затем — метрики
        for m in metrics:
            info = _METRICS_BY_KEY[m]
            select_parts.append(f'{info["sql"]} AS m_{m}')
            headers.append({'key': f'm_{m}', 'label': info['label'], 'type': 'metric'})

        # Если вообще ничего не выбрано
        if not select_parts:
            select_parts.append('COUNT(*) AS m_count')
            headers.append({'key': 'm_count', 'label': 'Количество', 'type': 'metric'})

        sql = 'SELECT ' + ', '.join(select_parts) + ' FROM tasks t'
        return sql, headers, is_grouped, group_by
    else:
        # Без группировки — просто строки
        select_parts = [f't.{f} AS {f}' for f in fields]
        headers = [
            {'key': f, 'label': _FIELDS_BY_KEY[f]['label'], 'type': _FIELDS_BY_KEY[f]['type']}
            for f in fields
        ]
        sql = 'SELECT ' + ', '.join(select_parts) + ' FROM tasks t'
        return sql, headers, is_grouped, group_by


def _build_order(config, is_grouped, group_by):
    sort = config.get('sort') or {}
    by = (sort.get('by') or '').strip()
    order = (sort.get('order') or 'DESC').upper()
    if order not in ('ASC', 'DESC'):
        order = 'DESC'

    if is_grouped:
        # Сортируем по первой метрике (обычно count) убыв. или по первой группе
        metrics = config.get('metrics') or []
        if metrics and metrics[0] in _METRICS_BY_KEY:
            return f'ORDER BY m_{metrics[0]} {order}'
        if group_by:
            return f'ORDER BY g_{group_by[0]} ASC'
        return ''

    if by not in _ALLOWED_SORT_FIELDS:
        by = 'created_date'
    return f'ORDER BY t.{by} {order}'


# ============================================================
# ВЫПОЛНЕНИЕ ОТЧЁТА
# ============================================================

def _run_report(config):
    fields = config.get('fields') or []
    filters = config.get('filters') or {}
    limit = config.get('limit') or 1000
    try:
        limit = max(1, min(int(limit), 10000))
    except (TypeError, ValueError):
        limit = 1000

    select_sql, headers, is_grouped, group_by = _build_select(config)
    where_sql, where_params = _build_where(filters)
    order_sql = _build_order(config, is_grouped, group_by)

    if is_grouped and group_by:
        group_sql = 'GROUP BY ' + ', '.join(f't.{g}' for g in group_by)
    else:
        group_sql = ''

    full_sql = f'{select_sql} {where_sql} {group_sql} {order_sql} LIMIT ?'
    params = list(where_params) + [limit]

    log.info(f'[REPORT] SQL: {full_sql[:300]}')
    log.info(f'[REPORT] params: {params}')

    rows = db.query(full_sql, params)

    data = []
    for r in rows:
        d = dict(r)
        row = {}
        for h in headers:
            key = h['key']
            row[key] = d.get(key)
        data.append(row)

    return {
        'headers': headers,
        'rows': data,
        'is_grouped': is_grouped,
        'total': len(data),
        'truncated': len(data) >= limit,
    }


# ============================================================
# API: СПРАВОЧНИК
# ============================================================

@reports_builder_bp.route('/api/reports/fields')
@role_required(*REPORT_ROLES)
def reports_fields():
    """Справочник полей, метрик и фильтров."""
    try:
        # Значения для фильтров — из справочников
        statuses = ['Новое', 'В работе', 'Выполнено', 'Отменено']
        priorities = ['Высокий', 'Средний', 'Низкий']

        work_types = [r['name'] for r in db.query(
            'SELECT name FROM problem_types WHERE is_active = 1 ORDER BY name'
        )]
        cabinets = [r['cabinet_number'] for r in db.query(
            'SELECT cabinet_number FROM cabinets WHERE is_active = 1 '
            'ORDER BY cabinet_number'
        )]
        executors = [r['full_name'] for r in db.query(
            "SELECT full_name FROM users WHERE is_active = 1 "
            "AND deleted_at IS NULL "
            "AND role IN ('Администратор', 'Техник') "
            "ORDER BY full_name"
        )]
        tags = [{'id': r['id'], 'name': r['name'], 'color': r['color']}
                for r in db.query(
                    'SELECT id, name, color FROM tags '
                    'WHERE deleted_at IS NULL ORDER BY name'
                )]

        return jsonify({
            'fields': _FIELDS,
            'metrics': [{'key': m['key'], 'label': m['label']} for m in _METRICS],
            'filters': {
                'statuses': statuses,
                'priorities': priorities,
                'work_types': work_types,
                'cabinets': cabinets,
                'executors': executors,
                'tags': tags,
                'date_fields': [
                    {'key': 'created_date', 'label': 'Дата создания'},
                    {'key': 'deadline', 'label': 'Срок'},
                    {'key': 'completed_date', 'label': 'Дата выполнения'},
                ],
            },
        })
    except Exception as e:
        log.exception('reports_fields error')
        return jsonify({'error': str(e)}), 500


# ============================================================
# API: RUN
# ============================================================

@reports_builder_bp.route('/api/reports/run', methods=['POST'])
@role_required(*REPORT_ROLES)
def reports_run():
    try:
        config = request.get_json(silent=True) or {}
        if not config:
            return jsonify({'success': False, 'error': 'Нет конфига'}), 400

        # Ограничения по роли — Техник видит только свои + новые без исполнителя
        role = session.get('user_role')
        name = session.get('user_name')
        filters = config.get('filters') or {}
        filters['user_role'] = role
        filters['user_name'] = name
        config['filters'] = filters

        result = _run_report(config)
        return jsonify({'success': True, **result})
    except Exception as e:
        log.exception('reports_run error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# API: EXPORT XLSX
# ============================================================

_HEADER_FILL = PatternFill('solid', fgColor='4E73DF')
_HEADER_FONT = Font(bold=True, color='FFFFFF', size=12)
_HEADER_ALIGN = Alignment(horizontal='center', vertical='center', wrap_text=True)
_CELL_ALIGN = Alignment(horizontal='left', vertical='center', wrap_text=True)
_BORDER_THIN = Side(border_style='thin', color='D0D0D0')
_BORDER = Border(left=_BORDER_THIN, right=_BORDER_THIN,
                 top=_BORDER_THIN, bottom=_BORDER_THIN)


@reports_builder_bp.route('/api/reports/export', methods=['POST'])
@role_required(*REPORT_ROLES)
def reports_export():
    try:
        config = request.get_json(silent=True) or {}
        if not config:
            return jsonify({'success': False, 'error': 'Нет конфига'}), 400

        role = session.get('user_role')
        name = session.get('user_name')
        filters = config.get('filters') or {}
        filters['user_role'] = role
        filters['user_name'] = name
        config['filters'] = filters

        result = _run_report(config)
        headers = result['headers']
        rows = result['rows']

        wb = Workbook()
        ws = wb.active
        ws.title = 'Отчёт'

        # Заголовок
        for col, h in enumerate(headers, start=1):
            c = ws.cell(row=1, column=col, value=h['label'])
            c.fill = _HEADER_FILL
            c.font = _HEADER_FONT
            c.alignment = _HEADER_ALIGN
            c.border = _BORDER
        ws.row_dimensions[1].height = 30
        ws.freeze_panes = 'A2'

        # Данные
        for i, row in enumerate(rows, start=2):
            for col, h in enumerate(headers, start=1):
                v = row.get(h['key'])
                if v is None:
                    v = ''
                c = ws.cell(row=i, column=col, value=v)
                c.alignment = _CELL_ALIGN
                c.border = _BORDER

        # Автоширина
        for col_idx, h in enumerate(headers, start=1):
            letter = get_column_letter(col_idx)
            max_len = len(h['label'])
            for row in rows[:200]:
                v = row.get(h['key'])
                if v is None:
                    continue
                length = len(str(v))
                if length > max_len:
                    max_len = length
            ws.column_dimensions[letter].width = min(max_len + 3, 60)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        return send_file(
            output,
            mimetype=(
                'application/vnd.openxmlformats-officedocument'
                '.spreadsheetml.sheet'
            ),
            as_attachment=True,
            download_name=f'report_{ts}.xlsx',
        )
    except Exception as e:
        log.exception('reports_export error')
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================================
# API: ШАБЛОНЫ
# ============================================================

def _serialize_template(row):
    try:
        cfg = json.loads(row['config'] or '{}')
    except Exception:
        cfg = {}
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'] or '',
        'config': cfg,
        'created_by': row['created_by'],
        'created_at': row['created_at'],
        'is_shared': bool(row['is_shared']),
    }


@reports_builder_bp.route('/api/reports/templates')
@role_required(*REPORT_ROLES)
def reports_templates_list():
    try:
        user_id = session.get('user_id')
        is_admin = session.get('user_role') == ROLE_ADMIN

        if is_admin:
            rows = db.query('''
                SELECT * FROM report_templates
                WHERE deleted_at IS NULL
                ORDER BY is_shared DESC, created_at DESC
            ''')
        else:
            rows = db.query('''
                SELECT * FROM report_templates
                WHERE deleted_at IS NULL
                  AND (created_by = ? OR is_shared = 1)
                ORDER BY is_shared DESC, created_at DESC
            ''', [user_id])

        return jsonify([_serialize_template(r) for r in rows])
    except Exception as e:
        log.exception('reports_templates_list error')
        return jsonify({'error': str(e)}), 500


@reports_builder_bp.route('/api/reports/templates', methods=['POST'])
@role_required(*REPORT_ROLES)
def reports_templates_create():
    try:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название'}), 400

        config = data.get('config')
        if not isinstance(config, dict):
            return jsonify({'success': False, 'error': 'Некорректный config'}), 400

        is_shared = 1 if data.get('is_shared') else 0
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        with db.transaction(immediate=True) as tx:
            tid = tx.execute('''
                INSERT INTO report_templates
                    (name, description, config, created_by, created_at, is_shared)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', [
                name,
                (data.get('description') or '').strip(),
                json.dumps(config, ensure_ascii=False),
                session.get('user_id'),
                now,
                is_shared,
            ])

        return jsonify({
            'success': True,
            'template_id': tid,
            'message': 'Шаблон сохранён',
        }), 201
    except Exception as e:
        log.exception('reports_templates_create error')
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_builder_bp.route('/api/reports/templates/<int:tid>', methods=['PUT'])
@role_required(*REPORT_ROLES)
def reports_templates_update(tid):
    try:
        old = db.query(
            'SELECT * FROM report_templates WHERE id = ? AND deleted_at IS NULL',
            [tid], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        # Редактировать может автор или админ
        is_admin = session.get('user_role') == ROLE_ADMIN
        if old['created_by'] != session.get('user_id') and not is_admin:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        data = request.get_json(silent=True) or {}
        name = (data.get('name') or old['name'] or '').strip()
        if not name:
            return jsonify({'success': False, 'error': 'Укажите название'}), 400

        config = data.get('config', None)
        if config is not None and not isinstance(config, dict):
            return jsonify({'success': False, 'error': 'Некорректный config'}), 400

        config_str = (
            json.dumps(config, ensure_ascii=False)
            if config is not None else old['config']
        )
        is_shared = 1 if data.get('is_shared') else int(old['is_shared'] or 0)

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                UPDATE report_templates
                SET name = ?, description = ?, config = ?, is_shared = ?
                WHERE id = ?
            ''', [
                name,
                (data.get('description', old['description']) or '').strip(),
                config_str,
                is_shared,
                tid,
            ])

        return jsonify({'success': True, 'message': 'Обновлено'})
    except Exception as e:
        log.exception('reports_templates_update error')
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_builder_bp.route('/api/reports/templates/<int:tid>', methods=['DELETE'])
@role_required(*REPORT_ROLES)
def reports_templates_delete(tid):
    try:
        old = db.query(
            'SELECT * FROM report_templates WHERE id = ? AND deleted_at IS NULL',
            [tid], one=True,
        )
        if not old:
            return jsonify({'success': False, 'error': 'Шаблон не найден'}), 404

        is_admin = session.get('user_role') == ROLE_ADMIN
        if old['created_by'] != session.get('user_id') and not is_admin:
            return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403

        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with db.transaction(immediate=True) as tx:
            tx.execute(
                'UPDATE report_templates SET deleted_at = ? WHERE id = ?',
                [now, tid],
            )

        return jsonify({'success': True, 'message': 'Удалено'})
    except Exception as e:
        log.exception('reports_templates_delete error')
        return jsonify({'success': False, 'error': str(e)}), 500