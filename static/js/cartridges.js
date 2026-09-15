// static/js/cartridges.js

// ============= ЗАГРУЗКА СТРАНИЦЫ КАРТРИДЖЕЙ =============
function loadCartridgesPage() {
    console.log('Loading cartridges page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
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
            $contentBlock.html('<div class="alert alert-danger">' + cartridges.error + '</div>');
            return;
        }

        var html = '';

        // Подключаем стили для аналитики
        html += renderCartridgeStyles();

        // ====== Блок KPI ======
        if (!stats.error) {
            html += '<div class="row mb-3 g-3">';
            html += kpiCard('Всего записей', stats.total, 'bi-clipboard-data', 'primary');
            html += kpiCard('Всего замен', stats.total_replacements, 'bi-arrow-repeat', 'success');
            html += kpiCard('Замен за месяц', stats.month_replacements, 'bi-calendar-month', 'info');
            html += kpiCard('Замен за год', stats.year_replacements, 'bi-calendar-check', 'warning');
            html += '</div>';
        }

        // ====== Аналитика по месяцам ======
        if (!monthly.error && monthly.months) {
            html += renderMonthlyChart(monthly);
        }

        // ====== Аналитика по годам ======
        if (!monthly.error && monthly.years && monthly.years.length > 0) {
            html += renderYearlyStats(monthly);
        }

        // ====== Топ кабинетов ======
        if (!stats.error && stats.cabinet_stats && stats.cabinet_stats.length > 0) {
            html += renderCabinetStats(stats);
        }

        // ====== Таблица ======
        html += renderCartridgesTable(cartridges);

        $contentBlock.html(html);
    })
    .catch(function(error) {
        console.error('Error loading cartridges:', error);
        $contentBlock.html(
            '<div class="alert alert-danger">Ошибка загрузки картриджей: ' + error.message + '</div>'
        );
    });
}

// ============= СТИЛИ ДЛЯ АНАЛИТИКИ =============
function renderCartridgeStyles() {
    return ''
    + '<style>'
    + '.cart-kpi { border-radius: 14px; padding: 18px; color: white; position: relative; overflow: hidden; height: 100%; }'
    + '.cart-kpi .kpi-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 3.5rem; opacity: 0.2; }'
    + '.cart-kpi .kpi-value { font-size: 2rem; font-weight: 800; line-height: 1; }'
    + '.cart-kpi .kpi-label { font-size: 0.85rem; opacity: 0.9; margin-top: 6px; }'
    + '.cart-kpi.bg-grad-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }'
    + '.cart-kpi.bg-grad-success { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); }'
    + '.cart-kpi.bg-grad-info    { background: linear-gradient(135deg, #17a2b8 0%, #36b9cc 100%); }'
    + '.cart-kpi.bg-grad-warning { background: linear-gradient(135deg, #f6c23e 0%, #fd7e14 100%); }'

    // График
    + '.monthly-chart-wrap { background: var(--card-bg); border-radius: 14px; padding: 24px; border: 1px solid var(--border-color); box-shadow: 0 2px 10px rgba(0,0,0,0.04); }'
    + '.monthly-chart { display: flex; align-items: flex-end; justify-content: space-between; height: 260px; gap: 8px; padding: 20px 0 0; position: relative; }'
    + '.monthly-chart::before { content: ""; position: absolute; left: 0; right: 0; bottom: 40px; border-top: 1px dashed rgba(150,150,150,0.2); }'
    + '.chart-column { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 30px; position: relative; }'
    + '.chart-value { font-size: 0.85rem; font-weight: 700; color: #667eea; margin-bottom: 4px; min-height: 16px; }'
    + '.chart-bar { width: 100%; max-width: 42px; border-radius: 6px 6px 0 0; transition: all 0.6s cubic-bezier(.16,.8,.3,1); min-height: 4px; }'
    + '.chart-bar.chart-bar-active { background: linear-gradient(180deg, #667eea 0%, #764ba2 100%); box-shadow: 0 4px 12px rgba(102,126,234,0.35); }'
    + '.chart-bar.chart-bar-empty { background: rgba(150,150,150,0.15); }'
    + '.chart-column:hover .chart-bar.chart-bar-active { filter: brightness(1.15); transform: translateY(-2px); }'
    + '.chart-label { font-size: 0.7rem; color: #888; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.5px; }'
    + '.chart-column.current .chart-label { color: #667eea; font-weight: 700; }'
    + '.chart-column.current .chart-bar { box-shadow: 0 0 0 2px rgba(102,126,234,0.25), 0 4px 14px rgba(102,126,234,0.5); }'

    // Годовые карточки
    + '.year-chip { display: inline-flex; flex-direction: column; align-items: center; background: linear-gradient(135deg, #f6f8ff 0%, #eef1ff 100%); border: 1px solid #dde3f7; border-radius: 12px; padding: 12px 18px; margin: 4px; min-width: 90px; }'
    + '.year-chip .year { font-size: 0.85rem; color: #667eea; font-weight: 700; letter-spacing: 1px; }'
    + '.year-chip .count { font-size: 1.6rem; font-weight: 800; color: #2b2b3d; line-height: 1; }'
    + '.year-chip .label { font-size: 0.7rem; color: #888; }'

    // Топ кабинетов
    + '.cabinet-rank-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; transition: background-color 0.2s; }'
    + '.cabinet-rank-row:hover { background: rgba(102,126,234,0.06); }'
    + '.cabinet-rank-medal { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: white; flex-shrink: 0; }'
    + '.cabinet-rank-medal.medal-1 { background: linear-gradient(135deg, #ffd700 0%, #f0a500 100%); }'
    + '.cabinet-rank-medal.medal-2 { background: linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%); }'
    + '.cabinet-rank-medal.medal-3 { background: linear-gradient(135deg, #cd7f32 0%, #a05a1c 100%); }'
    + '.cabinet-rank-medal.medal-n { background: #e0e0e8; color: #666; }'
    + '.cabinet-rank-progress { flex: 1; height: 8px; background: #eef1f7; border-radius: 4px; overflow: hidden; }'
    + '.cabinet-rank-progress > div { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 4px; }'

    // Тёмная тема
    + '[data-theme="dark"] .year-chip { background: linear-gradient(135deg, #2a2a3a 0%, #232330 100%); border-color: #3a3a4a; }'
    + '[data-theme="dark"] .year-chip .count { color: #d0d0d8; }'
    + '[data-theme="dark"] .monthly-chart-wrap { background: var(--card-bg); }'
    + '[data-theme="dark"] .cabinet-rank-progress { background: #2a2a3a; }'
    + '</style>';
}

