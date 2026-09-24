// static/js/dev/dev_console_db.js
// Вкладка «База данных»: info, schema, clearCache.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    // ============================================================
    // ИНФО
    // ============================================================
    DC.loadDbInfo = function() {
        api.get('/api/dev/db/info')
            .then(function(d) {
                if (d.error) {
                    $('#db-info-block').html(
                        '<span class="text-danger">' +
                        utils.escapeHtml(d.error) + '</span>'
                    );
                    return;
                }

                var html = '<div class="row g-2">' +
                    '<div class="col-auto"><strong>Путь:</strong> <code>' +
                    utils.escapeHtml(d.path) + '</code></div>' +
                    '<div class="col-auto"><strong>Размер:</strong> ' +
                    utils.escapeHtml(d.size_human) + '</div>' +
                    '<div class="col-auto"><strong>Изменён:</strong> ' +
                    (d.modified_at ? utils.formatDate(d.modified_at) : '—') +
                    '</div></div>';

                if (d.counts) {
                    html += '<div class="mt-2 small text-muted">';
                    var parts = [];
                    Object.keys(d.counts).forEach(function(k) {
                        if (d.counts[k] !== null) {
                            parts.push(k + ': <strong>' + d.counts[k] + '</strong>');
                        }
                    });
                    html += parts.join(' · ');
                    html += '</div>';
                }

                $('#db-info-block').html(html);
            })
            .catch(function(err) {
                $('#db-info-block').html(
                    '<span class="text-danger">' +
                    utils.escapeHtml(err.message) + '</span>'
                );
            });
    };

    // ============================================================
    // СХЕМА
    // ============================================================
    DC.loadDbSchema = function() {
        api.get('/api/dev/db/schema')
            .then(function(d) {
                if (d.error) {
                    $('#db-schema').html(
                        '<span class="text-danger">' +
                        utils.escapeHtml(d.error) + '</span>'
                    );
                    return;
                }

                var tables = d.tables || [];
                DC._dataTablesCache = tables;

                if (tables.length === 0) {
                    $('#db-schema').html('<div class="text-muted">Таблиц нет</div>');
                    return;
                }

                var html = '<div class="accordion" id="schema-acc">';
                tables.forEach(function(t, i) {
                    html += '<div class="accordion-item">';
                    html += '<h2 class="accordion-header">' +
                        '<button class="accordion-button collapsed" ' +
                        'type="button" data-bs-toggle="collapse" ' +
                        'data-bs-target="#tbl-' + i + '">' +
                        '<strong>' + utils.escapeHtml(t.name) + '</strong>' +
                        '<span class="badge bg-secondary ms-2">' +
                        t.row_count + ' строк</span>' +
                        '<span class="badge bg-info text-dark ms-2">' +
                        t.columns.length + ' колонок</span>' +
                        (t.protected
                            ? '<span class="badge bg-warning text-dark ms-2">' +
                              '<i class="bi bi-lock"></i> защищена</span>'
                            : '') +
                        '</button></h2>';
                    html += '<div id="tbl-' + i + '" class="accordion-collapse collapse" ' +
                        'data-bs-parent="#schema-acc">';
                    html += '<div class="accordion-body">';

                    html += '<div class="schema-col-list">';
                    t.columns.forEach(function(c) {
                        var flags = [];
                        if (c.pk) flags.push('PK');
                        if (c.notnull) flags.push('NOT NULL');
                        html += '<div class="schema-col">' +
                            '<span class="col-name">' +
                            utils.escapeHtml(c.name) + '</span>' +
                            '<span class="col-type">' +
                            utils.escapeHtml(c.type || '—') + '</span>' +
                            (flags.length
                                ? '<span class="col-flags">' + flags.join(', ') + '</span>'
                                : '') +
                            '</div>';
                    });
                    html += '</div>';

                    if (t.indexes && t.indexes.length) {
                        html += '<div class="mt-2 small text-muted">' +
                            'Индексы: ' + t.indexes.map(function(x) {
                                return utils.escapeHtml(x.name);
                            }).join(', ') + '</div>';
                    }

                    var safeName = utils.escapeHtml(t.name).replace(/'/g, '&#39;');
                    html += '<div class="schema-table-actions">' +
                        '<button type="button" class="btn btn-sm btn-primary" ' +
                        'onclick="DevConsole.viewTableData(\'' + safeName + '\')">' +
                        '<i class="bi bi-table"></i> Показать данные</button>' +
                        '<button type="button" class="btn btn-sm btn-outline-secondary" ' +
                        'onclick="DevConsole.copyTableQuery(\'' + safeName + '\')">' +
                        '<i class="bi bi-code"></i> SELECT-запрос</button>' +
                        '</div>';

                    html += '</div></div></div>';
                });
                html += '</div>';
                $('#db-schema').html(html);
            })
            .catch(function(err) {
                $('#db-schema').html(
                    '<span class="text-danger">' +
                    utils.escapeHtml(err.message) + '</span>'
                );
            });
    };

    // ============================================================
    // ОЧИСТКА КЕША
    // ============================================================
    DC.clearCache = function() {
        Swal.fire({
            title: 'Очистить кеш?',
            text: 'Все закешированные данные будут сброшены',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Очистить',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (!r.isConfirmed) return;

            api.post('/api/dev/cache/clear', {})
                .then(function(d) {
                    if (d.success) {
                        utils.showSuccessMessage('Кеш очищен');
                    } else {
                        utils.showErrorMessage(d.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    console.log('[dev_console_db] Загружено');
})();