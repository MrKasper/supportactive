// static/js/excel.js
// Отчёты: сводная таблица + XLSX + PDF + печать

(function() {
    'use strict';

    if (!window.App) {
        console.error('[excel] App не инициализирован');
        return;
    }

    // ⚠️ ВАЖНО: mod — это модуль (Reports), api — обёртка App.api.
    // Нельзя смешивать: register() возвращает объект модуля, а не api.js.
    var mod = window.App.register('Reports');
    var api = window.App.api;
    var utils = window.App.utils;

    if (!api || typeof api.get !== 'function') {
        console.error(
            '[excel] App.api не загружен. Убедитесь, что api.js ' +
            'подключён в base.html ПЕРЕД excel.js'
        );
        return;
    }

    // ============================================================
    // СТРАНИЦА
    // ============================================================
    function loadReportPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка отчётов...</p>' +
            '</div>'
        );

        Promise.all([
            api.get('/api/report/tasks'),
            api.get('/api/tasks?page=1&per_page=200'),
        ])
            .then(function(results) {
                var stats = results[0] || {};
                var tasksData = results[1] || {};
                var tasks = Array.isArray(tasksData)
                    ? tasksData
                    : (tasksData.items || []);

                var html = '';
                if (!stats.error) {
                    html += renderStatsCards(stats);
                } else {
                    html += '<div class="alert alert-warning">' +
                        utils.escapeHtml(stats.error) + '</div>';
                }
                html += renderTasksTable(tasks);
                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[excel] load error:', error);
                $contentBlock.html(
                    '<div class="alert alert-danger">' +
                    'Ошибка загрузки отчёта: ' +
                    utils.escapeHtml(error.message || 'неизвестная') +
                    '<br><button class="btn btn-sm btn-primary mt-2" ' +
                    'onclick="loadReportPage()">Повторить</button>' +
                    '</div>'
                );
            });
    }

    // ============================================================
    // СВОДНЫЕ КАРТОЧКИ
    // ============================================================
    function renderStatsCards(stats) {
        var html = '<div class="row mb-3">';

        // Статусы
        html += '<div class="col-md-6 mb-3"><div class="card">' +
            '<div class="card-header bg-primary text-white">' +
            '<h6 class="mb-0"><i class="bi bi-pie-chart"></i> ' +
            'Статистика по статусам</h6></div>' +
            '<div class="card-body"><div class="table-responsive">' +
            '<table class="table table-sm table-striped mb-0"><thead><tr>' +
            '<th>Статус</th><th>Количество</th></tr></thead><tbody>';
        if (stats.status_stats && stats.status_stats.length) {
            stats.status_stats.forEach(function(s) {
                html += '<tr><td>' + utils.escapeHtml(s.status) + '</td>' +
                    '<td><strong>' + s.count + '</strong></td></tr>';
            });
        } else {
            html += '<tr><td colspan="2" class="text-muted text-center">' +
                'Нет данных</td></tr>';
        }
        html += '</tbody></table></div></div></div></div>';

        // Исполнители
        html += '<div class="col-md-6 mb-3"><div class="card">' +
            '<div class="card-header bg-success text-white">' +
            '<h6 class="mb-0"><i class="bi bi-people"></i> ' +
            'Статистика по исполнителям</h6></div>' +
            '<div class="card-body"><div class="table-responsive">' +
            '<table class="table table-sm table-striped mb-0"><thead><tr>' +
            '<th>Исполнитель</th><th>Всего</th>' +
            '<th>Выполнено</th><th>В работе</th>' +
            '</tr></thead><tbody>';
        if (stats.executor_stats && stats.executor_stats.length) {
            stats.executor_stats.forEach(function(e) {
                html += '<tr><td>' + utils.escapeHtml(e.executor) + '</td>' +
                    '<td><strong>' + e.total + '</strong></td>' +
                    '<td>' + e.completed + '</td>' +
                    '<td>' + e.active + '</td></tr>';
            });
        } else {
            html += '<tr><td colspan="4" class="text-muted text-center">' +
                'Нет данных</td></tr>';
        }
        html += '</tbody></table></div></div></div></div>';

        html += '</div>';
        return html;
    }

    // ============================================================
    // ТАБЛИЦА ЗАЯВОК
    // ============================================================
    function renderTasksTable(tasks) {
        var html = '<div class="card">';
        html += '<div class="card-header bg-info text-white">';
        html += '<div class="d-flex justify-content-between ' +
                'align-items-center flex-wrap gap-2">';
        html += '<h5 class="mb-0"><i class="bi bi-file-text"></i> ' +
                'Отчёт по задачам</h5>';
        html += '<div class="d-flex gap-2 flex-wrap">';
        html += '<button class="btn btn-sm btn-light" ' +
            'onclick="loadReportPage()">' +
            '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn btn-sm btn-success" ' +
            'onclick="exportToExcel()">' +
            '<i class="bi bi-file-earmark-excel"></i> Excel</button>';
        html += '<button class="btn btn-sm btn-danger" ' +
            'onclick="exportToPDF()">' +
            '<i class="bi bi-file-earmark-pdf"></i> PDF</button>';
        html += '<button class="btn btn-sm btn-primary" ' +
            'onclick="printReport()">' +
            '<i class="bi bi-printer"></i> Печать</button>';
        html += '</div></div></div>';

        html += '<div class="card-body"><div class="table-responsive">';
        html += '<table class="table table-striped table-hover table-sm" ' +
                'id="reportTable">';
        html += '<thead><tr>';
        html += '<th>№</th><th>Дата создания</th><th>Срок</th>' +
                '<th>От кого</th>';
        html += '<th>Кабинет</th><th>Описание</th><th>Тип работы</th>';
        html += '<th>Статус</th><th>Приоритет</th><th>Исполнитель</th>' +
                '<th>Помощник</th>';
        html += '</tr></thead><tbody>';

        if (!tasks || tasks.length === 0) {
            html += '<tr><td colspan="11" class="text-center text-muted">' +
                    'Нет заявок</td></tr>';
        } else {
            tasks.forEach(function(task, index) {
                html += '<tr>';
                html += '<td>' + (index + 1) + '</td>';
                html += '<td>' + utils.formatDate(task.created_date) + '</td>';
                html += '<td>' + utils.formatDate(task.deadline) + '</td>';
                html += '<td>' + utils.escapeHtml(task.from_user || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(task.cabinet || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(
                    utils.truncateText(task.description, 50)
                ) + '</td>';
                html += '<td>' + utils.escapeHtml(task.work_type || '-') + '</td>';
                html += '<td><span class="status-badge ' +
                    utils.getStatusClass(task.status) + '">' +
                    utils.escapeHtml(task.status || '-') + '</span></td>';
                html += '<td>' + utils.escapeHtml(task.priority || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(task.executor || '-') + '</td>';
                html += '<td>' + utils.escapeHtml(task.assistant || '-') + '</td>';
                html += '</tr>';
            });
        }

        html += '</tbody></table></div></div></div>';
        return html;
    }

    // ============================================================
    // ФИЛЬТРЫ
    // ============================================================
    function buildFilterParams() {
        var params = new URLSearchParams();
        var workType = $('#filterWorkType').val();
        var cabinet = $('#filterCabinet').val();
        var status = $('#filterStatus').val();
        var user = $('#filterUser').val();
        var filterDate = $('#filterDate').val();

        if (workType) params.append('work_type', workType);
        if (cabinet) params.append('cabinet', cabinet);
        if (status) params.append('status', status);
        if (user) params.append('user', user);
        if (filterDate) {
            params.append('date_from', filterDate + ' 00:00:00');
            params.append('date_to', filterDate + ' 23:59:59');
        }
        return params;
    }

    // ============================================================
    // ЭКСПОРТ В EXCEL
    // ============================================================
    function exportToExcel() {
        Swal.fire({
            title: 'Экспорт в Excel',
            text: 'Скачать файл с текущими заявками?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-download"></i> Скачать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var params = buildFilterParams();
            var downloadUrl = '/api/report/tasks/excel?' + params.toString();

            Swal.fire({
                title: 'Скачивание...',
                text: 'Файл будет загружен автоматически',
                icon: 'info',
                timer: 2000,
                showConfirmButton: false,
            });

            window.location.href = downloadUrl;
        });
    }

    // ============================================================
    // ЭКСПОРТ В PDF
    // ============================================================
    function exportToPDF() {
        Swal.fire({
            title: 'Экспорт в PDF',
            text: 'Скачать файл с текущими заявками?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-download"></i> Скачать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var params = buildFilterParams();
            window.location.href = '/api/report/tasks/pdf?' +
                                    params.toString();
        });
    }

    // ============================================================
    // ПЕЧАТЬ
    // ============================================================
    function printReport() {
        Swal.fire({
            title: 'Печать отчёта',
            text: 'Открыть отчёт для печати?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-printer"></i> Печать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd',
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var params = buildFilterParams();

            api.get('/api/report/tasks/print?' + params.toString())
                .then(function(data) {
                    if (data.error) {
                        utils.showErrorMessage(data.error);
                        return;
                    }

                    var w = window.open('', '_blank',
                        'width=1200,height=800');
                    w.document.write(
                        '<html><head><title>Отчёт по задачам</title>'
                    );
                    w.document.write('<style>');
                    w.document.write(
                        'body{font-family:Arial,sans-serif;padding:20px}'
                    );
                    w.document.write(
                        'h2{color:#333;border-bottom:2px solid #667eea;' +
                        'padding-bottom:10px}'
                    );
                    w.document.write(
                        'table{width:100%;border-collapse:collapse;' +
                        'margin-top:20px;font-size:12px}'
                    );
                    w.document.write(
                        'th,td{border:1px solid #ddd;padding:8px;' +
                        'text-align:left}'
                    );
                    w.document.write('th{background-color:#667eea;color:white}');
                    w.document.write('tr:nth-child(even){background-color:#f9f9f9}');
                    w.document.write('.header-info{margin-bottom:20px}');
                    w.document.write('@media print{button{display:none}}');
                    w.document.write('</style></head><body>');
                    w.document.write('<h2>Отчёт по задачам</h2>');
                    w.document.write('<div class="header-info">');
                    w.document.write(
                        '<p><strong>Дата формирования:</strong> ' +
                        (data.export_date || '') + '</p>'
                    );
                    w.document.write(
                        '<p><strong>Всего заявок:</strong> ' +
                        (data.total || 0) + '</p>'
                    );
                    w.document.write('</div>');
                    w.document.write('<table><thead><tr>');
                    w.document.write(
                        '<th>№</th><th>Дата создания</th><th>Срок</th>' +
                        '<th>От кого</th><th>Кабинет</th><th>Описание</th>' +
                        '<th>Тип работы</th><th>Статус</th>' +
                        '<th>Приоритет</th><th>Исполнитель</th>' +
                        '<th>Помощник</th>'
                    );
                    w.document.write('</tr></thead><tbody>');

                    (data.tasks || []).forEach(function(task, index) {
                        w.document.write('<tr>');
                        w.document.write('<td>' + (index + 1) + '</td>');
                        w.document.write('<td>' +
                            (task.created_date || '') + '</td>');
                        w.document.write('<td>' +
                            (task.deadline || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.from_user || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.cabinet || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.description || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.work_type || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.status || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.priority || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.executor || '') + '</td>');
                        w.document.write('<td>' +
                            utils.escapeHtml(task.assistant || '') + '</td>');
                        w.document.write('</tr>');
                    });

                    w.document.write('</tbody></table>');
                    w.document.write(
                        '<br><button onclick="window.print()" ' +
                        'style="padding:10px 20px;font-size:16px;' +
                        'cursor:pointer;">Распечатать</button>'
                    );
                    w.document.write('</body></html>');
                    w.document.close();
                })
                .catch(function() {
                    utils.showErrorMessage(
                        'Ошибка загрузки данных для печати'
                    );
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = loadReportPage;
    mod.exportExcel = exportToExcel;
    mod.exportPDF = exportToPDF;
    mod.print = printReport;

    window.loadReportPage = loadReportPage;
    window.exportToExcel = exportToExcel;
    window.exportToPDF = exportToPDF;
    window.printReport = printReport;

    console.log('[excel] Загружено');
})();