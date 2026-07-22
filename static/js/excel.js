// static/js/excel.js

// ============= ЗАГРУЗКА СТРАНИЦЫ ОТЧЕТОВ =============
function loadReportPage() {
    console.log('Loading report page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка отчетов...</p>' +
        '</div>'
    );

    // Загружаем статистику и заявки
    Promise.all([
        fetch('/api/report/tasks').then(function(r) { return r.json(); }),
        fetch('/api/tasks').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var stats = results[0];
        var tasks = results[1];

        var html = '';

        // Статистика
        if (!stats.error) {
            html += '<div class="row mb-3">';

            // Статусы
            html += '<div class="col-md-6 mb-3"><div class="card"><div class="card-header bg-primary text-white">';
            html += '<h6 class="mb-0"><i class="bi bi-pie-chart"></i> Статистика по статусам</h6>';
            html += '</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-striped">';
            html += '<thead><tr><th>Статус</th><th>Количество</th></tr></thead><tbody>';
            if (stats.status_stats) {
                stats.status_stats.forEach(function(s) {
                    html += '<tr><td>' + s.status + '</td><td><strong>' + s.count + '</strong></td></tr>';
                });
            }
            html += '</tbody></table></div></div></div></div>';

            // Исполнители
            html += '<div class="col-md-6 mb-3"><div class="card"><div class="card-header bg-success text-white">';
            html += '<h6 class="mb-0"><i class="bi bi-people"></i> Статистика по исполнителям</h6>';
            html += '</div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-striped">';
            html += '<thead><tr><th>Исполнитель</th><th>Всего</th><th>Выполнено</th><th>В работе</th></tr></thead><tbody>';
            if (stats.executor_stats) {
                stats.executor_stats.forEach(function(e) {
                    html += '<tr><td>' + e.executor + '</td><td><strong>' + e.total + '</strong></td><td>' + e.completed + '</td><td>' + e.active + '</td></tr>';
                });
            }
            html += '</tbody></table></div></div></div></div>';

            html += '</div>';
        }

        // Таблица заявок с кнопками экспорта
        html += '<div class="card">';
        html += '<div class="card-header bg-info text-white">';
        html += '<div class="d-flex justify-content-between align-items-center">';
        html += '<h5 class="mb-0"><i class="bi bi-file-text"></i> Отчет по задачам</h5>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn btn-sm btn-light" onclick="loadReportPage()">';
        html += '<i class="bi bi-arrow-clockwise"></i> Обновить';
        html += '</button>';
        html += '<button class="btn btn-sm btn-success" onclick="exportToExcel()">';
        html += '<i class="bi bi-file-earmark-excel"></i> Экспорт в Excel';
        html += '</button>';
        html += '<button class="btn btn-sm btn-primary" onclick="printReport()">';
        html += '<i class="bi bi-printer"></i> Печать';
        html += '</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="card-body">';
        html += '<div class="table-responsive">';
        html += '<table class="table table-striped table-hover table-sm" id="reportTable">';
        html += '<thead><tr>';
        html += '<th>№</th>';
        html += '<th>Дата создания</th>';
        html += '<th>Срок</th>';
        html += '<th>От кого</th>';
        html += '<th>Кабинет</th>';
        html += '<th>Описание</th>';
        html += '<th>Тип работы</th>';
        html += '<th>Статус</th>';
        html += '<th>Приоритет</th>';
        html += '<th>Исполнитель</th>';
        html += '<th>Помощник</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        if (!tasks || tasks.length === 0) {
            html += '<tr><td colspan="11" class="text-center">Нет заявок</td></tr>';
        } else {
            tasks.forEach(function(task, index) {
                html += '<tr>';
                html += '<td>' + (index + 1) + '</td>';
                html += '<td>' + formatDate(task.created_date) + '</td>';
                html += '<td>' + formatDate(task.deadline) + '</td>';
                html += '<td>' + (task.from_user || '-') + '</td>';
                html += '<td>' + (task.cabinet || '-') + '</td>';
                html += '<td>' + truncateText(task.description, 50) + '</td>';
                html += '<td>' + (task.work_type || '-') + '</td>';
                html += '<td><span class="status-badge ' + getStatusClass(task.status) + '">' + (task.status || '-') + '</span></td>';
                html += '<td>' + (task.priority || '-') + '</td>';
                html += '<td>' + (task.executor || '-') + '</td>';
                html += '<td>' + (task.assistant || '-') + '</td>';
                html += '</tr>';
            });
        }

        html += '</tbody>';
        html += '</table>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        $contentBlock.html(html);
    })
    .catch(function(error) {
        console.error('Error loading report:', error);
        $contentBlock.html(
            '<div class="alert alert-danger">Ошибка загрузки отчета: ' + error.message + '</div>'
        );
    });
}

