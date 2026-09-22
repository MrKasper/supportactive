// static/js/cartridges.js
// Картриджи: список, статистика, аналитика.
// Дата замены — необязательное поле.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cartridges] App не инициализирован');
        return;
    }

    var mod = window.App.register('Cartridges');
    var api = window.App.api;
    var utils = window.App.utils;

    if (!api || typeof api.get !== 'function') {
        console.error('[cartridges] App.api не загружен');
        return;
    }

    var cartridgesCache = [];

    var MONTH_FULL_RU = [
        '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================

    // Короткое форматирование даты: '21.09.2026 09:37'
    function formatDateShort(dateStr) {
        if (!dateStr) return '—';
        try {
            var dt = new Date(String(dateStr).replace(' ', 'T'));
            if (isNaN(dt.getTime())) return String(dateStr);
            return String(dt.getDate()).padStart(2, '0') + '.' +
                   String(dt.getMonth() + 1).padStart(2, '0') + '.' +
                   dt.getFullYear() + ' ' +
                   String(dt.getHours()).padStart(2, '0') + ':' +
                   String(dt.getMinutes()).padStart(2, '0');
        } catch (e) {
            return String(dateStr);
        }
    }

    // Склонение русских слов: pluralizeRu(5, 'замена', 'замены', 'замен')
    function pluralizeRu(n, one, few, many) {
        var m10 = n % 10;
        var m100 = n % 100;
        if (m100 >= 11 && m100 <= 19) return many;
        if (m10 === 1) return one;
        if (m10 >= 2 && m10 <= 4) return few;
        return many;
    }

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

                if (!monthly.error && monthly.months) {
                    html += renderMonthlyChart(monthly);
                }

                html += renderTable(cartridges);
                $contentBlock.html(html);

                // Фокус на поле поиска, если есть ?search= в URL
                var urlSearch = getSearchFromUrl();
                if (urlSearch) {
                    $('#cartridgesSearchInput').val(urlSearch);
                    filterCartridgesTable();
                }
            })
            .catch(function(error) {
                console.error('[cartridges] load error:', error);
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

    // ============================================================
    // ПОДДЕРЖКА ?search= в URL (для возврата/обновления)
    // ============================================================
    function getSearchFromUrl() {
        try {
            var params = new URLSearchParams(window.location.search);
            return params.get('search') || '';
        } catch (e) {
            return '';
        }
    }

    // ============================================================
    // ГРАФИК
    // ============================================================
    function renderMonthlyChart(data) {
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
            var barClass = m.count > 0
                ? 'chart-bar-active'
                : 'chart-bar-empty';
            var isCurrent = m.month === currentMonth;
            var colClass = isCurrent ? 'chart-column current' : 'chart-column';

            html += '<div class="' + colClass + '" ' +
                    'onclick="showCartridgeMonthDetails(\'' + m.month + '\')" ' +
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
    }

    // ============================================================
    // МОДАЛКА: ДЕТАЛИ ЗАМЕН ЗА МЕСЯЦ
    // ============================================================
    function showCartridgeMonthDetails(monthKey) {
        var parts = (monthKey || '').split('-');
        if (parts.length !== 2) return;

        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var monthName = MONTH_FULL_RU[month] || monthKey;

        // ---------- Собираем замены за месяц ----------
        var replacements = [];

        cartridgesCache.forEach(function(cart) {
            if (!cart.replacement_dates ||
                cart.replacement_dates.length === 0) return;

            cart.replacement_dates.forEach(function(dateStr) {
                if (!dateStr) return;
                var d = String(dateStr).trim();
                if (d.indexOf(monthKey) === 0) {
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

        // ---------- Группировка по кабинетам ----------
        var grouped = {};
        replacements.forEach(function(r) {
            var key = r.cabinet || '— без кабинета —';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(r);
        });

        // Сортировка кабинетов: сначала по числу замен (убыв.),
        // при равенстве — по имени (русская локаль)
        var cabinetNames = Object.keys(grouped).sort(function(a, b) {
            var diff = grouped[b].length - grouped[a].length;
            if (diff !== 0) return diff;
            return String(a).localeCompare(String(b), 'ru');
        });

        // Внутри каждого кабинета — по дате (свежие сверху)
        cabinetNames.forEach(function(cab) {
            grouped[cab].sort(function(a, b) {
                return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
            });
        });

        // Показывать группировку только если замен реально больше одной
        var showGrouping = replacements.length > 1;

        // ---------- Формируем строки таблицы ----------
        var rowsHtml = '';

        if (showGrouping) {
            cabinetNames.forEach(function(cab) {
                var items = grouped[cab];
                var countWord = pluralizeRu(items.length,
                    'замена', 'замены', 'замен');

                // Заголовок группы
                rowsHtml += '<tr class="cart-group-header">' +
                    '<td colspan="3">' +
                    '<i class="bi bi-door-closed"></i> ' +
                    '<strong>' + utils.escapeHtml(cab) + '</strong>' +
                    '<span class="badge">' +
                    items.length + ' ' + countWord +
                    '</span>' +
                    '</td></tr>';

                // Строки группы
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
            // Одна замена — плоский вид (как было)
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

        // ---------- Шапка таблицы ----------
        var headerHtml = showGrouping
            ? '<thead><tr>' +
              '<th>Дата</th><th>Принтер</th><th>Картридж</th>' +
              '</tr></thead>'
            : '<thead><tr>' +
              '<th>Дата</th><th>Кабинет</th>' +
              '<th>Принтер</th><th>Картридж</th>' +
              '</tr></thead>';

        // ---------- Финальный HTML ----------
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

            // ----- Поиск (как в «Управлении кабинетами») -----
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

        // Навешиваем обработчик после вставки в DOM
        setTimeout(initSearchHandler, 0);

        return html;
    }

    // ============================================================
    // СТРОКИ ТАБЛИЦЫ
    // ============================================================
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
                datesHtml += '<li class="' +
                    (isLatest ? 'text-success fw-bold' : '') + '">' +
                    (isLatest
                        ? '<i class="bi bi-star-fill"></i> '
                        : '') +
                    utils.formatDate(date) + '</li>';
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

        // Esc — очистить
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

        // Показываем/прячем крестик
        $('#cartridgesSearchClear').toggle(q.length > 0);

        var filtered;
        if (!q) {
            filtered = cartridgesCache;
        } else {
            filtered = cartridgesCache.filter(function(c) {
                if (cartridgeMatches(c, q)) return true;

                // Также ищем по датам замены (по текстовому виду)
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
    // ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ
    // ============================================================
    function showAddCartridgeModal() {
        api.get('/api/cabinets')
            .then(function(cabinets) {
                var cabinetOptions = '';
                (cabinets || []).forEach(function(cab) {
                    cabinetOptions += '<option value="' +
                        utils.escapeHtml(cab.cabinet_number) + '">' +
                        utils.escapeHtml(
                            cab.cabinet_number +
                            (cab.description ? ' - ' + cab.description : '')
                        ) + '</option>';
                });

                Swal.fire({
                    title: 'Добавить запись о замене картриджа',
                    html: buildCartridgeForm(cabinetOptions, null),
                    showCancelButton: true,
                    confirmButtonText: 'Добавить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    didOpen: function() { initDatesHandlers(); },
                    preConfirm: function() { return collectCartridgeForm(); },
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    postCartridge(result.value);
                });
            });
    }

    function editCartridge(cartridgeId) {
        Promise.all([
            api.get('/api/cartridges/' + cartridgeId),
            api.get('/api/cabinets'),
        ])
            .then(function(results) {
                var data = results[0];
                var cabinets = results[1] || [];
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }

                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    var selected = (cab.cabinet_number === data.cabinet)
                        ? 'selected' : '';
                    cabinetOptions += '<option value="' +
                        utils.escapeHtml(cab.cabinet_number) + '" ' +
                        selected + '>' +
                        utils.escapeHtml(
                            cab.cabinet_number +
                            (cab.description ? ' - ' + cab.description : '')
                        ) + '</option>';
                });

                Swal.fire({
                    title: 'Редактировать запись',
                    html: buildCartridgeForm(cabinetOptions, data),
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    didOpen: function() { initDatesHandlers(); },
                    preConfirm: function() { return collectCartridgeForm(); },
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    putCartridge(cartridgeId, result.value);
                });
            });
    }

    function buildCartridgeForm(cabinetOptions, data) {
        data = data || {};
        var datesHtml = '';

        if (data.replacement_dates && data.replacement_dates.length > 0) {
            var reversed = data.replacement_dates.slice().sort().reverse();
            reversed.forEach(function(date) {
                var dateValue = date.trim().replace(' ', 'T').substring(0, 16);
                datesHtml += '<div class="input-group mb-2">' +
                    '<input type="datetime-local" ' +
                    'class="form-control date-input" value="' +
                    dateValue + '">' +
                    '<button type="button" ' +
                    'class="btn btn-outline-danger" ' +
                    'onclick="removeDateField(this)">' +
                    '<i class="bi bi-trash"></i></button>' +
                    '</div>';
            });
        } else {
            // По умолчанию — одно ПУСТОЕ поле (необязательное)
            datesHtml =
                '<div class="input-group mb-2">' +
                '<input type="datetime-local" ' +
                'class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" ' +
                'onclick="removeDateField(this)">' +
                '<i class="bi bi-trash"></i></button>' +
                '</div>';
        }

        return '<div class="mb-3 text-start">' +
            '<label class="form-label">Кабинет *</label>' +
            '<select id="swal-cabinet" class="form-control">' +
            '<option value="">Выберите кабинет</option>' +
            cabinetOptions + '</select></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">ФИО</label>' +
            '<input id="swal-fullname" class="form-control" value="' +
            utils.escapeHtml(data.full_name || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Принтер *</label>' +
            '<input id="swal-printer" class="form-control" value="' +
            utils.escapeHtml(data.printer || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Картридж *</label>' +
            '<input id="swal-cartridge" class="form-control" value="' +
            utils.escapeHtml(data.cartridge || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">' +
            'Даты замены <small class="text-muted">' +
            '(необязательно — можно оставить пустым)</small>' +
            '</label>' +
            '<button type="button" ' +
            'class="btn btn-sm btn-outline-primary mb-2 w-100" ' +
            'onclick="addDateField()">' +
            '<i class="bi bi-plus"></i> Добавить дату</button>' +
            '<div id="dates-container" ' +
            'style="max-height:200px;overflow-y:auto;padding:8px;' +
            'border:1px solid #dee2e6;border-radius:5px;">' +
            datesHtml + '</div>' +
            '<small class="text-muted d-block mt-1">' +
            '💡 Если дата ещё не известна — оставьте поле пустым. ' +
            'Запись сохранится, дату можно указать позже.' +
            '</small></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2">' +
            utils.escapeHtml(data.notes || '') + '</textarea></div>';
    }

    function initDatesHandlers() {
        window.addDateField = function() {
            var c = document.getElementById('dates-container');
            if (!c) return;
            var div = document.createElement('div');
            div.className = 'input-group mb-2';
            div.innerHTML =
                '<input type="datetime-local" ' +
                'class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" ' +
                'onclick="removeDateField(this)">' +
                '<i class="bi bi-trash"></i></button>';
            c.insertBefore(div, c.firstChild);
            c.scrollTop = 0;
        };
        window.removeDateField = function(btn) {
            var c = document.getElementById('dates-container');
            if (c.children.length > 1) {
                btn.closest('.input-group').remove();
            } else {
                // Если последнее — просто очистим
                var input = c.querySelector('.date-input');
                if (input) input.value = '';
            }
        };
    }

    function collectCartridgeForm() {
        var cabinet = document.getElementById('swal-cabinet').value;
        var printer = document.getElementById('swal-printer').value.trim();
        var cartridge = document.getElementById('swal-cartridge').value.trim();

        if (!cabinet || !printer || !cartridge) {
            Swal.showValidationMessage(
                'Заполните обязательные поля: Кабинет, Принтер, Картридж'
            );
            return false;
        }

        // Даты — опциональные. Ищем только внутри своей формы.
        var dates = [];
        document.querySelectorAll('#dates-container .date-input')
            .forEach(function(input) {
                var v = (input.value || '').trim();
                if (v) dates.push(v.replace('T', ' ') + ':00');
            });

        return {
            cabinet: cabinet,
            full_name: document.getElementById('swal-fullname').value.trim(),
            printer: printer,
            cartridge: cartridge,
            replacement_dates: dates,  // может быть []
            notes: document.getElementById('swal-notes').value.trim(),
        };
    }

    function postCartridge(data) {
        api.post('/api/cartridges', data)
            .then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Запись добавлена!',
                        text: data.replacement_dates.length === 0
                            ? 'Дату замены можно указать позже'
                            : '',
                        timer: 1800,
                        showConfirmButton: false,
                    });
                    loadCartridgesPage();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error,
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось сохранить',
                });
            });
    }

    function putCartridge(id, data) {
        api.put('/api/cartridges/' + id, data)
            .then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Запись обновлена!',
                        timer: 1500,
                        showConfirmButton: false,
                    });
                    loadCartridgesPage();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error,
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось сохранить',
                });
            });
    }

    function deleteCartridge(id) {
        Swal.fire({
            title: 'Удалить запись?',
            text: 'Действие нельзя отменить',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(result) {
            if (!result.isConfirmed) return;
            api.delete('/api/cartridges/' + id)
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Удалено!',
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        loadCartridgesPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    function clearCartridgeDates(id) {
        Swal.fire({
            title: 'Очистить даты?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Отмена',
        }).then(function(result) {
            if (!result.isConfirmed) return;
            api.post('/api/cartridges/' + id + '/clear-dates')
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Даты очищены!',
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        loadCartridgesPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = loadCartridgesPage;
    mod.showAdd = showAddCartridgeModal;
    mod.edit = editCartridge;
    mod.remove = deleteCartridge;
    mod.clearDates = clearCartridgeDates;
    mod.showMonthDetails = showCartridgeMonthDetails;
    mod.filter = filterCartridgesTable;

    window.loadCartridgesPage = loadCartridgesPage;
    window.showAddCartridgeModal = showAddCartridgeModal;
    window.editCartridge = editCartridge;
    window.deleteCartridge = deleteCartridge;
    window.clearCartridgeDates = clearCartridgeDates;
    window.showCartridgeMonthDetails = showCartridgeMonthDetails;
    window.filterCartridgesTable = filterCartridgesTable;

    console.log('[cartridges] Загружено');
})();