// static/js/audit_page.js
// Standalone страница журнала аудита (для роли Разработчик).

(function() {
    'use strict';

    if (!window.App) {
        console.error('[audit_page] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    function loadAll() {
        Promise.all([
            api.get('/api/audit/stats'),
            api.get('/api/audit?page=1&per_page=50'),
        ])
            .then(function(results) {
                var stats = results[0] || {};
                var log = results[1] || {};

                if (stats.error) {
                    console.error('[audit_page] stats error:', stats.error);
                } else {
                    renderStats(stats);
                }

                if (log.error) {
                    $('#auditTableBody').html(
                        '<tr><td colspan="7" class="text-center text-danger py-3">' +
                        utils.escapeHtml(log.error) + '</td></tr>'
                    );
                    return;
                }

                renderRows(log.items || []);
                _renderPagination(log);
            })
            .catch(function(err) {
                console.error('[audit_page] load error:', err);
                $('#audit-kpi').html(
                    '<div class="col-12"><div class="alert alert-danger">' +
                    'Ошибка загрузки: ' +
                    utils.escapeHtml(err.message || 'неизвестная') +
                    '</div></div>'
                );
            });
    }

    // ============================================================
    // KPI
    // ============================================================
    function renderStats(stats) {
        var html = '';
        html += kpiCard('Всего записей', stats.total || 0,
            'bi-journal-text', 'primary');
        html += kpiCard('Сегодня', stats.today || 0,
            'bi-calendar-day', 'info');
        html += kpiCard('Пользователей',
            (stats.top_users || []).length, 'bi-people', 'success');
        html += kpiCard('Типов действий',
            (stats.by_action || []).length, 'bi-diagram-3', 'warning');
        $('#audit-kpi').html(html);

        // По действиям
        var actionHtml = '';
        (stats.by_action || []).forEach(function(a) {
            actionHtml += '<div class="d-flex justify-content-between ' +
                'align-items-center mb-2">' +
                '<span class="stat-badge ' + actionClass(a.action) + '">' +
                utils.escapeHtml(a.action || '-') + '</span>' +
                '<strong>' + a.count + '</strong></div>';
        });
        $('#audit-by-action').html(actionHtml ||
            '<div class="text-muted small">Нет данных</div>');

        // По объектам
        var entityHtml = '';
        (stats.by_entity || []).forEach(function(e) {
            entityHtml += '<div class="d-flex justify-content-between ' +
                'align-items-center mb-2">' +
                '<span>' + utils.escapeHtml(entityName(e.entity)) + '</span>' +
                '<strong>' + e.count + '</strong></div>';
        });
        $('#audit-by-entity').html(entityHtml ||
            '<div class="text-muted small">Нет данных</div>');
    }

    function kpiCard(label, value, icon, color) {
        return '<div class="col-6 col-md-3"><div class="card bg-' +
            color + ' text-white h-100">' +
            '<div class="card-body d-flex justify-content-between ' +
            'align-items-center">' +
            '<div><h3 class="mb-0">' + value + '</h3>' +
            '<small>' + label + '</small></div>' +
            '<i class="bi ' + icon + '" style="font-size:2.5rem;opacity:.4;"></i>' +
            '</div></div></div>';
    }

    function actionClass(action) {
        switch (action) {
            case 'create': return 'create';
            case 'update': return 'update';
            case 'delete': return 'delete';
            case 'login':  return 'login';
            case 'logout': return 'logout';
            case 'bulk':   return 'bulk';
            case 'import': return 'import';
            case 'clear':  return 'clear';
            default:       return 'update';
        }
    }

    function entityName(e) {
        var map = {
            task: 'Заявки',
            user: 'Пользователи',
            cabinet: 'Кабинеты',
            cartridge: 'Картриджи',
            license: 'Лицензии',
            contact: 'Контакты',
            problem_type: 'Типы проблем',
            attachment: 'Вложения',
            comment: 'Комментарии',
            cache: 'Кеш',
        };
        return map[e] || e;
    }

    // ============================================================
    // ЗАГРУЗКА С ФИЛЬТРАМИ
    // ============================================================
    function loadLog(page) {
        page = page || 1;

        var params = new URLSearchParams({
            page: page,
            per_page: 50,
        });

        var u = $('#auditUserFilter').val();
        if (u) params.append('user_login', u);
        var a = $('#auditActionFilter').val();
        if (a) params.append('action', a);
        var e = $('#auditEntityFilter').val();
        if (e) params.append('entity', e);
        var df = $('#auditDateFrom').val();
        if (df) params.append('date_from', df);
        var dt = $('#auditDateTo').val();
        if (dt) params.append('date_to', dt);

        $('#auditTableBody').html(
            '<tr><td colspan="7" class="text-center py-3">' +
            '<div class="spinner-border spinner-border-sm"></div>' +
            '</td></tr>'
        );

        api.get('/api/audit?' + params.toString())
            .then(function(data) {
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }
                renderRows(data.items || []);
                _renderPagination(data);
            })
            .catch(function(err) {
                console.error('[audit_page] loadLog error:', err);
                $('#auditTableBody').html(
                    '<tr><td colspan="7" class="text-center text-danger py-3">' +
                    'Ошибка загрузки</td></tr>'
                );
            });
    }

    // ============================================================
    // СТРОКИ
    // ============================================================
    function renderRows(items) {
        var $t = $('#auditTableBody');
        $t.empty();

        if (!items || items.length === 0) {
            $t.append(
                '<tr><td colspan="7" class="text-center text-muted py-3">' +
                'Нет записей</td></tr>'
            );
            return;
        }

        items.forEach(function(r) {
            var details = '';
            try {
                if (r.details) {
                    var parsed = JSON.parse(r.details);
                    details = Object.keys(parsed).map(function(k) {
                        return k + ': ' + parsed[k];
                    }).join('; ');
                }
            } catch (e) {
                details = r.details || '';
            }

            $t.append(
                '<tr>' +
                '<td><small>' + utils.formatDate(r.created_at) + '</small></td>' +
                '<td><small><strong>' +
                utils.escapeHtml(r.user_login || '-') +
                '</strong></small></td>' +
                '<td><span class="stat-badge ' +
                actionClass(r.action) + '">' +
                utils.escapeHtml(r.action) + '</span></td>' +
                '<td><small>' + utils.escapeHtml(entityName(r.entity)) +
                '</small></td>' +
                '<td><small>' + (r.entity_id || '-') + '</small></td>' +
                '<td class="col-details" title="' +
                utils.escapeHtml(details) + '">' +
                utils.escapeHtml(utils.truncateText(details, 100)) +
                '</td>' +
                '<td><small class="text-muted">' +
                utils.escapeHtml(r.ip || '-') + '</small></td>' +
                '</tr>'
            );
        });
    }

    // ============================================================
    // ПАГИНАЦИЯ (обёртка над utils.renderPagination)
    // ============================================================
    function _renderPagination(data) {
        utils.renderPagination({
            container: '#auditPagination',
            data: data,
            onClickFn: 'AuditPage.loadLog',
            showFirstLast: true,
            showCounter: true,
            counterStyle: 'total',
            countLabel: 'Всего'
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    window.AuditPage = {
        loadAll: loadAll,
        loadLog: loadLog,
    };

    // Автозагрузка
    $(document).ready(function() {
        loadAll();
    });

    console.log('[audit_page] Загружено');
})();