// ============= KPI КАРТОЧКА =============
function kpiCard(label, value, icon, color) {
    return ''
    + '<div class="col-6 col-md-3">'
    +   '<div class="cart-kpi bg-grad-' + color + '">'
    +     '<i class="bi ' + icon + ' kpi-icon"></i>'
    +     '<div class="kpi-value">' + value + '</div>'
    +     '<div class="kpi-label">' + label + '</div>'
    +   '</div>'
    + '</div>';
}

// ============= ГРАФИК ПО МЕСЯЦАМ =============
function renderMonthlyChart(data) {
    var months = data.months || [];
    var maxCount = data.max_month || 1;
    var currentMonth = new Date().toISOString().slice(0, 7);

    var html = ''
    + '<div class="monthly-chart-wrap mb-3">'
    +   '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">'
    +     '<h6 class="mb-0"><i class="bi bi-bar-chart-line text-primary"></i> Замены по месяцам <small class="text-muted">(последние 12 месяцев)</small></h6>'
    +     '<span class="badge bg-primary">Всего за период: ' + months.reduce(function(a, b) { return a + b.count; }, 0) + '</span>'
    +   '</div>'
    +   '<div class="monthly-chart">';

    months.forEach(function(m) {
        var heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0;
        var barClass = m.count > 0 ? 'chart-bar-active' : 'chart-bar-empty';
        var isCurrent = m.month === currentMonth;
        var colClass = isCurrent ? 'chart-column current' : 'chart-column';

        html += '<div class="' + colClass + '" title="' + m.month_full + ' ' + m.year + ': ' + m.count + ' замен">';
        html +=   '<div class="chart-value">' + (m.count > 0 ? m.count : '') + '</div>';
        html +=   '<div class="chart-bar ' + barClass + '" style="height: ' + Math.max(heightPct, 2) + '%"></div>';
        html +=   '<div class="chart-label">' + m.month_name + '</div>';
        html += '</div>';
    });

    html += '</div>';
    html += '</div>';

    return html;
}

