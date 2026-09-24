// static/js/dev/dev_console_slow.js
// Вкладка «Производительность»: медленные запросы из slow_requests.log.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    DC.loadSlowRequests = function() {
        var $c = $('#slow-content');
        $c.html(
            '<div class="p-4 text-center">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        var minMs = parseInt($('#slow-min-ms').val(), 10) || 0;
        var lines = parseInt($('#slow-lines').val(), 10) || 200;

        var url = '/api/dev/slow-requests?lines=' + lines +
                  '&min_ms=' + minMs;

        api.get(url)
            .then(function(d) {
                if (d.error) {
                    $c.html(
                        '<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                render(d, minMs);
            })
            .catch(function(err) {
                $c.html(
                    '<div class="alert alert-danger m-3">' +
                    utils.escapeHtml(err.message) + '</div>'
                );
            });
    };

    // ============================================================
    // РЕНДЕР
    // ============================================================
    function render(d, minMs) {
        var entries = d.entries || [];

        var html = '';

        // Тулбар
        html += '<div class="d-flex justify-content-between ' +
            'align-items-center mb-3 flex-wrap gap-2">';
        html += '<div class="small text-muted">' +
            'Записей: <strong>' + entries.length + '</strong> · ' +
            'Размер файла: ' + d.file_size_human +
            (minMs > 0 ? ' · Мин: <strong>' + minMs + ' мс</strong>' : '') +
            '</div>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn btn-sm btn-outline-warning" ' +
            'onclick="DevConsole.clearSlowLog()">' +
            '<i class="bi bi-trash"></i> Очистить лог</button>';
        html += '<button class="btn btn-sm btn-outline-primary" ' +
            'onclick="DevConsole.loadSlowRequests()">' +
            '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '</div></div>';

        if (!d.exists || entries.length === 0) {
            html += '<div class="alert alert-info">' +
                '<i class="bi bi-check-circle"></i> ' +
                'Медленных запросов не зафиксировано. ' +
                'Порог: ' + (minMs > 0 ? minMs + ' мс' : 'см. SLOW_REQUEST_MS') +
                '</div>';
            $('#slow-content').html(html);
            return;
        }

        // Таблица
        html += '<div class="table-responsive">' +
            '<table class="table table-sm table-striped table-hover mb-0">';
        html += '<thead><tr>';
        html += '<th style="width:150px">Когда</th>';
        html += '<th style="width:90px" class="text-end">Время</th>';
        html += '<th style="width:60px">Метод</th>';
        html += '<th>Путь</th>';
        html += '<th style="width:70px" class="text-center">Статус</th>';
        html += '<th style="width:100px">Пользователь</th>';
        html += '<th style="width:120px">IP</th>';
        html += '</tr></thead><tbody>';

        entries.forEach(function(e) {
            var msClass = 'text-warning';
            if (e.ms >= 5000) msClass = 'text-danger fw-bold';
            else if (e.ms >= 2000) msClass = 'text-warning fw-bold';

            var statusClass = 'bg-secondary';
            if (e.status >= 500) statusClass = 'bg-danger';
            else if (e.status >= 400) statusClass = 'bg-warning text-dark';
            else statusClass = 'bg-success';

            html += '<tr>';
            html += '<td class="small text-muted">' +
                utils.escapeHtml(e.timestamp) + '</td>';
            html += '<td class="text-end ' + msClass + '">' +
                e.ms + ' мс</td>';
            html += '<td><span class="badge bg-info text-dark">' +
                utils.escapeHtml(e.method) + '</span></td>';
            html += '<td style="font-family:monospace;font-size:.8rem;' +
                'word-break:break-all">' +
                utils.escapeHtml(e.path) + '</td>';
            html += '<td class="text-center"><span class="badge ' +
                statusClass + '">' + e.status + '</span></td>';
            html += '<td class="small">' +
                utils.escapeHtml(e.user) + '</td>';
            html += '<td class="small text-muted">' +
                utils.escapeHtml(e.ip) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        $('#slow-content').html(html);
    }

    // ============================================================
    // ОЧИСТКА
    // ============================================================
    DC.clearSlowLog = function() {
        Swal.fire({
            title: 'Очистить slow_requests.log?',
            text: 'Все записи о медленных запросах будут удалены',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Очистить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/dev/slow-requests/clear', {})
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage('Лог очищен');
                        DC.loadSlowRequests();
                    } else {
                        utils.showErrorMessage(res.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    console.log('[dev_console_slow] Загружено');
})();