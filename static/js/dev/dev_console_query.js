// static/js/dev/dev_console_query.js
// Вкладка «SQL-запросы».

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    DC.runQuery = function() {
        var sql = $('#sql-input').val().trim();
        if (!sql) {
            utils.showErrorMessage('Введите запрос');
            return;
        }

        $('#sql-result').html(
            '<div class="text-center py-3">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.post('/api/dev/db/query', { sql: sql })
            .then(function(d) {
                if (d.error) {
                    $('#sql-result').html(
                        '<div class="alert alert-danger mb-0">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                if (!d.columns || d.columns.length === 0) {
                    $('#sql-result').html(
                        '<div class="alert alert-info mb-0">' +
                        'Запрос выполнен. Строк: ' + (d.total || 0) +
                        '</div>'
                    );
                    return;
                }

                var html = '';
                if (d.truncated) {
                    html += '<div class="alert alert-warning py-2 small">' +
                        'Показано первых ' + d.shown + ' из ' + d.total +
                        ' строк</div>';
                } else {
                    html += '<div class="small text-muted mb-2">' +
                        'Найдено: <strong>' + d.total + '</strong> строк</div>';
                }

                html += '<div class="sql-result"><table><thead><tr>';
                d.columns.forEach(function(c) {
                    html += '<th>' + utils.escapeHtml(c) + '</th>';
                });
                html += '</tr></thead><tbody>';

                d.rows.forEach(function(row) {
                    html += '<tr>';
                    row.forEach(function(v) {
                        var text = v === null ? '—' :
                                   (typeof v === 'object'
                                       ? JSON.stringify(v)
                                       : String(v));
                        html += '<td title="' + utils.escapeHtml(text) + '">' +
                            utils.escapeHtml(text) + '</td>';
                    });
                    html += '</tr>';
                });

                html += '</tbody></table></div>';
                $('#sql-result').html(html);
            })
            .catch(function(err) {
                $('#sql-result').html(
                    '<div class="alert alert-danger mb-0">' +
                    utils.escapeHtml(err.message) + '</div>'
                );
            });
    };

    console.log('[dev_console_query] Загружено');
})();