// ============= ГОДОВАЯ СТАТИСТИКА =============
function renderYearlyStats(data) {
    var years = data.years || [];
    if (years.length === 0) return '';

    var html = ''
    + '<div class="monthly-chart-wrap mb-3">'
    +   '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">'
    +     '<h6 class="mb-0"><i class="bi bi-calendar3 text-success"></i> Замены по годам</h6>'
    +     '<span class="badge bg-success">Всего за всё время: ' + data.total_all_time + '</span>'
    +   '</div>'
    +   '<div class="d-flex flex-wrap">';

    years.forEach(function(y) {
        html += ''
        + '<div class="year-chip">'
        +   '<div class="year">' + y.year + '</div>'
        +   '<div class="count">' + y.count + '</div>'
        +   '<div class="label">' + pluralize(y.count, 'замена', 'замены', 'замен') + '</div>'
        + '</div>';
    });

    html += '</div>';
    html += '</div>';

    return html;
}

// ============= ТОП КАБИНЕТОВ =============
function renderCabinetStats(stats) {
    var cabinets = stats.cabinet_stats || [];
    if (cabinets.length === 0) return '';

    // Берём топ-10
    var top = cabinets.slice(0, 10);
    var maxCount = Math.max.apply(null, top.map(function(c) { return c.replacements; })) || 1;

    var html = ''
    + '<div class="monthly-chart-wrap mb-3">'
    +   '<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">'
    +     '<h6 class="mb-0"><i class="bi bi-door-open text-info"></i> Топ-10 кабинетов по количеству замен</h6>'
    +     '<span class="badge bg-info">Кабинетов с заменами: ' + cabinets.length + '</span>'
    +   '</div>';

    top.forEach(function(cab, index) {
        var medalClass = index === 0 ? 'medal-1' : index === 1 ? 'medal-2' : index === 2 ? 'medal-3' : 'medal-n';
        var progressPct = (cab.replacements / maxCount) * 100;

        html += ''
        + '<div class="cabinet-rank-row">'
        +   '<div class="cabinet-rank-medal ' + medalClass + '">' + (index + 1) + '</div>'
        +   '<div style="min-width: 120px;"><strong>' + cab.cabinet + '</strong></div>'
        +   '<div class="cabinet-rank-progress"><div style="width: ' + progressPct + '%"></div></div>'
        +   '<div style="min-width: 90px; text-align: right;">'
        +     '<span class="badge bg-primary">' + cab.replacements + ' ' + pluralize(cab.replacements, 'замена', 'замены', 'замен') + '</span>'
        +   '</div>'
        + '</div>';
    });

    html += '</div>';
    return html;
}

// ============= ТАБЛИЦА КАРТРИДЖЕЙ =============
function renderCartridgesTable(cartridges) {
    var html = ''
    + '<div class="card">'
    +   '<div class="card-header bg-primary text-white">'
    +     '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">'
    +       '<h5 class="mb-0"><i class="bi bi-printer"></i> Замена картриджей</h5>'
    +       '<div class="d-flex gap-2">'
    +         '<button class="btn btn-sm btn-light" onclick="loadCartridgesPage()">'
    +           '<i class="bi bi-arrow-clockwise"></i> Обновить</button>'
    +         '<button class="btn btn-sm btn-success" onclick="showAddCartridgeModal()">'
    +           '<i class="bi bi-plus-circle"></i> Добавить</button>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="card-body">'
    +     '<div class="table-responsive">'
    +       '<table class="table table-striped table-hover align-middle">'
    +         '<thead><tr>'
    +           '<th>ID</th>'
    +           '<th>Кабинет</th>'
    +           '<th>ФИО</th>'
    +           '<th>Принтер</th>'
    +           '<th>Картридж</th>'
    +           '<th>Даты замены</th>'
    +           '<th>Примечание</th>'
    +           '<th>Действия</th>'
    +         '</tr></thead><tbody>';

    if (cartridges.length === 0) {
        html += '<tr><td colspan="8" class="text-center text-muted py-4">Нет записей</td></tr>';
    } else {
        cartridges.forEach(function(cart) {
            var datesHtml = '';
            if (cart.replacement_dates && cart.replacement_dates.length > 0) {
                datesHtml = '<ul class="list-unstyled mb-0 small">';
                // Самая свежая дата — сверху
                var sortedDates = cart.replacement_dates.slice().sort().reverse();
                sortedDates.forEach(function(date, idx) {
                    var isLatest = idx === 0;
                    datesHtml += '<li class="' + (isLatest ? 'text-success fw-bold' : '') + '">'
                        + (isLatest ? '<i class="bi bi-star-fill"></i> ' : '')
                        + formatDate(date) + '</li>';
                });
                datesHtml += '</ul>';
            } else {
                datesHtml = '<span class="text-muted">Не указаны</span>';
            }

            html += '<tr>';
            html += '<td>' + cart.id + '</td>';
            html += '<td>' + (cart.cabinet || '-') + '</td>';
            html += '<td>' + (cart.full_name || '-') + '</td>';
            html += '<td>' + (cart.printer || '-') + '</td>';
            html += '<td>' + (cart.cartridge || '-') + '</td>';
            html += '<td>' + datesHtml + '</td>';
            html += '<td>' + (cart.notes || '-') + '</td>';
            html += '<td>';
            html += '<div class="btn-group btn-group-sm">';
            html += '<button class="btn btn-outline-success" onclick="editCartridge(' + cart.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
            html += '<button class="btn btn-outline-danger" onclick="deleteCartridge(' + cart.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
            html += '<button class="btn btn-outline-warning" onclick="clearCartridgeDates(' + cart.id + ')" title="Очистить даты"><i class="bi bi-calendar-x"></i></button>';
            html += '</div>';
            html += '</td>';
            html += '</tr>';
        });
    }

    html += '</tbody></table></div></div></div>';
    return html;
}

