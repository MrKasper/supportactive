// static/js/audit.js
// Журнал аудита (только Администратор)

(function() {
    'use strict';

    if (!window.App) {
        console.error('[audit] App не инициализирован');
        return;
    }

    var api = window.App.register('Audit');
    var utils = window.App.utils;

    // ============= СТРАНИЦА =============
    function loadAuditPage() {
        var $b = $('#otherPagesBlock');
        $b.html('<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Загрузка журнала...</p></div>');

        Promise.all([
            fetch('/api/audit/stats').then(function(r) { return r.json(); }),
            fetch('/api/audit?page=1&per_page=50').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var stats = results[0];
                var log = results[1];

                if (log.error) {
                    $b.html('<div class="alert alert-danger">' + utils.escapeHtml(log.error) + '</div>');
                    return;
                }

                var html = '';

                // KPI
                html += '<div class="row mb-3 g-3">';
                html += kpi('Всего записей', stats.total || 0, 'bi-journal-text', 'primary');
                html += kpi('Сегодня', stats.today || 0, 'bi-calendar-day', 'info');
                html += kpi('Пользователей', (stats.top_users || []).length, 'bi-people', 'success');
                html += kpi('Типов действий', (stats.by_action || []).length, 'bi-diagram-3', 'warning');
                html += '</div>';

                // Сводка
                html += '<div class="row mb-3 g-3">';
                html += '<div class="col-md-6"><div class="card">' +
                    '<div class="card-header bg-primary text-white"><h6 class="mb-0"><i class="bi bi-pie-chart"></i> По действиям</h6></div>' +
                    '<div class="card-body">';
                (stats.by_action || []).forEach(function(a) {
                    html += '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<span class="badge ' + actionBadge(a.action) + '">' + utils.escapeHtml(a.action || '-') + '</span>' +
                        '<strong>' + a.count + '</strong></div>';
                });
                html += '</div></div></div>';

                html += '<div class="col-md-6"><div class="card">' +
                    '<div class="card-header bg-info text-white"><h6 class="mb-0"><i class="bi bi-list-check"></i> По объектам</h6></div>' +
                    '<div class="card-body">';
                (stats.by_entity || []).forEach(function(e) {
                    html += '<div class="d-flex justify-content-between align-items-center mb-2">' +
                        '<span>' + utils.escapeHtml(entityName(e.entity)) + '</span>' +
                        '<strong>' + e.count + '</strong></div>';
                });
                html += '</div></div></div>';
                html += '</div>';

                // Фильтры
                html += '<div class="card mb-3"><div class="card-body"><div class="row g-2">';
                html += '<div class="col-md-3"><label class="form-label">Пользователь (логин)</label>' +
                    '<input class="form-control" id="auditUserFilter" placeholder="login..."></div>';
                html += '<div class="col-md-2"><label class="form-label">Действие</label>' +
                    '<select class="form-select" id="auditActionFilter">' +
                    '<option value="">Все</option>' +
                    '<option value="create">create</option>' +
                    '<option value="update">update</option>' +
                    '<option value="delete">delete</option>' +
                    '<option value="login">login</option>' +
                    '<option value="logout">logout</option>' +
                    '</select></div>';
                html += '<div class="col-md-2"><label class="form-label">Объект</label>' +
                    '<select class="form-select" id="auditEntityFilter">' +
                    '<option value="">Все</option>' +
                    '<option value="task">task</option>' +
                    '<option value="user">user</option>' +
                    '<option value="cabinet">cabinet</option>' +
                    '<option value="cartridge">cartridge</option>' +
                    '<option value="license">license</option>' +
                    '<option value="contact">contact</option>' +
                    '</select></div>';
                html += '<div class="col-md-2"><label class="form-label">С</label>' +
                    '<input type="date" class="form-control" id="auditDateFrom"></div>';
                html += '<div class="col-md-2"><label class="form-label">По</label>' +
                    '<input type="date" class="form-control" id="auditDateTo"></div>';
                html += '<div class="col-md-1"><label class="form-label">&nbsp;</label>' +
                    '<button class="btn btn-primary w-100" onclick="loadAuditLog(1)"><i class="bi bi-search"></i></button></div>';
                html += '</div></div></div>';

                // Таблица
                html += '<div class="card">' +
                    '<div class="card-header bg-secondary text-white">' +
                    '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">' +
                    '<h6 class="mb-0"><i class="bi bi-clock-history"></i> Журнал событий</h6>' +
                    '<button class="btn btn-sm btn-light" onclick="loadAuditPage()"><i class="bi bi-arrow-clockwise"></i> Обновить</button>' +
                    '</div></div>' +
                    '<div class="card-body"><div class="table-responsive">' +
                    '<table class="table table-sm table-striped align-middle">' +
                    '<thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th>' +
                    '<th>ID</th><th>Детали</th><th>IP</th></tr></thead>' +
                    '<tbody id="auditTableBody"></tbody></table></div>' +
                    '<div id="auditPagination" class="mt-2"></div>' +
                    '</div></div>';

                $b.html(html);
                renderRows(log.items || []);
                renderPagination(log);
            })
            .catch(function(err) {
                console.error('[audit] load error:', err);
                $b.html('<div class="alert alert-danger">Ошибка загрузки журнала: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function kpi(label, value, icon, color) {
        return '<div class="col-6 col-md-3"><div class="card bg-' + color + ' text-white">' +
            '<div class="card-body d-flex justify-content-between align-items-center">' +
            '<div><h3 class="mb-0">' + value + '</h3><small>' + label + '</small></div>' +
            '<i class="bi ' + icon + '" style="font-size:2.5rem;opacity:.4;"></i>' +
            '</div></div></div>';
    }

    function actionBadge(action) {
        switch (action) {
            case 'create': return 'bg-success';
            case 'update': return 'bg-primary';
            case 'delete': return 'bg-danger';
            case 'login':  return 'bg-info text-dark';
            case 'logout': return 'bg-secondary';
            default:       return 'bg-dark';
        }
    }

    function entityName(e) {
        var map = {
            task: 'Заявки', user: 'Пользователи', cabinet: 'Кабинеты',
            cartridge: 'Картриджи', license: 'Лицензии', contact: 'Контакты',
            problem_type: 'Типы проблем', attachment: 'Вложения', comment: 'Комментарии'
        };
        return map[e] || e;
    }

    // ============= ЗАГРУЗКА С ФИЛЬТРАМИ =============
    function loadAuditLog(page) {
        page = page || 1;

        var params = new URLSearchParams({ page: page, per_page: 50 });
        var u = $('#auditUserFilter').val(); if (u) params.append('user_login', u);
        var a = $('#auditActionFilter').val(); if (a) params.append('action', a);
        var e = $('#auditEntityFilter').val(); if (e) params.append('entity', e);
        var df = $('#auditDateFrom').val(); if (df) params.append('date_from', df);
        var dt = $('#auditDateTo').val(); if (dt) params.append('date_to', dt);

        $('#auditTableBody').html('<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>');

        fetch('/api/audit?' + params.toString())
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) { utils.showErrorMessage(data.error); return; }
                renderRows(data.items || []);
                renderPagination(data);
            });
    }

    // ============= СТРОКИ =============
    function renderRows(items) {
        var $t = $('#auditTableBody');
        $t.empty();

        if (items.length === 0) {
            $t.append('<tr><td colspan="7" class="text-center text-muted py-3">Нет записей</td></tr>');
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
            } catch (e) { details = r.details || ''; }

            $t.append(
                '<tr>' +
                '<td><small>' + utils.formatDate(r.created_at) + '</small></td>' +
                '<td><small><strong>' + utils.escapeHtml(r.user_login || '-') + '</strong></small></td>' +
                '<td><span class="badge ' + actionBadge(r.action) + '">' + utils.escapeHtml(r.action) + '</span></td>' +
                '<td><small>' + utils.escapeHtml(entityName(r.entity)) + '</small></td>' +
                '<td><small>' + (r.entity_id || '-') + '</small></td>' +
                '<td><small class="text-muted">' + utils.escapeHtml(utils.truncateText(details, 80)) + '</small></td>' +
                '<td><small class="text-muted">' + utils.escapeHtml(r.ip || '-') + '</small></td>' +
                '</tr>'
            );
        });
    }

    // ============= ПАГИНАЦИЯ =============
    function renderPagination(data) {
        var $p = $('#auditPagination');
        if (!data || data.pages <= 1) { $p.empty(); return; }

        var html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';
        html += '<li class="page-item ' + (data.page === 1 ? 'disabled' : '') + '">' +
            '<a class="page-link" href="#" onclick="loadAuditLog(' + (data.page - 1) + '); return false;">&laquo;</a></li>';

        var s = Math.max(1, data.page - 2);
        var e = Math.min(data.pages, data.page + 2);
        for (var i = s; i <= e; i++) {
            html += '<li class="page-item ' + (i === data.page ? 'active' : '') + '">' +
                '<a class="page-link" href="#" onclick="loadAuditLog(' + i + '); return false;">' + i + '</a></li>';
        }

        html += '<li class="page-item ' + (data.page === data.pages ? 'disabled' : '') + '">' +
            '<a class="page-link" href="#" onclick="loadAuditLog(' + (data.page + 1) + '); return false;">&raquo;</a></li>';
        html += '</ul></nav>';
        html += '<div class="text-center text-muted small mt-2">Всего: ' + data.total + '</div>';
        $p.html(html);
    }

    // ============= ЭКСПОРТ =============
    api.load = loadAuditPage;
    api.loadLog = loadAuditLog;

    window.loadAuditPage = loadAuditPage;
    window.loadAuditLog = loadAuditLog;

    console.log('[audit] Загружено');
})();