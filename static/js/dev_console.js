// static/js/dev_console.js
// Консоль разработчика: БД, данные таблиц, SQL, логи, система.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[dev_console] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    var currentLogName = null;
    var currentTab = 'db';
    var loaded = { db: false, data: false, logs: false, system: false };
    var dataTablesCache = null;

    // Текущее состояние таблицы данных
    var dataState = {
        table: null,
        offset: 0,
        limit: 100,
        columns: [],
        hasId: false,
        protected: false,
    };

    // ============================================================
    // ТАБЫ
    // ============================================================
    function switchTab(name) {
        currentTab = name;
        $('.dev-tabs .nav-link').removeClass('active');
        $('.dev-tabs .nav-link[data-tab="' + name + '"]').addClass('active');

        $('.dev-tab-pane').removeClass('active');
        $('.dev-tab-pane[data-tab="' + name + '"]').addClass('active');

        if (name === 'db' && !loaded.db) {
            loaded.db = true;
            loadDbInfo();
            loadDbSchema();
        } else if (name === 'data' && !loaded.data) {
            loaded.data = true;
            loadTablesList();
        } else if (name === 'logs' && !loaded.logs) {
            loaded.logs = true;
            loadLogsList();
        } else if (name === 'system' && !loaded.system) {
            loaded.system = true;
            loadSystemInfo();
        }
    }

    // ============================================================
    // БД: ИНФО + СХЕМА
    // ============================================================
    function loadDbInfo() {
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
    }

    function loadDbSchema() {
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
                dataTablesCache = tables;

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
    }

    // ============================================================
    // ДАННЫЕ ТАБЛИЦ
    // ============================================================
    function loadTablesList() {
        if (dataTablesCache) {
            renderTablesSelect(dataTablesCache);
            return;
        }

        api.get('/api/dev/db/schema')
            .then(function(d) {
                if (d.error) {
                    $('#data-table-select').html('<option value="">Ошибка</option>');
                    return;
                }
                dataTablesCache = d.tables || [];
                renderTablesSelect(dataTablesCache);
            })
            .catch(function() {
                $('#data-table-select').html('<option value="">Ошибка</option>');
            });
    }

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

    function loadTableData(offset) {
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
    }

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
                if (v === null) {
                    text = '—';
                } else if (typeof v === 'object') {
                    text = JSON.stringify(v);
                } else {
                    text = String(v);
                }
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

    function viewTableData(tableName) {
        switchTab('data');

        setTimeout(function() {
            if (!dataTablesCache) {
                api.get('/api/dev/db/schema').then(function(d) {
                    dataTablesCache = d.tables || [];
                    renderTablesSelect(dataTablesCache);
                    $('#data-table-select').val(tableName);
                    loadTableData(0);
                });
            } else {
                $('#data-table-select').val(tableName);
                loadTableData(0);
            }
        }, 100);
    }

    function copyTableQuery(tableName) {
        var sql = 'SELECT * FROM ' + tableName + ' LIMIT 100';

        if (navigator.clipboard) {
            navigator.clipboard.writeText(sql).then(function() {
                utils.showSuccessMessage('Запрос скопирован в буфер');
            }).catch(function() {});
        }

        switchTab('query');
        setTimeout(function() {
            $('#sql-input').val(sql);
        }, 100);
    }

    // ============================================================
    // РЕДАКТИРОВАНИЕ СТРОКИ
    // ============================================================
    function editRow(rowId) {
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
    }

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
                    loadTableData(dataState.offset);
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
    function deleteRow(rowId) {
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
                        loadTableData(dataState.offset);
                    } else {
                        utils.showErrorMessage(res.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // ОЧИСТКА ТАБЛИЦЫ
    // ============================================================
    function clearTable() {
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

            // Передаём confirm и в body, и в query — двойная страховка
            api.delete(
                '/api/dev/db/table/' + encodeURIComponent(tableName) +
                '/clear?confirm=' + encodeURIComponent(tableName),
                { body: { confirm: tableName } }
            )
                .then(function(res) {
                    Swal.close();
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Удалено');
                        loadTableData(0);
                    } else {
                        utils.showErrorMessage(res.error || 'Ошибка');
                    }
                })
                .catch(function(err) {
                    Swal.close();
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // SQL
    // ============================================================
    function runQuery() {
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
    }

    // ============================================================
    // ЛОГИ — автозагрузка app.log
    // ============================================================
    function loadLogsList() {
        api.get('/api/dev/logs')
            .then(function(d) {
                if (d.error) {
                    $('#logs-list').html(
                        '<div class="p-3 text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var files = d.files || [];
                if (files.length === 0) {
                    $('#logs-list').html(
                        '<div class="p-3 text-muted">Логов нет</div>'
                    );
                    return;
                }

                var html = '<div class="list-group list-group-flush">';
                files.forEach(function(f) {
                    var isActive = (f.name === currentLogName);
                    html += '<a href="#" class="list-group-item list-group-item-action' +
                        (isActive ? ' active' : '') + '" ' +
                        'data-log-name="' + utils.escapeHtml(f.name) + '" ' +
                        'onclick="DevConsole.selectLog(\'' +
                        utils.escapeHtml(f.name) + '\'); return false;">' +
                        '<div class="d-flex justify-content-between">' +
                        '<div><i class="bi bi-file-text"></i> <strong>' +
                        utils.escapeHtml(f.name) + '</strong></div>' +
                        '<small class="' + (isActive ? '' : 'text-muted') + '">' +
                        f.size_human + '</small>' +
                        '</div>' +
                        '<small class="' + (isActive ? '' : 'text-muted') + '">' +
                        utils.formatDate(f.modified_at) + '</small>' +
                        '</a>';
                });
                html += '</div>';
                $('#logs-list').html(html);

                // Автозагрузка: app.log или первый файл
                if (!currentLogName) {
                    var preferred = files.find(function(f) {
                        return f.name === 'app.log';
                    }) || files[0];
                    if (preferred) {
                        selectLog(preferred.name);
                    }
                }
            });
    }

    function selectLog(name) {
        currentLogName = name;

        $('#logs-list .list-group-item').removeClass('active');
        $('#logs-list .list-group-item[data-log-name="' +
            name.replace(/"/g, '\\"') + '"]').addClass('active');

        $('#log-title').html(
            '<i class="bi bi-file-text"></i> ' + utils.escapeHtml(name) +
            ' <a href="/api/dev/logs/' + encodeURIComponent(name) +
            '/download" class="btn btn-sm btn-outline-light ms-2" ' +
            'title="Скачать"><i class="bi bi-download"></i></a>'
        );
        $('#log-lines').show();
        reloadLog();
    }

    function reloadLog() {
        if (!currentLogName) return;

        var lines = parseInt($('#log-lines').val(), 10) || 500;

        $('#log-viewer').html(
            '<div class="text-center py-4">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.get('/api/dev/logs/' + encodeURIComponent(currentLogName) +
                '?lines=' + lines)
            .then(function(d) {
                if (d.error) {
                    $('#log-viewer').html(
                        '<div class="log-hint text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var arr = d.lines || [];
                if (arr.length === 0) {
                    $('#log-viewer').html(
                        '<div class="log-hint">Файл пуст</div>'
                    );
                    return;
                }

                var startNum = (d.total_lines || arr.length) -
                    arr.length + 1;

                var html = '';

                if (d.total_lines > d.shown_lines) {
                    html += '<span class="log-hint">' +
                        '... показаны последние ' + d.shown_lines +
                        ' из ' + d.total_lines + ' строк' +
                        '</span>\n\n';
                }

                arr.forEach(function(line, i) {
                    var lineNum = startNum + i;
                    var cls = 'log-INFO';
                    if (line.indexOf('[ERROR]') !== -1) cls = 'log-ERROR';
                    else if (line.indexOf('[WARNING]') !== -1) cls = 'log-WARNING';
                    else if (line.indexOf('[DEBUG]') !== -1) cls = 'log-DEBUG';

                    var text = line.replace(/\n$/, '');
                    html += '<span class="log-line ' + cls + '">' +
                        '<span class="log-line-num">' + lineNum + '</span>' +
                        utils.escapeHtml(text) +
                        '</span>';
                });

                $('#log-viewer').html(html);
                $('#log-viewer').scrollTop($('#log-viewer')[0].scrollHeight);
            });
    }

    // ============================================================
    // СИСТЕМА
    // ============================================================
    function loadSystemInfo() {
        api.get('/api/dev/system-info')
            .then(function(d) {
                if (d.error) {
                    $('#sys-python').html(
                        '<div class="text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var html = '<table class="table table-sm mb-0">';
                html += '<tr><td>Python</td><td><strong>' +
                    utils.escapeHtml(d.python.version) + '</strong></td></tr>';
                html += '<tr><td>Платформа</td><td><small>' +
                    utils.escapeHtml(d.python.platform) + '</small></td></tr>';
                html += '<tr><td>Flask</td><td>' +
                    utils.escapeHtml(d.flask.version) + '</td></tr>';
                html += '<tr><td>Debug</td><td>' +
                    (d.flask.debug ? 'Да' : 'Нет') + '</td></tr>';
                html += '<tr><td>Сессии</td><td>' +
                    utils.escapeHtml(d.flask.session_type || '—') + '</td></tr>';
                html += '<tr><td>Кеш</td><td>' +
                    utils.escapeHtml(d.flask.cache_type || '—') + '</td></tr>';
                html += '</table>';
                $('#sys-python').html(html);

                var env = '<table class="table table-sm mb-0">';
                Object.keys(d.env || {}).forEach(function(k) {
                    env += '<tr><td><code>' + utils.escapeHtml(k) +
                        '</code></td><td>' +
                        utils.escapeHtml(d.env[k]) + '</td></tr>';
                });
                env += '</table>';
                $('#sys-env').html(env);

                var pkgs = '';
                (d.packages || []).forEach(function(p) {
                    pkgs += '<tr><td>' + utils.escapeHtml(p.name) + '</td>' +
                        '<td><code>' + utils.escapeHtml(p.version) +
                        '</code></td></tr>';
                });
                if (!pkgs) {
                    pkgs = '<tr><td colspan="2" class="text-muted">' +
                        'Пакеты не найдены</td></tr>';
                }
                $('#sys-packages').html(pkgs);
            });
    }

    // ============================================================
    // КЕШ
    // ============================================================
    function clearCache() {
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
    }

    // ============================================================
    // RELOAD ALL — с индикацией загрузки
    // ============================================================
    function reloadAll() {
        var $btn = $('#btn-reload-all');
        if (!$btn.length) return;

        var oldHtml = $btn.html();
        $btn.prop('disabled', true)
            .html('<span class="spinner-border spinner-border-sm"></span> Обновление...');

        // Сбрасываем всё состояние
        loaded = { db: false, data: false, logs: false, system: false };
        dataTablesCache = null;
        currentLogName = null;

        try {
            // Перезагружаем текущую вкладку
            switchTab(currentTab);

            // Дополнительно: если на вкладке логов — принудительно перезагружаем
            if (currentTab === 'logs') {
                loadLogsList();
            }
        } catch (e) {
            console.error('[dev_console] reloadAll error:', e);
        }

        // Возвращаем кнопку через 800 мс
        setTimeout(function() {
            $btn.prop('disabled', false).html(oldHtml);
            utils.showSuccessMessage('Данные обновлены');
        }, 800);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    window.DevConsole = {
        switchTab: switchTab,
        runQuery: runQuery,
        selectLog: selectLog,
        reloadLog: reloadLog,
        clearCache: clearCache,
        reloadAll: reloadAll,
        loadTableData: loadTableData,
        viewTableData: viewTableData,
        copyTableQuery: copyTableQuery,
        editRow: editRow,
        deleteRow: deleteRow,
        clearTable: clearTable,
    };

    // Перенимаем openUserSwitch/backToDev из dev_impersonate.js
    if (typeof window.openUserSwitch === 'function') {
        window.DevConsole.openUserSwitch = window.openUserSwitch;
    }
    if (typeof window.backToDev === 'function') {
        window.DevConsole.backToDev = window.backToDev;
    }

    $(document).ready(function() {
        if ($('#db-info-block').length === 0) return;
        loaded.db = true;
        loadDbInfo();
        loadDbSchema();
    });

    console.log('[dev_console] Загружено');
})();