// ============= СКЛОНЕНИЕ СЛОВ =============
function pluralize(n, one, few, many) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
}

// ============= МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ КАРТРИДЖА =============
function showAddCartridgeModal() {
    fetch('/api/cabinets')
        .then(function(r) { return r.json(); })
        .then(function(cabinets) {
            var cabinetOptions = '';
            cabinets.forEach(function(cab) {
                cabinetOptions += '<option value="' + cab.cabinet_number + '">'
                    + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
            });

            Swal.fire({
                title: 'Добавить запись о замене картриджа',
                html:
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Кабинет *</label>' +
                    '<select id="swal-cabinet" class="form-control">' +
                    '<option value="">Выберите кабинет</option>' +
                    cabinetOptions +
                    '</select>' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">ФИО</label>' +
                    '<input id="swal-fullname" class="form-control" placeholder="Например: Иванов И.И.">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Принтер *</label>' +
                    '<input id="swal-printer" class="form-control" placeholder="Модель принтера">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Картридж *</label>' +
                    '<input id="swal-cartridge" class="form-control" placeholder="Модель картриджа">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Даты замены</label>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary mb-2 w-100" onclick="addDateField()">' +
                    '<i class="bi bi-plus"></i> Добавить дату' +
                    '</button>' +
                    '<div id="dates-container" style="max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">' +
                    '<div class="input-group mb-2">' +
                    '<input type="datetime-local" class="form-control date-input">' +
                    '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Примечание</label>' +
                    '<textarea id="swal-notes" class="form-control" rows="2" placeholder="Примечание"></textarea>' +
                    '</div>',
                showCancelButton: true,
                confirmButtonText: 'Добавить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                customClass: { popup: 'swal-wide' },
                didOpen: function() {
                    window.addDateField = function() {
                        var container = document.getElementById('dates-container');
                        var div = document.createElement('div');
                        div.className = 'input-group mb-2';
                        div.innerHTML = '<input type="datetime-local" class="form-control date-input"><button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>';
                        container.insertBefore(div, container.firstChild);
                        container.scrollTop = 0;
                        setTimeout(function() { div.querySelector('input').focus(); }, 100);
                    };
                    window.removeDateField = function(btn) {
                        var container = document.getElementById('dates-container');
                        if (container.children.length > 1) btn.closest('.input-group').remove();
                    };
                },
                preConfirm: function() {
                    var cabinet = document.getElementById('swal-cabinet').value;
                    var printer = document.getElementById('swal-printer').value.trim();
                    var cartridge = document.getElementById('swal-cartridge').value.trim();

                    if (!cabinet || !printer || !cartridge) {
                        Swal.showValidationMessage('Заполните обязательные поля (Кабинет, Принтер, Картридж)');
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
            }).then(function(result) {
                if (result.isConfirmed) {
                    fetch('/api/cartridges', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            Swal.fire({ icon: 'success', title: 'Запись добавлена!', timer: 1500, showConfirmButton: false });
                            loadCartridgesPage();
                        } else {
                            Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                        }
                    });
                }
            });
        });
}

