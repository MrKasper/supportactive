// static/js/dashboard.js
// Дашборд руководителя: KPI, графики и списки.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[dashboard] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    if (!api || typeof api.get !== 'function') {
        console.error('[dashboard] App.api не загружен');
        return;
    }

    var chartMonthly = null;
    var chartStatuses = null;

    // ============================================================
    // KPI-карточка
    // ============================================================
    function kpiCard(label, value, icon, color, suffix) {
        suffix = suffix || '';
        var schemes = {
            primary:   { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', text: '#fff' },
            info:      { bg: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', text: '#fff' },
            warning:   { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#fff' },
            success:   { bg: 'linear-gradient(135deg, #10b981, #059669)', text: '#fff' },
            danger:    { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', text: '#fff' },
            secondary: { bg: 'linear-gradient(135deg, #64748b, #475569)', text: '#fff' },
        };
        var s = schemes[color] || schemes.primary;

        return '<div class="cart-kpi" ' +
            'style="background:' + s.bg + '; color:' + s.text + ';">' +
            '<i class="bi ' + icon + ' kpi-icon"></i>' +
            '<div class="kpi-value">' + value + suffix + '</div>' +
            '<div class="kpi-label">' + label + '</div>' +
            '</div>';
    }

    // ============================================================
    // СВОДКА
    // ============================================================
    function loadSummary() {
        api.get('/api/dashboard/summary')
            .then(function(s) {
                if (!s || s.error) {
                    $('#dash-kpi').html(
                        '<div class="col-12"><div class="alert alert-danger">' +
                        'Не удалось загрузить: ' +
                        utils.escapeHtml((s && s.error) || 'неизвестная ошибка') +
                        '</div></div>'
                    );
                    return;
                }

                var html = '';
                html += kpiCard('Всего заявок', s.total, 'bi-list-check', 'primary');
                html += kpiCard('Новых', s.new, 'bi-plus-circle', 'info');
                html += kpiCard('В работе', s.in_progress, 'bi-hourglass-split', 'warning');
                html += kpiCard('Выполнено', s.completed, 'bi-check-circle', 'success');
                html += kpiCard('Отменено', s.cancelled, 'bi-x-circle', 'secondary');
                html += kpiCard('Просрочено', s.overdue, 'bi-exclamation-triangle', 'danger');
                html += kpiCard('Ср. время закрытия', s.avg_close_hours, 'bi-clock-history', 'primary', ' ч');
                html += kpiCard('Сегодня', (s.today_created || 0) + '/' + (s.today_closed || 0),
                    'bi-calendar-day', 'info');

                $('#dash-kpi').html(html);

                renderStatusesChart(s);
            })
            .catch(function(err) {
                $('#dash-kpi').html(
                    '<div class="col-12"><div class="alert alert-danger">' +
                    'Не удалось загрузить: ' +
                    utils.escapeHtml(err.message || 'неизвестная ошибка') +
                    '</div></div>'
                );
            });
    }

    // ============================================================
    // ГРАФИК СТАТУСОВ (doughnut)
    // ============================================================
    function renderStatusesChart(s) {
        var ctx = document.getElementById('chartStatuses');
        if (!ctx || typeof Chart === 'undefined') return;
        if (chartStatuses) chartStatuses.destroy();

        chartStatuses = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Новые', 'В работе', 'Выполнено', 'Отменено'],
                datasets: [{
                    data: [
                        s.new || 0,
                        s.in_progress || 0,
                        s.completed || 0,
                        s.cancelled || 0
                    ],
                    backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#64748b'],
                    borderWidth: 2,
                    borderColor: '#fff',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 12, boxWidth: 12, font: { size: 12 } },
                    },
                },
                cutout: '62%',
            },
        });
    }

    // ============================================================
    // ГРАФИК ПО МЕСЯЦАМ (bar, 12 месяцев)
    // ============================================================
    function loadMonthly() {
        api.get('/api/dashboard/monthly')
            .then(function(data) {
                var ctx = document.getElementById('chartMonthly');
                if (!ctx || typeof Chart === 'undefined') return;
                if (chartMonthly) chartMonthly.destroy();

                var months = (data && data.months) || [];
                var monthNames = ['Янв','Фев','Мар','Апр','Май','Июн',
                                 'Июл','Авг','Сен','Окт','Ноя','Дек'];

                var labels = months.map(function(m) {
                    var parts = (m.month || '').split('-');
                    if (parts.length < 2) return m.month;
                    var mm = parseInt(parts[1], 10) - 1;
                    return monthNames[mm] + ' ' + parts[0].slice(2);
                });

                chartMonthly = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Всего заявок',
                                data: months.map(function(m) { return m.total || 0; }),
                                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                                borderColor: '#6366f1',
                                borderWidth: 1,
                                borderRadius: 6,
                            },
                            {
                                label: 'Выполнено',
                                data: months.map(function(m) { return m.completed || 0; }),
                                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                                borderColor: '#10b981',
                                borderWidth: 1,
                                borderRadius: 6,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                                labels: { padding: 12, boxWidth: 12, font: { size: 12 } },
                            },
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { precision: 0, font: { size: 11 } },
                                grid: { color: 'rgba(0,0,0,0.05)' },
                            },
                            x: {
                                ticks: { font: { size: 11 } },
                                grid: { display: false },
                            },
                        },
                    },
                });
            })
            .catch(function(err) {
                console.error('[dashboard] monthly error:', err);
            });
    }

    // ============================================================
    // ТОП ИСПОЛНИТЕЛЕЙ (таблица)
    // ============================================================
    function loadExecutors() {
        api.get('/api/dashboard/executors')
            .then(function(rows) {
                var $t = $('#dash-executors');
                if (!rows || rows.length === 0) {
                    $t.html('<tr><td colspan="5" class="text-center text-muted py-3">' +
                        'Нет данных</td></tr>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<tr>' +
                        '<td>' + utils.escapeHtml(r.executor) + '</td>' +
                        '<td class="num">' + r.total + '</td>' +
                        '<td class="num num-success">' + r.completed + '</td>' +
                        '<td class="num num-warning">' + r.active + '</td>' +
                        '<td class="num">' + r.avg_hours + '</td>' +
                        '</tr>';
                }).join(''));
            })
            .catch(function(err) {
                console.error('[dashboard] executors error:', err);
            });
    }

    // ============================================================
    // ТОП КАБИНЕТОВ (список)
    // ============================================================
    function loadCabinets() {
        api.get('/api/dashboard/cabinets')
            .then(function(rows) {
                var $t = $('#dash-cabinets');
                if (!rows || rows.length === 0) {
                    $t.html('<div class="text-center text-muted py-3">' +
                        'Нет данных</div>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<div class="dash-list-item">' +
                        '<span class="dash-list-name">' +
                        utils.escapeHtml(r.cabinet) +
                        '</span>' +
                        '<span class="dash-list-value">' + r.count + '</span>' +
                        '</div>';
                }).join(''));
            })
            .catch(function(err) {
                console.error('[dashboard] cabinets error:', err);
            });
    }

    // ============================================================
    // ТОП ТИПОВ РАБОТ (список)
    // ============================================================
    function loadWorkTypes() {
        api.get('/api/dashboard/work-types')
            .then(function(rows) {
                var $t = $('#dash-work-types');
                if (!rows || rows.length === 0) {
                    $t.html('<div class="text-center text-muted py-3">' +
                        'Нет данных</div>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<div class="dash-list-item">' +
                        '<span class="dash-list-name">' +
                        utils.escapeHtml(r.work_type) +
                        '</span>' +
                        '<span class="dash-list-value">' + r.count + '</span>' +
                        '</div>';
                }).join(''));
            })
            .catch(function(err) {
                console.error('[dashboard] work-types error:', err);
            });
    }

    // ============================================================
    // ОБНОВЛЕНИЕ ВСЕГО
    // ============================================================
    function reload() {
        loadSummary();
        loadMonthly();
        loadExecutors();
        loadCabinets();
        loadWorkTypes();
    }

    // ============================================================
    // АВТОЗАПУСК + ПЕРИОДИЧЕСКОЕ ОБНОВЛЕНИЕ KPI
    // ============================================================
    $(document).ready(function() {
        reload();
        setInterval(loadSummary, 60000);
    });

    window.Dashboard = { reload: reload };

    console.log('[dashboard] Загружено');
})();