// Экспорт в Excel
function exportToExcel() {
    Swal.fire({
        title: 'Экспорт в Excel',
        text: 'Скачать файл с текущими заявками?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-download"></i> Скачать',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#28a745'
    }).then(function(result) {
        if (result.isConfirmed) {
            // Собираем текущие фильтры
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

            // Создаем ссылку для скачивания
            var downloadUrl = '/api/report/tasks/excel?' + params.toString();

            Swal.fire({
                title: 'Скачивание...',
                text: 'Файл будет загружен автоматически',
                icon: 'info',
                timer: 2000,
                showConfirmButton: false
            });

            // Запускаем скачивание
            window.location.href = downloadUrl;
        }
    });
}

// Печать отчета
function printReport() {
    Swal.fire({
        title: 'Печать отчета',
        text: 'Открыть отчет для печати?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-printer"></i> Печать',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#0d6efd'
    }).then(function(result) {
        if (result.isConfirmed) {
            // Собираем текущие фильтры
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

            fetch('/api/report/tasks/print?' + params.toString())
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.error) {
                        showErrorMessage(data.error);
                        return;
                    }

                    // Создаем окно для печати
                    var printWindow = window.open('', '_blank', 'width=1200,height=800');
                    printWindow.document.write('<html><head><title>Отчет по задачам</title>');
                    printWindow.document.write('<style>');
                    printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
                    printWindow.document.write('h2 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }');
                    printWindow.document.write('table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }');
                    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
                    printWindow.document.write('th { background-color: #667eea; color: white; }');
                    printWindow.document.write('tr:nth-child(even) { background-color: #f9f9f9; }');
                    printWindow.document.write('.header-info { margin-bottom: 20px; }');
                    printWindow.document.write('@media print { button { display: none; } }');
                    printWindow.document.write('</style>');
                    printWindow.document.write('</head><body>');
                    printWindow.document.write('<h2>Отчет по задачам</h2>');
                    printWindow.document.write('<div class="header-info">');
                    printWindow.document.write('<p><strong>Дата формирования:</strong> ' + data.export_date + '</p>');
                    printWindow.document.write('<p><strong>Всего заявок:</strong> ' + data.total + '</p>');
                    printWindow.document.write('</div>');
                    printWindow.document.write('<table>');
                    printWindow.document.write('<thead><tr>');
                    printWindow.document.write('<th>№</th><th>Дата создания</th><th>Срок</th><th>От кого</th><th>Кабинет</th><th>Описание</th><th>Тип работы</th><th>Статус</th><th>Приоритет</th><th>Исполнитель</th><th>Помощник</th>');
                    printWindow.document.write('</tr></thead><tbody>');

                    data.tasks.forEach(function(task, index) {
                        printWindow.document.write('<tr>');
                        printWindow.document.write('<td>' + (index + 1) + '</td>');
                        printWindow.document.write('<td>' + (task.created_date || '') + '</td>');
                        printWindow.document.write('<td>' + (task.deadline || '') + '</td>');
                        printWindow.document.write('<td>' + (task.from_user || '') + '</td>');
                        printWindow.document.write('<td>' + (task.cabinet || '') + '</td>');
                        printWindow.document.write('<td>' + (task.description || '') + '</td>');
                        printWindow.document.write('<td>' + (task.work_type || '') + '</td>');
                        printWindow.document.write('<td>' + (task.status || '') + '</td>');
                        printWindow.document.write('<td>' + (task.priority || '') + '</td>');
                        printWindow.document.write('<td>' + (task.executor || '') + '</td>');
                        printWindow.document.write('<td>' + (task.assistant || '') + '</td>');
                        printWindow.document.write('</tr>');
                    });

                    printWindow.document.write('</tbody></table>');
                    printWindow.document.write('<br><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">Распечатать</button>');
                    printWindow.document.write('</body></html>');
                    printWindow.document.close();
                });
        }
    });
}

console.log('Excel module loaded');