// ============= РЕДАКТИРОВАНИЕ =============
function editCartridge(cartridgeId) {
    Promise.all([
        fetch('/api/cartridges/' + cartridgeId).then(function(r) { return r.json(); }),
        fetch('/api/cabinets').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var data = results[0];
        var cabinets = results[1];

        if (data.error) { showErrorMessage(data.error); return; }

        var cabinetOptions = '';
        cabinets.forEach(function(cab) {
            var selected = (cab.cabinet_number === data.cabinet) ? 'selected' : '';
            cabinetOptions += '<option value="' + cab.cabinet_number + '" ' + selected + '>'
                + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
        });

        var datesHtml = '<button type="button" class="btn btn-sm btn-outline-primary mb-2 w-100" onclick="addDateField()">' +
            '<i class="bi bi-plus"></i> Добавить дату</button>' +
            '<div id="dates-container" style="max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">';

        if (data.replacement_dates && data.replacement_dates.length > 0) {
            var reversedDates = data.replacement_dates.slice().sort().reverse();
            reversedDates.forEach(function(date) {
                var dateValue = date.trim().replace(' ', 'T').substring(0, 16);
                datesHtml += '<div class="input-group mb-2">';
                datesHtml += '<input type="datetime-local" class="form-control date-input" value="' + dateValue + '">';
                datesHtml += '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>';
                datesHtml += '</div>';
            });
        } else {
            datesHtml += '<div class="input-group mb-2">';
            datesHtml += '<input type="datetime-local" class="form-control date-input">';
            datesHtml += '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>';
            datesHtml += '</div>';
        }
        datesHtml += '</div>';

        Swal.fire({
            title: 'Редактировать запись',
            html:
                '<div class="mb-3 text-start"><label class="form-label">Кабинет *</label>' +
                '<select id="swal-cabinet" class="form-control"><option value="">Выберите кабинет</option>' + cabinetOptions + '</select></div>' +
                '<div class="mb-3 text-start"><label class="form-label">ФИО</label>' +
                '<input id="swal-fullname" class="form-control" value="' + (data.full_name || '') + '"></div>' +
                '<div class="mb-3 text-start"><label class="form-label">Принтер *</label>' +
                '<input id="swal-printer" class="form-control" value="' + (data.printer || '') + '"></div>' +
                '<div class="mb-3 text-start"><label class="form-label">Картридж *</label>' +
                '<input id="swal-cartridge" class="form-control" value="' + (data.cartridge || '') + '"></div>' +
                '<div class="mb-3 text-start"><label class="form-label">Даты замены</label>' + datesHtml + '</div>' +
                '<div class="mb-3 text-start"><label class="form-label">Примечание</label>' +
                '<textarea id="swal-notes" class="form-control" rows="2">' + (data.notes || '') + '</textarea></div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                window.addDateField = function() {
                    var container = document.getElementById('dates-container');
                    var div = document.createElement('div');
                    div.className = 'input-group mb-2';
                    div.innerHTML = '<input type="datetime-local" class="form-control date-input"><button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)"><i class="bi bi-trash"></i></button>';
                    container.insertBefore(div, container.firstChild);
                    container.scrollTop = 0;
                };
                window.removeDateField = function(btn) {
                    var container = document.getElementById('dates-container');
                    if (container.children.length > 1) btn.closest('.input-group').remove();
                };
            },
            preConfirm: function() {
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
        }).then(function(result) {
            if (result.isConfirmed) {
                fetch('/api/cartridges/' + cartridgeId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Запись обновлена!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
            }
        });
    });
}

// ============= УДАЛЕНИЕ =============
function deleteCartridge(cartridgeId) {
    Swal.fire({
        title: 'Удалить запись?',
        text: 'Это действие нельзя отменить!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/cartridges/' + cartridgeId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Запись удалена!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        showErrorMessage(data.error);
                    }
                });
        }
    });
}

// ============= ОЧИСТКА ДАТ =============
function clearCartridgeDates(cartridgeId) {
    Swal.fire({
        title: 'Очистить даты?',
        text: 'Даты замены будут очищены для этой записи.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, очистить',
        cancelButtonText: 'Отмена'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/cartridges/' + cartridgeId + '/clear-dates', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Даты очищены!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        showErrorMessage(data.error);
                    }
                });
        }
    });
}

console.log('Cartridges module loaded');