// static/js/cartridges/cartridges_chart.js
// График по месяцам + модалка деталей за месяц.
// Даты отображаются без времени.

(function() {
    'use strict';

    if (!window.App) return;

    var utils = window.App.utils;
    var Chart = window.CartridgesChart = window.CartridgesChart || {};

    var MONTH_FULL_RU = [
        '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];

    // ============================================================
    // ФОРМАТ ДАТЫ — ТОЛЬКО ДАТА, БЕЗ ВРЕМЕНИ
    // ============================================================
    function formatDateShort(dateStr) {
        if (!dateStr) return '—';
        try {
            // Заменяем ' ' на 'T', но обрезаем до даты на всякий случай
            var s = String(dateStr).trim();
            var iso = s.indexOf(' ') !== -1 ? s.replace(' ', 'T') : s;
            var dt = new Date(iso);
            if (isNaN(dt.getTime())) {
                // Если Date не справился — вернём первые 10 символов
                return s.substring(0, 10);
            }
            return String(dt.getDate()).padStart(2, '0') + '.' +
                   String(dt.getMonth() + 1).padStart(2, '0') + '.' +
                   dt.getFullYear();
        } catch (e) {
            return String(dateStr).substring(0, 10);
        }
    }

    function pluralizeRu(n, one, few, many) {
        var m10 = n % 10;
        var m100 = n % 100;
        if (m100 >= 11 && m100 <= 19) return many;
        if (m10 === 1) return one;
        if (m10 >= 2 && m10 <= 4) return few;
        return many;
    }

    Chart.formatDateShort = formatDateShort;
    Chart.pluralizeRu = pluralizeRu;

    // ============================================================
    // ГРАФИК
    // ============================================================
    Chart.renderMonthlyChart = function(data) {
        var months = data.months || [];
        var maxCount = data.max_month || 1;
        var currentMonth = new Date().toISOString().slice(0, 7);
        var sum = months.reduce(function(a, b) {
            return a + (b.count || 0);
        }, 0);

        var html = '<div class="monthly-chart-wrap">' +
            '<div class="d-flex justify-content-between align-items-center ' +
            'mb-3 flex-wrap gap-2">' +
            '<h6 class="mb-0"><i class="bi bi-bar-chart-line text-primary"></i> ' +
            'Замены по месяцам ' +
            '<small class="text-muted">(последние 12, кликните на столбик)</small>' +
            '</h6>' +
            '<span class="badge bg-primary">Всего за период: ' + sum + '</span>' +
            '</div>' +
            '<div class="monthly-chart">';

        months.forEach(function(m) {
            var heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
            var barClass = m.count > 0 ? 'chart-bar-active' : 'chart-bar-empty';
            var isCurrent = m.month === currentMonth;
            var colClass = isCurrent ? 'chart-column current' : 'chart-column';

            html += '<div class="' + colClass + '" ' +
                    'onclick="CartridgesChart.showMonthDetails(\'' + m.month + '\')" ' +
                    'title="' + m.month_full + ' ' + m.year + ': ' +
                    m.count + ' замен — кликните для деталей">';
            html += '<div class="chart-value">' +
                    (m.count > 0 ? m.count : '') + '</div>';
            html += '<div class="chart-bar ' + barClass + '" ' +
                    'style="height:' + Math.max(heightPct, 2) + '%"></div>';
            html += '<div class="chart-label">' + m.month_name + '</div>';
            html += '</div>';
        });

        html += '</div></div>';
        return html;
    };

    // ============================================================
    // ДЕТАЛИ ЗА МЕСЯЦ
    // ============================================================
    Chart.showMonthDetails = function(monthKey) {
        var parts = (monthKey || '').split('-');
        if (parts.length !== 2) return;

        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var monthName = MONTH_FULL_RU[month] || monthKey;

        var cartridges = (window.App.Cartridges &&
                          window.App.Cartridges.getCache) ?
            window.App.Cartridges.getCache() : [];

        var replacements = [];

        cartridges.forEach(function(cart) {
            if (!cart.replacement_dates ||
                cart.replacement_dates.length === 0) return;

            cart.replacement_dates.forEach(function(dateStr) {
                if (!dateStr) return;
                var d = String(dateStr).trim();
                // Сравниваем только по 'YYYY-MM'
                if (d.substring(0, 7) === monthKey) {
                    replacements.push({
                        date: d,
                        cabinet: (cart.cabinet || '— без кабинета —').trim(),
                        printer: cart.printer || '-',
                        cartridge: cart.cartridge || '-',
                    });
                }
            });
        });

        if (replacements.length === 0) {
            Swal.fire({
                icon: 'info',
                title: monthName + ' ' + year,
                text: 'В этом месяце замен не было',
            });
            return;
        }

        var grouped = {};
        replacements.forEach(function(r) {
            var key = r.cabinet || '— без кабинета —';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(r);
        });

        var cabinetNames = Object.keys(grouped).sort(function(a, b) {
            var diff = grouped[b].length - grouped[a].length;
            if (diff !== 0) return diff;
            return String(a).localeCompare(String(b), 'ru');
        });

        cabinetNames.forEach(function(cab) {
            grouped[cab].sort(function(a, b) {
                return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
            });
        });

        var showGrouping = replacements.length > 1;
        var rowsHtml = '';

        if (showGrouping) {
            cabinetNames.forEach(function(cab) {
                var items = grouped[cab];
                var countWord = pluralizeRu(items.length,
                    'замена', 'замены', 'замен');

                rowsHtml += '<tr class="cart-group-header">' +
                    '<td colspan="3">' +
                    '<i class="bi bi-door-closed"></i> ' +
                    '<strong>' + utils.escapeHtml(cab) + '</strong>' +
                    '<span class="badge">' +
                    items.length + ' ' + countWord +
                    '</span>' +
                    '</td></tr>';

                items.forEach(function(r) {
                    rowsHtml += '<tr class="cart-group-row">' +
                        '<td class="cart-date">' +
                        utils.escapeHtml(formatDateShort(r.date)) + '</td>' +
                        '<td>' + utils.escapeHtml(r.printer) + '</td>' +
                        '<td>' + utils.escapeHtml(r.cartridge) + '</td>' +
                        '</tr>';
                });
            });
        } else {
            replacements.forEach(function(r) {
                rowsHtml += '<tr>' +
                    '<td class="cart-date">' +
                    utils.escapeHtml(formatDateShort(r.date)) + '</td>' +
                    '<td class="cart-cabinet">' +
                    utils.escapeHtml(r.cabinet) + '</td>' +
                    '<td>' + utils.escapeHtml(r.printer) + '</td>' +
                    '<td>' + utils.escapeHtml(r.cartridge) + '</td>' +
                    '</tr>';
            });
        }

        var headerHtml = showGrouping
            ? '<thead><tr>' +
              '<th>Дата</th><th>Принтер</th><th>Картридж</th>' +
              '</tr></thead>'
            : '<thead><tr>' +
              '<th>Дата</th><th>Кабинет</th>' +
              '<th>Принтер</th><th>Картридж</th>' +
              '</tr></thead>';

        var html =
            '<div class="text-start">' +
            '<div class="row mb-3 g-2">' +
            '<div class="col-6"><div class="p-2 rounded" ' +
            'style="background:rgba(102,126,234,.1)">' +
            '<div style="font-size:1.4rem;font-weight:800;color:#667eea">' +
            replacements.length + '</div>' +
            '<div style="font-size:.7rem;color:#888;text-transform:uppercase">' +
            'Всего замен</div>' +
            '</div></div>' +
            '<div class="col-6"><div class="p-2 rounded" ' +
            'style="background:rgba(40,167,69,.1)">' +
            '<div style="font-size:1.4rem;font-weight:800;color:#28a745">' +
            cabinetNames.length + '</div>' +
            '<div style="font-size:.7rem;color:#888;text-transform:uppercase">' +
            'Кабинетов</div>' +
            '</div></div></div>' +
            '<div style="max-height:400px;overflow-y:auto;border-radius:8px;' +
            'border:1px solid var(--border-color)">' +
            '<table class="cart-month-table mb-0">' +
            headerHtml +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table></div></div>';

        Swal.fire({
            title: '<i class="bi bi-calendar3"></i> ' + monthName + ' ' + year,
            html: html,
            width: 720,
            confirmButtonText: 'Закрыть',
            customClass: { popup: 'swal-wide' },
        });
    };

    window.showCartridgeMonthDetails = Chart.showMonthDetails;

    console.log('[cartridges_chart] Загружено (даты без времени)');
})();