// static/js/cartridges.js
// Картриджи: список, статистика, аналитика

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cartridges] App не инициализирован');
        return;
    }

    var api = window.App.register('Cartridges');
    var utils = window.App.utils;

    // Кеш всех картриджей — для быстрого поиска деталей по месяцу
    var cartridgesCache = [];

    var MONTH_FULL_RU = [
        '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    // ============= ГЛАВНАЯ =============
    function loadCartridgesPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка картриджей...</p>' +
            '</div>'
        );

        Promise.all([
            fetch('/api/cartridges').then(function(r) { return r.json(); }),
            fetch('/api/cartridges/statistics').then(function(r) { return r.json(); }),
            fetch('/api/cartridges/statistics/monthly').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var cartridges = results[0];
                var stats = results[1];
                var monthly = results[2];

                if (cartridges.error) {
                    $contentBlock.html('<div class="alert alert-danger">' + utils.escapeHtml(cartridges.error) + '</div>');
                    return;
                }

                // Кешируем для клика по графику
                cartridgesCache = cartridges || [];

                var html = renderStyles();

                // KPI-карточки
                if (!stats.error) {
                    html += '<div class="row mb-3 g-3">';
                    html += kpiCard('Всего записей', stats.total, 'bi-clipboard-data', 'primary');
                    html += kpiCard('Всего замен', stats.total_replacements, 'bi-arrow-repeat', 'success');
                    html += kpiCard('Замен за месяц', stats.month_replacements, 'bi-calendar-month', 'info');
                    html += kpiCard('Замен за год', stats.year_replacements, 'bi-calendar-check', 'warning');
                    html += '</div>';
                }

                // График по месяцам
                if (!monthly.error && monthly.months) {
                    html += renderMonthlyChart(monthly);
                }

                // Таблица
                html += renderTable(cartridges);

                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[cartridges] load error:', error);
                $contentBlock.html('<div class="alert alert-danger">Ошибка загрузки: ' + utils.escapeHtml(error.message) + '</div>');
            });
    }

    // ============= СТИЛИ =============
    function renderStyles() {
        return '<style>' +
            '.cart-kpi{border-radius:14px;padding:18px;color:white;position:relative;overflow:hidden;height:100%}' +
            '.cart-kpi .kpi-icon{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:3.5rem;opacity:.2}' +
            '.cart-kpi .kpi-value{font-size:2rem;font-weight:800;line-height:1}' +
            '.cart-kpi .kpi-label{font-size:.85rem;opacity:.9;margin-top:6px}' +
            '.cart-kpi.bg-grad-primary{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}' +
            '.cart-kpi.bg-grad-success{background:linear-gradient(135deg,#28a745 0%,#20c997 100%)}' +
            '.cart-kpi.bg-grad-info{background:linear-gradient(135deg,#17a2b8 0%,#36b9cc 100%)}' +
            '.cart-kpi.bg-grad-warning{background:linear-gradient(135deg,#f6c23e 0%,#fd7e14 100%)}' +
            '.monthly-chart-wrap{background:var(--card-bg);border-radius:14px;padding:24px;border:1px solid var(--border-color);box-shadow:0 2px 10px rgba(0,0,0,.04);margin-bottom:20px}' +
            '.monthly-chart{display:flex;align-items:flex-end;justify-content:space-between;height:260px;gap:8px;padding:20px 0 0;position:relative}' +
            '.monthly-chart::before{content:"";position:absolute;left:0;right:0;bottom:40px;border-top:1px dashed rgba(150,150,150,.2)}' +
            '.chart-column{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:30px;position:relative;cursor:pointer;border-radius:6px;padding:4px 0;transition:background-color .15s}' +
            '.chart-column:hover{background-color:rgba(102,126,234,.08)}' +
            '.chart-value{font-size:.85rem;font-weight:700;color:#667eea;margin-bottom:4px;min-height:16px}' +
            '.chart-bar{width:100%;max-width:42px;border-radius:6px 6px 0 0;transition:all .6s cubic-bezier(.16,.8,.3,1);min-height:4px}' +
            '.chart-bar.chart-bar-active{background:linear-gradient(180deg,#667eea 0%,#764ba2 100%);box-shadow:0 4px 12px rgba(102,126,234,.35)}' +
            '.chart-bar.chart-bar-empty{background:rgba(150,150,150,.15)}' +
            '.chart-column:hover .chart-bar.chart-bar-active{filter:brightness(1.15);transform:translateY(-2px)}' +
            '.chart-label{font-size:.7rem;color:#888;margin-top:8px;text-transform:uppercase;letter-spacing:.5px}' +
            '.chart-column.current .chart-label{color:#667eea;font-weight:700}' +
            '.chart-column.current .chart-bar{box-shadow:0 0 0 2px rgba(102,126,234,.25),0 4px 14px rgba(102,126,234,.5)}' +
            '.chart-empty{color:#aaa;font-size:.75rem;margin-top:-6px}' +
            '.cart-month-table{width:100%;font-size:.85rem;border-collapse:collapse}' +
            '.cart-month-table th{background:#f6f8ff;color:#4a5478;padding:8px 10px;text-align:left;font-weight:600;border-bottom:2px solid #dde3f7;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px}' +
            '.cart-month-table td{padding:8px 10px;border-bottom:1px solid #eef1f7;vertical-align:top;color:#333}' +
            '.cart-month-table tr:hover td{background:#f8faff}' +
            '.cart-month-table .cart-date{font-weight:600;color:#667eea;white-space:nowrap;font-size:.78rem}' +
            '.cart-month-table .cart-cabinet{font-weight:600}' +
            '[data-theme="dark"] .cart-month-table th{background:#2a2a3a;color:#c0c0d0;border-color:#3a3a4a}' +
            '[data-theme="dark"] .cart-month-table td{border-color:#2a2a3a;color:#d0d0d8}' +
            '[data-theme="dark"] .cart-month-table tr:hover td{background:#2f2f3a}' +
            '[data-theme="dark"] .chart-column:hover{background-color:rgba(139,155,255,.1)}' +
            '</style>';
    }

    function kpiCard(label, value, icon, color) {
        return '<div class="col-6 col-md-3">' +
            '<div class="cart-kpi bg-grad-' + color + '">' +
            '<i class="bi ' + icon + ' kpi-icon"></i>' +
            '<div class="kpi-value">' + (value || 0) + '</div>' +
            '<div class="kpi-label">' + label + '</div>' +
            '</div></div>';
    }

    // ============= ГРАФИК ПО МЕСЯЦАМ =============
    function renderMonthlyChart(data) {
        var months = data.months || [];
        var maxCount = data.max_month || 1;
        var currentMonth = new Date().toISOString().slice(0, 7);
        var sum = months.reduce(function(a, b) { return a + (b.count || 0); }, 0);

        var html = '<div class="monthly-chart-wrap">' +
            '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">' +
            '<h6 class="mb-0"><i class="bi bi-bar-chart-line text-primary"></i> Замены по месяцам ' +
            '<small class="text-muted">(последние 12, кликните на столбик)</small></h6>' +
            '<span class="badge bg-primary">Всего за период: ' + sum + '</span></div>' +
            '<div class="monthly-chart">';

        months.forEach(function(m) {
            var heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
            var barClass = m.count > 0 ? 'chart-bar-active' : 'chart-bar-empty';
            var isCurrent = m.month === currentMonth;
            var colClass = isCurrent ? 'chart-column current' : 'chart-column';

            html += '<div class="' + colClass + '" ' +
                    'onclick="showCartridgeMonthDetails(\'' + m.month + '\')" ' +
                    'title="' + m.month_full + ' ' + m.year + ': ' + m.count + ' замен — кликните для деталей">';
            html += '<div class="chart-value">' + (m.count > 0 ? m.count : '') + '</div>';
            html += '<div class="chart-bar ' + barClass + '" style="height:' + Math.max(heightPct, 2) + '%"></div>';
            html += '<div class="chart-label">' + m.month_name + '</div>';
            html += '</div>';
        });

        html += '</div></div>';
        return html;
    }

    // ============= ДЕТАЛИ МЕСЯЦА (клик по графику) =============
    function showCartridgeMonthDetails(monthKey) {
        // monthKey = 'YYYY-MM'
        var parts = (monthKey || '').split('-');
        if (parts.length !== 2) return;

        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var monthName = MONTH_FULL_RU[month] || monthKey;

        // Собираем все замены за этот месяц
        var replacements = [];

        cartridgesCache.forEach(function(cart) {
            if (!cart.replacement_dates || cart.replacement_dates.length === 0) return;

            cart.replacement_dates.forEach(function(dateStr) {
                if (!dateStr) return;
                var d = String(dateStr).trim();
                // ожидаемый формат: 'YYYY-MM-DD HH:MM:SS'
                if (d.indexOf(monthKey) === 0) {
                    replacements.push({
                        date: d,
                        cabinet: cart.cabinet || '-',
                        printer: cart.printer || '-',
                        cartridge: cart.cartridge || '-',
                        full_name: cart.full_name || '',
                        notes: cart.notes || ''
                    });
                }
            });
        });

        // Сортируем по дате (сначала свежие)
        replacements.sort(function(a, b) {
            return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
        });

        if (replacements.length === 0) {
            Swal.fire({
                icon: 'info',
                title: monthName + ' ' + year,
                text: 'В этом месяце замен не было',
                confirmButtonText: 'Закрыть'
            });
            return;
        }

        // Группируем по кабинетам для сводки
        var byCabinet = {};
        replacements.forEach(function(r) {
            byCabinet[r.cabinet] = (byCabinet[r.cabinet] || 0) + 1;
        });

        var cabinetsCount = Object.keys(byCabinet).length;

        // Таблица
        var rowsHtml = '';
        replacements.forEach(function(r) {
            // Форматируем дату как ДД.ММ.ГГГГ
            var dateFmt = r.date;
            try {
                var dt = new Date(r.date.replace(' ', 'T'));
                if (!isNaN(dt.getTime())) {
                    dateFmt = String(dt.getDate()).padStart(2, '0') + '.' +
                              String(dt.getMonth() + 1).padStart(2, '0') + '.' +
                              dt.getFullYear() +
                              ' ' +
                              String(dt.getHours()).padStart(2, '0') + ':' +
                              String(dt.getMinutes()).padStart(2, '0');
                }
            } catch (e) {}

            rowsHtml += '<tr>';
            rowsHtml += '<td class="cart-date">' + utils.escapeHtml(dateFmt) + '</td>';
            rowsHtml += '<td class="cart-cabinet">' + utils.escapeHtml(r.cabinet) + '</td>';
            rowsHtml += '<td>' + utils.escapeHtml(r.printer) + '</td>';
            rowsHtml += '<td>' + utils.escapeHtml(r.cartridge) + '</td>';
            rowsHtml += '</tr>';
        });

        // Сводка по кабинетам
        var cabinetSummary = Object.keys(byCabinet).sort(function(a, b) {
            return byCabinet[b] - byCabinet[a];
        }).map(function(c) {
            return '<span class="badge bg-primary me-1 mb-1" style="font-size:.75rem">' +
                utils.escapeHtml(c) + ': ' + byCabinet[c] + '</span>';
        }).join('');

        var html =
            '<div class="text-start">' +
            '<div class="row mb-3 g-2">' +
            '<div class="col-6">' +
            '<div class="p-2 rounded" style="background:rgba(102,126,234,.1)">' +
            '<div style="font-size:1.4rem;font-weight:800;color:#667eea">' + replacements.length + '</div>' +
            '<div style="font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Всего замен</div>' +
            '</div></div>' +
            '<div class="col-6">' +
            '<div class="p-2 rounded" style="background:rgba(40,167,69,.1)">' +
            '<div style="font-size:1.4rem;font-weight:800;color:#28a745">' + cabinetsCount + '</div>' +
            '<div style="font-size:.7rem;color:#888;text-transform:uppercase;letter-spacing:.5px">Кабинетов</div>' +
            '</div></div>' +
            '</div>' +
            '<div class="mb-3">' + cabinetSummary + '</div>' +
            '<div style="max-height:350px;overflow-y:auto;border-radius:8px;border:1px solid var(--border-color)">' +
            '<table class="cart-month-table mb-0">' +
            '<thead><tr>' +
            '<th>Дата</th><th>Кабинет</th><th>Принтер</th><th>Картридж</th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table>' +
            '</div>' +
            '</div>';

        Swal.fire({
            title: '<i class="bi bi-calendar3"></i> ' + monthName + ' ' + year,
            html: html,
            width: 720,
            confirmButtonText: 'Закрыть',
            customClass: { popup: 'swal-wide' }
        });
    }

    // ============= ТАБЛИЦА =============
    function renderTable(cartridges) {
        var html = '<div class="card">' +
            '<div class="card-header bg-primary text-white">' +
            '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">' +
            '<h5 class="mb-0"><i class="bi bi-printer"></i> Замена картриджей</h5>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-light" onclick="loadCartridgesPage()">' +
            '<i class="bi bi-arrow-clockwise"></i> Обновить</button>' +
            '<button class="btn btn-sm btn-success" onclick="showAddCartridgeModal()">' +
            '<i class="bi bi-plus-circle"></i> Добавить</button>' +
            '</div></div></div>' +
            '<div class="card-body"><div class="table-responsive">' +
            '<table class="table table-striped table-hover align-middle">' +
            '<thead><tr>' +
            '<th>ID</th><th>Кабинет</th><th>ФИО</th><th>Принтер</th>' +
            '<th>Картридж</th><th>Даты замены</th><th>Примечание</th><th>Действия</th>' +
            '</tr></thead><tbody>';

        if (cartridges.length === 0) {
            html += '<tr><td colspan="8" class="text-center text-muted py-4">Нет записей</td></tr>';
        } else {
            cartridges.forEach(function(cart) {
                var datesHtml = '';
                if (cart.replacement_dates && cart.replacement_dates.length > 0) {
                    var sortedDates = cart.replacement_dates.slice().sort().reverse();
                    datesHtml = '<ul class="list-unstyled mb-0 small">';
                    sortedDates.forEach(function(date, idx) {
                        var isLatest = idx === 0;
                        datesHtml += '<li class="' + (isLatest ? 'text-success fw-bold' : '') + '">' +
                            (isLatest ? '<i class="bi bi-star-fill"></i> ' : '') +
                            utils.formatDate(date) + '</li>';
                    });
                    datesHtml += '</ul>';
                } else {
                    datesHtml = '<span class="text-muted">Не указаны</span>';
                }

                html += '<tr>';
                html += '<td>' + cart.id + '</td>';
                html += '<td>' + utils.escapeHtml(cart.cabinet || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(cart.full_name || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(cart.printer || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(cart.cartridge || '-') + '</td>';
                html += '<td>' + datesHtml + '</td>';
                html += '<td>' + utils.escapeHtml(cart.notes || '-') + '</td>';
                html += '<td>';
                html += '<div class="btn-group btn-group-sm">';
                html += '<button class="btn btn-outline-success" onclick="editCartridge(' + cart.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
                html += '<button class="btn btn-outline-danger" onclick="deleteCartridge(' + cart.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
                html += '<button class="btn btn-outline-warning" onclick="clearCartridgeDates(' + cart.id + ')" title="Очистить даты"><i class="bi bi-calendar-x"></i></button>';
                html += '</div></td></tr>';
            });
        }

        html += '</tbody></table></div></div></div>';
        return html;
    }

    // ============= ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ =============
    function showAddCartridgeModal() {
        fetch('/api/cabinets')
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    cabinetOptions += '<option value="' + utils.escapeHtml(cab.cabinet_number) + '">' +
                        utils.escapeHtml(cab.cabinet_number + (cab.description ? ' - ' + cab.description : '')) +
                        '</option>';
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
                    preConfirm: function() { return collectCartridgeForm(); }
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    postCartridge(result.value);
                });
            });
    }

    function editCartridge(cartridgeId) {
        Promise.all([
            fetch('/api/cartridges/' + cartridgeId).then(function(r) { return r.json(); }),
            fetch('/api/cabinets').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var data = results[0];
                var cabinets = results[1];
                if (data.error) { utils.showErrorMessage(data.error); return; }

                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    var selected = (cab.cabinet_number === data.cabinet) ? 'selected' : '';
                    cabinetOptions += '<option value="' + utils.escapeHtml(cab.cabinet_number) + '" ' + selected + '>' +
                        utils.escapeHtml(cab.cabinet_number + (cab.description ? ' - ' + cab.description : '')) +
                        '</option>';
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
                    preConfirm: function() { return collectCartridgeForm(); }
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
                    '<input type="datetime-local" class="form-control date-input" value="' + dateValue + '">' +
                    '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>' +
                    '</div>';
            });
        } else {
            datesHtml = '<div class="input-group mb-2">' +
                '<input type="datetime-local" class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>' +
                '</div>';
        }

        return '<div class="mb-3 text-start"><label class="form-label">Кабинет *</label>' +
            '<select id="swal-cabinet" class="form-control">' +
            '<option value="">Выберите кабинет</option>' + cabinetOptions + '</select></div>' +
            '<div class="mb-3 text-start"><label class="form-label">ФИО</label>' +
            '<input id="swal-fullname" class="form-control" value="' + utils.escapeHtml(data.full_name || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Принтер *</label>' +
            '<input id="swal-printer" class="form-control" value="' + utils.escapeHtml(data.printer || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Картридж *</label>' +
            '<input id="swal-cartridge" class="form-control" value="' + utils.escapeHtml(data.cartridge || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Даты замены</label>' +
            '<button type="button" class="btn btn-sm btn-outline-primary mb-2 w-100" onclick="addDateField()">' +
            '<i class="bi bi-plus"></i> Добавить дату</button>' +
            '<div id="dates-container" style="max-height:200px;overflow-y:auto;padding:8px;border:1px solid #dee2e6;border-radius:5px;">' +
            datesHtml + '</div></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2">' + utils.escapeHtml(data.notes || '') + '</textarea></div>';
    }

    function initDatesHandlers() {
        window.addDateField = function() {
            var c = document.getElementById('dates-container');
            var div = document.createElement('div');
            div.className = 'input-group mb-2';
            div.innerHTML = '<input type="datetime-local" class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>';
            c.insertBefore(div, c.firstChild);
            c.scrollTop = 0;
        };
        window.removeDateField = function(btn) {
            var c = document.getElementById('dates-container');
            if (c.children.length > 1) btn.closest('.input-group').remove();
        };
    }

    function collectCartridgeForm() {
        var cabinet = document.getElementById('swal-cabinet').value;
        var printer = document.getElementById('swal-printer').value.trim();
        var cartridge = document.getElementById('swal-cartridge').value.trim();

        if (!cabinet || !printer || !cartridge) {
            Swal.showValidationMessage('Заполните обязательные поля');
            return false;
        }

        var dates = [];
        document.querySelectorAll('.date-input').forEach(function(input) {
            if (input.value) dates.push(input.value.replace('T', ' ') + ':00');
        });

        return {
            cabinet: cabinet,
            full_name: document.getElementById('swal-fullname').value.trim(),
            printer: printer,
            cartridge: cartridge,
            replacement_dates: dates,
            notes: document.getElementById('swal-notes').value.trim()
        };
    }

    function postCartridge(data) {
        fetch('/api/cartridges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    Swal.fire({ icon: 'success', title: 'Запись добавлена!', timer: 1500, showConfirmButton: false });
                    loadCartridgesPage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: res.error });
                }
            });
    }

    function putCartridge(id, data) {
        fetch('/api/cartridges/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    Swal.fire({ icon: 'success', title: 'Запись обновлена!', timer: 1500, showConfirmButton: false });
                    loadCartridgesPage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: res.error });
                }
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
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/cartridges/' + id, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Удалено!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    function clearCartridgeDates(id) {
        Swal.fire({
            title: 'Очистить даты?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Отмена'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/cartridges/' + id + '/clear-dates', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Даты очищены!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.load = loadCartridgesPage;
    api.showAdd = showAddCartridgeModal;
    api.edit = editCartridge;
    api.remove = deleteCartridge;
    api.clearDates = clearCartridgeDates;
    api.showMonthDetails = showCartridgeMonthDetails;

    window.loadCartridgesPage = loadCartridgesPage;
    window.showAddCartridgeModal = showAddCartridgeModal;
    window.editCartridge = editCartridge;
    window.deleteCartridge = deleteCartridge;
    window.clearCartridgeDates = clearCartridgeDates;
    window.showCartridgeMonthDetails = showCartridgeMonthDetails;

    console.log('[cartridges] Загружено');
})();