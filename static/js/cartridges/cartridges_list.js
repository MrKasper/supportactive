// static/js/cartridges/cartridges_list.js
// Главная страница картриджей: KPI, таблица, поиск, фильтр.
// Даты замены отображаются без времени.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cartridges_list] App не инициализирован');
        return;
    }

    var mod = window.App.register('Cartridges');
    var api = window.App.api;
    var utils = window.App.utils;

    if (!api || typeof api.get !== 'function') {
        console.error('[cartridges_list] App.api не загружен');
        return;
    }

    var cartridgesCache = [];

    // ============================================================
    // ГЛАВНАЯ
    // ============================================================
    function loadCartridgesPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка картриджей...</p>' +
            '</div>'
        );

        Promise.all([
            api.get('/api/cartridges'),
            api.get('/api/cartridges/statistics'),
            api.get('/api/cartridges/statistics/monthly'),
        ])
            .then(function(results) {
                var cartridges = results[0];
                var stats = results[1];
                var monthly = results[2];

                if (cartridges.error) {
                    $contentBlock.html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(cartridges.error) + '</div>'
                    );
                    return;
                }

                cartridgesCache = cartridges || [];

                var html = '';

                if (!stats.error) {
                    html += '<div class="row mb-3 g-3">';
                    html += kpiCard('Всего записей', stats.total,
                        'bi-clipboard-data', 'primary');
                    html += kpiCard('Всего замен', stats.total_replacements,
                        'bi-arrow-repeat', 'success');
                    html += kpiCard('Замен за месяц', stats.month_replacements,
                        'bi-calendar-month', 'info');
                    html += kpiCard('Замен за год', stats.year_replacements,
                        'bi-calendar-check', 'warning');
                    html += '</div>';
                }

                if (!monthly.error && monthly.months && window.CartridgesChart) {
                    html += window.CartridgesChart.renderMonthlyChart(monthly);
                }

                html += renderTable(cartridges);
                $contentBlock.html(html);

                var urlSearch = getSearchFromUrl();
                if (urlSearch) {
                    $('#cartridgesSearchInput').val(urlSearch);
                    filterCartridgesTable();
                }
            })
            .catch(function(error) {
                console.error('[cartridges_list] load error:', error);
                $contentBlock.html(
                    '<div class="alert alert-danger">' +
                    'Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>'
                );
            });
    }

    function kpiCard(label, value, icon, color) {
        return '<div class="col-6 col-md-3">' +
            '<div class="cart-kpi bg-grad-' + color + '">' +
            '<i class="bi ' + icon + ' kpi-icon"></i>' +
            '<div class="kpi-value">' + (value || 0) + '</div>' +
            '<div class="kpi-label">' + label + '</div>' +
            '</div></div>';
    }

    function getSearchFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('search') || '';
        } catch (e) {
            return '';
        }
    }

    // ============================================================
    // ТАБЛИЦА
    // ============================================================
    function renderTable(cartridges) {
        var html = '<div class="card">' +
            '<div class="card-header bg-primary text-white">' +
            '<div class="d-flex justify-content-between align-items-center ' +
            'flex-wrap gap-2">' +
            '<h5 class="mb-0"><i class="bi bi-printer"></i> ' +
            'Замена картриджей</h5>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-light" ' +
            'onclick="loadCartridgesPage()">' +
            '<i class="bi bi-arrow-clockwise"></i> Обновить</button>' +
            '<button class="btn btn-sm btn-success" ' +
            'onclick="showAddCartridgeModal()">' +
            '<i class="bi bi-plus-circle"></i> Добавить</button>' +
            '</div></div></div>' +
            '<div class="card-body">' +

            '<div class="row mb-3"><div class="col-md-6 col-lg-4">' +
            '<div class="input-group">' +
            '<span class="input-group-text"><i class="bi bi-search"></i></span>' +
            '<input type="text" class="form-control" id="cartridgesSearchInput" ' +
            'placeholder="Поиск по кабинету, ФИО, принтеру, картриджу..." ' +
            'autocomplete="off">' +
            '<button class="btn btn-outline-secondary" type="button" ' +
            'id="cartridgesSearchClear" title="Очистить" style="display:none">' +
            '<i class="bi bi-x"></i></button>' +
            '</div>' +
            '<small class="text-muted">Найдено: ' +
            '<span id="cartridgesSearchCount">' +
            (cartridges ? cartridges.length : 0) +
            '</span></small>' +
            '</div></div>' +

            '<div class="table-responsive">' +
            '<table class="table table-striped table-hover align-middle">' +
            '<thead><tr>' +
            '<th>Кабинет</th><th>ФИО</th><th>Принтер</th>' +
            '<th>Картридж</th><th>Даты замены</th>' +
            '<th>Примечание</th><th>Действия</th>' +
            '</tr></thead>' +
            '<tbody id="cartridgesTableBody">' +
            renderRows(cartridges) +
            '</tbody></table></div></div></div>';

        setTimeout(initSearchHandler, 0);
        return html;
    }

    function renderRows(cartridges) {
        if (!cartridges || cartridges.length === 0) {
            return '<tr><td colspan="7" class="text-center text-muted py-4">' +
                   'Нет записей</td></tr>';
        }

        var html = '';
        cartridges.forEach(function(cart) {
            html += renderCartridgeRow(cart);
        });
        return html;
    }

    function renderCartridgeRow(cart) {
        var datesHtml = '';
        if (cart.replacement_dates && cart.replacement_dates.length > 0) {
            var sortedDates = cart.replacement_dates.slice().sort().reverse();
            datesHtml = '<ul class="list-unstyled mb-0 small">';
            sortedDates.forEach(function(date, idx) {
                var isLatest = idx === 0;
                // ⚠️ Только дата, без времени
                datesHtml += '<li class="' +
                    (isLatest ? 'text-success fw-bold' : '') + '">' +
                    (isLatest ? '<i class="bi bi-star-fill"></i> ' : '') +
                    utils.formatDateOnly(date) + '</li>';
            });
            datesHtml += '</ul>';
        } else {
            datesHtml = '<span class="badge bg-warning text-dark">' +
                '<i class="bi bi-exclamation-circle"></i> ' +
                'Дата не указана</span>';
        }

        var html = '<tr>';
        html += '<td>' + utils.escapeHtml(cart.cabinet || '-') + '</td>';
        html += '<td>' + utils.escapeHtml(cart.full_name || '-') + '</td>';
        html += '<td>' + utils.escapeHtml(cart.printer || '-') + '</td>';
        html += '<td>' + utils.escapeHtml(cart.cartridge || '-') + '</td>';
        html += '<td>' + datesHtml + '</td>';
        html += '<td>' + utils.escapeHtml(cart.notes || '-') + '</td>';
        html += '<td><div class="btn-group btn-group-sm">';
        html += '<button class="btn btn-outline-success" ' +
            'onclick="editCartridge(' + cart.id + ')" ' +
            'title="Редактировать">' +
            '<i class="bi bi-pencil"></i></button>';
        html += '<button class="btn btn-outline-danger" ' +
            'onclick="deleteCartridge(' + cart.id + ')" ' +
            'title="Удалить">' +
            '<i class="bi bi-trash"></i></button>';
        html += '<button class="btn btn-outline-warning" ' +
            'onclick="clearCartridgeDates(' + cart.id + ')" ' +
            'title="Очистить даты">' +
            '<i class="bi bi-calendar-x"></i></button>';
        html += '</div></td></tr>';
        return html;
    }

    // ============================================================
    // ПОИСК
    // ============================================================
    function initSearchHandler() {
        var $input = $('#cartridgesSearchInput');
        if ($input.length === 0) return;

        $input
            .off('input.cartSearch')
            .on('input.cartSearch', function() {
                filterCartridgesTable();
            });

        $('#cartridgesSearchClear')
            .off('click.cartSearch')
            .on('click.cartSearch', function() {
                $('#cartridgesSearchInput').val('').trigger('input');
                $('#cartridgesSearchInput').focus();
            });

        $input
            .off('keydown.cartSearch')
            .on('keydown.cartSearch', function(e) {
                if (e.key === 'Escape') {
                    $(this).val('').trigger('input');
                }
            });
    }

    function filterCartridgesTable() {
        var q = ($('#cartridgesSearchInput').val() || '').toLowerCase().trim();

        $('#cartridgesSearchClear').toggle(q.length > 0);

        var filtered;
        if (!q) {
            filtered = cartridgesCache;
        } else {
            filtered = cartridgesCache.filter(function(c) {
                if (cartridgeMatches(c, q)) return true;
                if (c.replacement_dates && c.replacement_dates.length) {
                    for (var i = 0; i < c.replacement_dates.length; i++) {
                        var d = String(c.replacement_dates[i] || '').toLowerCase();
                        if (d.indexOf(q) !== -1) return true;
                    }
                }
                return false;
            });
        }

        $('#cartridgesTableBody').html(renderRows(filtered));
        $('#cartridgesSearchCount').text(filtered.length);
    }

    function cartridgeMatches(cart, q) {
        var fields = [
            cart.cabinet,
            cart.full_name,
            cart.printer,
            cart.cartridge,
            cart.notes,
        ];
        for (var i = 0; i < fields.length; i++) {
            var v = fields[i];
            if (v && String(v).toLowerCase().indexOf(q) !== -1) return true;
        }
        return false;
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = loadCartridgesPage;
    mod.getCache = function() { return cartridgesCache; };
    mod.filter = filterCartridgesTable;
    mod.showMonthDetails = function(month) {
        if (window.CartridgesChart) {
            window.CartridgesChart.showMonthDetails(month);
        }
    };

    window.loadCartridgesPage = loadCartridgesPage;
    window.filterCartridgesTable = filterCartridgesTable;

    console.log('[cartridges_list] Загружено (даты без времени)');
})();