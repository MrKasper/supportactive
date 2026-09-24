// static/js/dev/dev_console_data.js
// Вкладка «Данные таблиц»: список, просмотр, редактирование, удаление, clear.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    var dataState = {
        table: null,
        offset: 0,
        limit: 100,
        columns: [],
        hasId: false,
        protected: false,
    };

    // ============================================================
    // СПИСОК ТАБЛИЦ
    // ============================================================
    DC.loadTablesList = function() {
        if (DC._dataTablesCache) {
            renderTablesSelect(DC._dataTablesCache);
            return;
        }

        api.get('/api/dev/db/schema')
            .then(function(d) {
                if (d.error) {
                    $('#data-table-select').html('<option value="">Ошибка</option>');
                    return;
                }
                DC._dataTablesCache = d.tables || [];
                renderTablesSelect(DC._dataTablesCache);
            })
            .catch(function() {
                $('#data-table-select').html('<option value="">Ошибка</option>');
            });
    };

    function renderTablesSelect(tables) {
        var $sel = $('#data-table-select');
        var current = $sel.val();
        $sel.empty();
        $sel.append('<option value="">— выберите таблицу —</option>');
        tables.forEach(function(t) {
            $sel.append(
                '<option value="' + utils.escapeHtml(t.name) + '">' +
                utils.escapeHtml(t.name) +
                ' (' + t.row_count + ' строк)</option>'
            );
        });
        if (current) $sel.val(current);
    }

    // ============================================================
    // ЗАГРУЗКА ДАННЫХ ТАБЛИЦЫ
    // ============================================================
    DC.loadTableData = function(offset) {
        offset = offset || 0;

        var tableName = $('#data-table-select').val();
        if (!tableName) {
            utils.showErrorMessage('Выберите таблицу');
            return;
        }

        var limit = parseInt($('#data-limit-select').val(), 10) || 100;

        dataState.table = tableName;
        dataState.offset = offset;
        dataState.limit = limit;

        $('#data-table-result').html(
            '<div class="p-4 text-center">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );
        $('#data-pagination').empty();

        api.get('/api/dev/db/table/' + encodeURIComponent(tableName) +
                '?limit=' + limit + '&offset=' + offset)
            .then(function(d) {
                if (d.error) {
                    $('#data-table-result').html(
                        '<div class="p-4 text-center text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    $('#btn-clear-table').prop('disabled', true);
                    return;
                }

                dataState.columns = d.columns;
                dataState.hasId = d.has_id;
                dataState.protected = d.protected;

                $('#btn-clear-table')
                    .prop('disabled', d.protected || d.total === 0)
                    .attr('title',
                        d.protected
                            ? 'Таблица защищена'
                            : 'Удалить все строки из таблицы');

                renderTableData(d, offset);
            })
            .catch(function(err) {
                $('#data-table-result').html(
                    '<div class="p-4 text-center text-danger">' +
                    utils.escapeHtml(err.message || 'Ошибка') + '</div>'
                );
            });
    };

    function renderTableData(d, offset) {
        $('#data-table-title').html(
            '<i class="bi bi-table"></i> ' + utils.escapeHtml(d.table) +
            (d.protected
                ? ' <span class="badge bg-warning text-dark ms-2">' +
                  '<i class="bi bi-lock"></i> защищена</span>'
                : '')
        );

        var from = d.total === 0 ? 0 : offset + 1;
        var to = offset + d.rows.length;
        $('#data-table-info').text(
            'Всего: ' + d.total + ' · Показано: ' + from + '–' + to
        );

        if (d.rows.length === 0) {
            $('#data-table-result').html(
                '<div class="p-4 text-center text-muted">Таблица пуста</div>'
            );
            return;
        }

        var showActions = d.has_id && !d.protected;
        var idIndex = d.columns.indexOf('id');

        var html = '<div class="sql-result">';
        html += '<table><thead><tr>';
        d.columns.forEach(function(c) {
            html += '<th>' + utils.escapeHtml(c) + '</th>';
        });
        if (showActions) {
            html += '<th class="col-actions">Действия</th>';
        }
        html += '</tr></thead><tbody>';

        d.rows.forEach(function(row) {
            html += '<tr>';
            row.forEach(function(v) {
                var text;
                if (v === null) text = '—';
                else if (typeof v === 'object') text = JSON.stringify(v);
                else text = String(v);
                html += '<td title="' + utils.escapeHtml(text) + '">' +
                    utils.escapeHtml(text) + '</td>';
            });

            if (showActions && idIndex >= 0) {
                var rowId = row[idIndex];
                html += '<td class="col-actions">' +
                    '<button class="btn btn-sm btn-outline-primary row-action-btn" ' +
                    'onclick="DevConsole.editRow(' + rowId + ')" title="Редактировать">' +
                    '<i class="bi bi-pencil"></i></button>' +
                    '<button class="btn btn-sm btn-outline-danger row-action-btn" ' +
                    'onclick="DevConsole.deleteRow(' + rowId + ')" title="Удалить">' +
                    '<i class="bi bi-trash"></i></button>' +
                    '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        $('#data-table-result').html(html);

        renderDataPagination(d, offset);
    }

    function renderDataPagination(d, offset) {
        var limit = d.limit;
        var total = d.total;

        if (total <= limit) {
            $('#data-pagination').empty();
            return;
        }

        var html = '<div class="d-flex justify-content-between align-items-center px-3 py-2">';
        html += '<button class="btn btn-sm btn-outline-primary" ' +
            'onclick="DevConsole.loadTableData(' + Math.max(0, offset - limit) + ')" ' +
            (offset === 0 ? 'disabled' : '') + '>' +
            '<i class="bi bi-chevron-left"></i> Назад</button>';
        html += '<span class="small text-muted">' +
            'Строки ' + (offset + 1) + '–' +
            (offset + d.rows.length) + ' из ' + total + '</span>';
        html += '<button class="btn btn-sm btn-outline-primary" ' +
            'onclick="DevConsole.loadTableData(' + (offset + limit) + ')" ' +
            (offset + limit >= total ? 'disabled' : '') + '>' +
            'Вперёд <i class="bi bi-chevron-right"></i></button>';
        html += '</div>';
        $('#data-pagination').html(html);
    }

    // ============================================================
    // БЫСТРЫЙ ПЕРЕХОД
    // ============================================================
    DC.viewTableData = function(tableName) {
        DC.switchTab('data');

        setTimeout(function() {
            if (!DC._dataTablesCache) {
                api.get('/api/dev/db/schema').then(function(d) {
                    DC._dataTablesCache = d.tables || [];
                    renderTablesSelect(DC._dataTablesCache);
                    $('#data-table-select').val(tableName);
                    DC.loadTableData(0);
                });
            } else {
                $('#data-table-select').val(tableName);
                DC.loadTableData(0);
            }
        }, 100);
    };

    DC.copyTableQuery = function(tableName) {
        var sql = 'SELECT * FROM ' + tableName + ' LIMIT 100';

        if (navigator.clipboard) {
            navigator.clipboard.writeText(sql).then(function() {
                utils.showSuccessMessage('Запрос скопирован в буфер');
            }).catch(function() {});
        }

        DC.switchTab('query');
        setTimeout(function() {
            $('#sql-input').val(sql);
        }, 100);
    };

    // ============================================================
    // РЕДАКТИРОВАНИЕ СТРОКИ
    // ============================================================
    DC.editRow = function(rowId) {
        if (!dataState.table || dataState.protected) return;
        if (!dataState.hasId) {
            utils.showErrorMessage('У таблицы нет колонки id');
            return;
        }

        api.get('/api/dev/db/table/' + encodeURIComponent(dataState.table) +
                '?limit=1000&offset=0')
            .then(function(d) {
                if (d.error) {
                    utils.showErrorMessage(d.error);
                    return;
                }

                var idIdx = d.columns.indexOf('id');
                var row = null;
                for (var i = 0; i < d.rows.length; i++) {
                    if (String(d.rows[i][idIdx]) === String(rowId)) {
                        row = d.rows[i];
                        break;
                    }
                }

                if (!row) {
                    utils.showErrorMessage('Строка не найдена в текущей выборке');
                    return;
                }

                var html = '<div class="text-start">';
                html += '<div class="edit-warning">' +
                    '<i class="bi bi-exclamation-triangle"></i>' +
                    'Изменения применяются напрямую к БД без проверок. ' +
                    'Соблюдайте осторожность.</div>';

                d.columns.forEach(function(col, idx) {
                    var val = row[idx];
                    var isId = (col === 'id');

                    html += '<div class="mb-3">';
                    html += '<label class="form-label">' +
                        utils.escapeHtml(col) +
                        (isId
                            ? ' <small class="text-muted">(нельзя изменить)</small>'
                            : '') +
                        '</label>';

                    if (isId) {
                        html += '<input class="form-control" value="' +
                            utils.escapeHtml(String(val)) + '" disabled>';
                    } else {
                        var strVal = (val === null) ? '' : String(val);
                        html += '<input class="form-control row-edit-input" ' +
                            'data-column="' + utils.escapeHtml(col) + '" ' +
                            'value="' + utils.escapeHtml(strVal) + '">';
                    }

                    html += '</div>';
                });

                html += '</div>';

                Swal.fire({
                    title: '<i class="bi bi-pencil-square"></i> ' +
                        utils.escapeHtml(dataState.table) + '#' + rowId,
                    html: html,
                    width: 700,
                    showCancelButton: true,
                    confirmButtonText: '<i class="bi bi-check"></i> Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    preConfirm: function() {
                        var result = {};
                        $('.row-edit-input').each(function() {
                            var col = $(this).data('column');
                            var v = $(this).val();
                            result[col] = (v === '') ? null : v;
                        });
                        return result;
                    },
                }).then(function(r) {
                    if (!r.isConfirmed) return;
                    submitRowUpdate(rowId, r.value);
                });
            })
            .catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка загрузки');
            });
    };

    function submitRowUpdate(rowId, data) {
        Swal.fire({
            title: 'Сохранение...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.put('/api/dev/db/row/' + encodeURIComponent(dataState.table) +
                '/' + rowId, data)
            .then(function(res) {
                if (res.success) {
                    Swal.close();
                    utils.showSuccessMessage(res.message || 'Сохранено');
                    DC.loadTableData(dataState.offset);
                } else {
                    Swal.close();
                    utils.showErrorMessage(res.error || 'Ошибка');
                }
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка');
            });
    }

    // ============================================================
    // УДАЛЕНИЕ СТРОКИ
    // ============================================================
    DC.deleteRow = function(rowId) {
        if (!dataState.table || dataState.protected) return;
        if (!dataState.hasId) {
            utils.showErrorMessage('У таблицы нет колонки id');
            return;
        }

        Swal.fire({
            title: 'Удалить строку?',
            html: 'Таблица: <strong>' +
                utils.escapeHtml(dataState.table) +
                '</strong><br>Строка ID: <strong>' + rowId + '</strong>' +
                '<br><br><span class="text-danger small">' +
                '<i class="bi bi-exclamation-triangle"></i> ' +
                'Отменить это действие невозможно.</span>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;

            api.delete('/api/dev/db/row/' + encodeURIComponent(dataState.table) +
                       '/' + rowId)
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Удалено');
                        DC.loadTableData(dataState.offset);
                    } else {
                        utils.showErrorMessage(res.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    // ============================================================
    // ОЧИСТКА ТАБЛИЦЫ
    // ============================================================
    DC.clearTable = function() {
        if (!dataState.table || dataState.protected) return;

        var tableName = dataState.table;

        Swal.fire({
            title: '<i class="bi bi-trash3"></i> Очистить таблицу?',
            html:
                '<div class="text-start">' +
                '<div class="alert alert-danger small">' +
                '<i class="bi bi-exclamation-triangle"></i> ' +
                '<strong>Все строки таблицы ' +
                utils.escapeHtml(tableName) +
                ' будут удалены безвозвратно.</strong>' +
                '</div>' +
                '<p class="small text-muted mb-2">' +
                'Для подтверждения введите название таблицы:</p>' +
                '<input type="text" id="clear-confirm-input" ' +
                'class="form-control" placeholder="' +
                utils.escapeHtml(tableName) + '" autocomplete="off">' +
                '</div>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash3"></i> Удалить все строки',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            didOpen: function() {
                setTimeout(function() {
                    var el = document.getElementById('clear-confirm-input');
                    if (el) el.focus();
                }, 100);
            },
            preConfirm: function() {
                var v = (document.getElementById('clear-confirm-input').value || '').trim();
                if (v !== tableName) {
                    Swal.showValidationMessage('Введите точно: ' + tableName);
                    return false;
                }
                return true;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;

            Swal.fire({
                title: 'Удаление...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.delete(
                '/api/dev/db/table/' + encodeURIComponent(tableName) +
                '/clear?confirm=' + encodeURIComponent(tableName),
                { body: { confirm: tableName } }
            )
                .then(function(res) {
                    Swal.close();
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Удалено');
                        DC.loadTableData(0);
                    } else {
                        utils.showErrorMessage(res.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    Swal.close();
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    console.log('[dev_console_data] Загружено');
})();