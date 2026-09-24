// static/js/dashboard.js
// Дашборд руководителя: графики и KPI.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;

    var chartMonthly = null;
    var chartStatuses = null;

    function kpiCard(label, value, icon, color, suffix) {
        suffix = suffix || '';
        return '<div class="col-6 col-md-3">' +
            '<div class="card bg-' + color + ' text-white h-100">' +
            '<div class="card-body d-flex justify-content-between align-items-center">' +
            '<div><h3 class="mb-0">' + value + suffix + '</h3>' +
            '<small>' + label + '</small></div>' +
            '<i class="bi ' + icon + '" style="font-size:2.5rem;opacity:.4;"></i>' +
            '</div></div></div>';
    }

    function loadSummary() {
        api.get('/api/dashboard/summary')
            .then(function(s) {
                var html = '';
                html += kpiCard('Всего заявок', s.total, 'bi-list-check', 'primary');
                html += kpiCard('Новых', s.new, 'bi-plus-circle', 'info');
                html += kpiCard('В работе', s.in_progress, 'bi-hourglass-split', 'warning');
                html += kpiCard('Выполнено', s.completed, 'bi-check-circle', 'success');
                html += kpiCard('Отменено', s.cancelled, 'bi-x-circle', 'secondary');
                html += kpiCard('Просрочено', s.overdue, 'bi-exclamation-triangle', 'danger');
                html += kpiCard('Ср. время закрытия', s.avg_close_hours, 'bi-clock-history', 'primary', ' ч');
                html += kpiCard('Сегодня', s.today_created + '/' + s.today_closed,
                    'bi-calendar-day', 'info');

                $('#dash-kpi').html(html);

                // Pie: статусы
                renderStatusesChart(s);
            })
            .catch(function(err) {
                $('#dash-kpi').html(
                    '<div class="col-12"><div class="alert alert-danger">' +
                    'Не удалось загрузить: ' + utils.escapeHtml(err.message) +
                    '</div></div>'
                );
            });
    }

    function renderStatusesChart(s) {
        var ctx = document.getElementById('chartStatuses');
        if (!ctx) return;
        if (chartStatuses) chartStatuses.destroy();

        chartStatuses = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Новые', 'В работе', 'Выполнено', 'Отменено'],
                datasets: [{
                    data: [s.new, s.in_progress, s.completed, s.cancelled],
                    backgroundColor: ['#4e73df', '#f6c23e', '#1cc88a', '#858796'],
                    borderWidth: 2,
                    borderColor: '#fff',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 12 } },
                },
            },
        });
    }

    function loadMonthly() {
        api.get('/api/dashboard/monthly')
            .then(function(data) {
                var ctx = document.getElementById('chartMonthly');
                if (!ctx) return;
                if (chartMonthly) chartMonthly.destroy();

                var months = data.months || [];
                var labels = months.map(function(m) {
                    var parts = m.month.split('-');
                    var monthNames = ['Янв','Фев','Мар','Апр','Май','Июн',
                                     'Июл','Авг','Сен','Окт','Ноя','Дек'];
                    return monthNames[parseInt(parts[1], 10) - 1] +
                           ' ' + parts[0].slice(2);
                });

                chartMonthly = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Всего заявок',
                                data: months.map(function(m) { return m.total; }),
                                backgroundColor: 'rgba(78, 115, 223, 0.7)',
                                borderColor: '#4e73df',
                                borderWidth: 1,
                            },
                            {
                                label: 'Выполнено',
                                data: months.map(function(m) { return m.completed; }),
                                backgroundColor: 'rgba(28, 200, 138, 0.7)',
                                borderColor: '#1cc88a',
                                borderWidth: 1,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' },
                        },
                        scales: {
                            y: { beginAtZero: true, ticks: { precision: 0 } },
                        },
                    },
                });
            });
    }

    function loadExecutors() {
        api.get('/api/dashboard/executors')
            .then(function(rows) {
                var $t = $('#dash-executors');
                if (!rows || rows.length === 0) {
                    $t.html('<tr><td colspan="5" class="text-center text-muted py-3">Нет данных</td></tr>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<tr>' +
                        '<td>' + utils.escapeHtml(r.executor) + '</td>' +
                        '<td class="text-center">' + r.total + '</td>' +
                        '<td class="text-center text-success"><strong>' + r.completed + '</strong></td>' +
                        '<td class="text-center text-warning">' + r.active + '</td>' +
                        '<td class="text-center">' + r.avg_hours + '</td>' +
                        '</tr>';
                }).join(''));
            });
    }

    function loadCabinets() {
        api.get('/api/dashboard/cabinets')
            .then(function(rows) {
                var $t = $('#dash-cabinets');
                if (!rows || rows.length === 0) {
                    $t.html('<tr><td class="text-center text-muted py-3">Нет данных</td></tr>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<tr><td>' + utils.escapeHtml(r.cabinet) + '</td>' +
                        '<td class="text-end"><strong>' + r.count + '</strong></td></tr>';
                }).join(''));
            });
    }

    function loadWorkTypes() {
        api.get('/api/dashboard/work-types')
            .then(function(rows) {
                var $t = $('#dash-work-types');
                if (!rows || rows.length === 0) {
                    $t.html('<tr><td class="text-center text-muted py-3">Нет данных</td></tr>');
                    return;
                }
                $t.html(rows.map(function(r) {
                    return '<tr><td>' + utils.escapeHtml(r.work_type) + '</td>' +
                        '<td class="text-end"><strong>' + r.count + '</strong></td></tr>';
                }).join(''));
            });
    }

    function reload() {
        loadSummary();
        loadMonthly();
        loadExecutors();
        loadCabinets();
        loadWorkTypes();
    }

    $(document).ready(function() {
        reload();
        // Автообновление каждые 60 сек
        setInterval(loadSummary, 60000);
    });

    window.Dashboard = { reload: reload };

    console.log('[dashboard] Загружено');
})();