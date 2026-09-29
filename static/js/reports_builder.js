// static/js/reports_builder.js
// Конструктор отчётов: поля, фильтры, группировка, метрики, шаблоны, экспорт.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[reports_builder] App не инициализирован');
        return;
    }

    var mod = window.App.register('Reports');
    var http = window.App.api;
    var utils = window.App.utils;

    // Текущий конфиг отчёта
    var config = {
        fields: ['id', 'created_date', 'cabinet', 'description', 'status', 'executor'],
        filters: {
            date_field: 'created_date',
            date_from: '',
            date_to: '',
            status: [],
            priority: [],
            work_type: '',
            executor: '',
            cabinet: '',
            from_user: '',
            search: '',
            tags: [],
        },
        group_by: [],
        metrics: [],
        sort: { by: 'created_date', order: 'DESC' },
        limit: 500,
    };

    var META = null;   // /api/reports/fields
    var RESULT = null; // последний результат
    var TEMPLATES = [];

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка конструктора...</p></div>'
        );

        Promise.all([
            http.get('/api/reports/fields'),
            http.get('/api/reports/templates').catch(function() { return []; }),
        ]).then(function(results) {
            META = results[0];
            TEMPLATES = Array.isArray(results[1]) ? results[1] : [];
            render();
        }).catch(function(err) {
            $block.html('<div class="alert alert-danger">' +
                'Ошибка: ' + utils.escapeHtml(err.message) + '</div>');
        });
    }

    // ============================================================
    // РЕНДЕР СТРАНИЦЫ
    // ============================================================
    function render() {
        var html = '';
        html += '<div class="rb-layout">';

        // -------- ЛЕВАЯ КОЛОНКА: поля, шаблоны --------
        html += '<div>';
        html += renderFieldsPanel();
        html += renderTemplatesPanel();
        html += '</div>';

        // -------- ПРАВАЯ КОЛОНКА: фильтры + группировка + превью --------
        html += '<div>';
        html += renderFiltersPanel();
        html += renderGroupingPanel();
        html += renderPreviewPanel();
        html += '</div>';

        html += '</div>';

        $('#otherPagesBlock').html(html);

        // Синхронизируем checkbox-и с конфигом
        syncFieldsUI();
        syncFiltersUI();
        syncGroupingUI();
    }

    // ============================================================
    // ПАНЕЛЬ ПОЛЕЙ
    // ============================================================
    function renderFieldsPanel() {
        var html = '<div class="rb-panel mb-3">';
        html += '<div class="rb-panel-head">' +
                '<span><i class="bi bi-list-ul"></i> Поля отчёта</span>' +
                '<button class="btn-ghost" onclick="App.Reports.clearFields()" ' +
                'title="Сбросить" style="padding:4px 8px;font-size:11px;">' +
                '<i class="bi bi-eraser"></i></button></div>';
        html += '<div class="rb-panel-body">';

        html += '<div class="rb-fields-list" id="rb-fields-list">';
        (META.fields || []).forEach(function(f) {
            var selected = config.fields.indexOf(f.key) !== -1;
            html += '<label class="rb-field-item' + (selected ? ' selected' : '') +
                '" data-key="' + f.key + '">' +
                '<input type="checkbox" ' + (selected ? 'checked' : '') +
                ' onchange="App.Reports.toggleField(\'' + f.key + '\', this.checked)">' +
                '<span>' + utils.escapeHtml(f.label) + '</span>' +
                '</label>';
        });
        html += '</div>';

        html += '</div></div>';
        return html;
    }

    // ============================================================
    // ПАНЕЛЬ ШАБЛОНОВ
    // ============================================================
    function renderTemplatesPanel() {
        var html = '<div class="rb-panel">';
        html += '<div class="rb-panel-head">' +
                '<span><i class="bi bi-bookmark"></i> Шаблоны</span>' +
                '<button class="btn-ghost" onclick="App.Reports.saveTemplate()" ' +
                'style="padding:4px 8px;font-size:11px;">' +
                '<i class="bi bi-plus"></i> Сохранить</button></div>';
        html += '<div class="rb-panel-body">';

        if (TEMPLATES.length === 0) {
            html += '<div class="text-muted small" style="text-align:center;padding:12px;">' +
                    'Шаблонов ещё нет</div>';
        } else {
            html += '<div class="rb-templates-list">';
            TEMPLATES.forEach(function(t) {
                var shared = t.is_shared
                    ? '<span class="rb-template-badge">Общий</span>'
                    : '';
                html += '<div class="rb-template-item" ' +
                    'onclick="App.Reports.applyTemplate(' + t.id + ')">' +
                    '<span class="rb-template-name">' +
                    utils.escapeHtml(t.name) + '</span>' +
                    shared +
                    '<div class="rb-template-actions">' +
                    '<button title="Обновить" ' +
                    'onclick="event.stopPropagation(); ' +
                    'App.Reports.updateTemplate(' + t.id + ')">' +
                    '<i class="bi bi-arrow-clockwise"></i></button>' +
                    '<button class="rb-del" title="Удалить" ' +
                    'onclick="event.stopPropagation(); ' +
                    'App.Reports.deleteTemplate(' + t.id + ')">' +
                    '<i class="bi bi-trash"></i></button>' +
                    '</div></div>';
            });
            html += '</div>';
        }

        html += '</div></div>';
        return html;
    }

    // ============================================================
    // ПАНЕЛЬ ФИЛЬТРОВ
    // ============================================================
    function renderFiltersPanel() {
        var F = META.filters;

        var html = '<div class="rb-panel mb-3">';
        html += '<div class="rb-panel-head">' +
                '<span><i class="bi bi-funnel"></i> Фильтры</span>' +
                '<button class="btn-ghost" onclick="App.Reports.resetFilters()" ' +
                'style="padding:4px 8px;font-size:11px;">' +
                '<i class="bi bi-x-circle"></i> Сбросить</button></div>';
        html += '<div class="rb-panel-body">';

        // Поле даты
        html += '<div class="rb-filter-row">' +
            '<label>Поле даты</label>' +
            '<select id="rb-f-date-field" onchange="App.Reports.onFilterChange()">';
        (F.date_fields || []).forEach(function(df) {
            html += '<option value="' + df.key + '">' + utils.escapeHtml(df.label) +
                '</option>';
        });
        html += '</select></div>';

        // Диапазон дат
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        html += '<div class="rb-filter-row"><label>С</label>' +
            '<input type="date" id="rb-f-date-from" onchange="App.Reports.onFilterChange()"></div>';
        html += '<div class="rb-filter-row"><label>По</label>' +
            '<input type="date" id="rb-f-date-to" onchange="App.Reports.onFilterChange()"></div>';
        html += '</div>';

        // Статусы (мульти)
        html += '<div class="rb-filter-row"><label>Статус</label>' +
            '<div class="rb-multiselect" id="rb-f-statuses">';
        (F.statuses || []).forEach(function(s) {
            html += '<label><input type="checkbox" value="' + utils.escapeHtml(s) +
                '" onchange="App.Reports.onMultiStatusChange()">' +
                utils.escapeHtml(s) + '</label>';
        });
        html += '</div></div>';

        // Приоритеты (мульти)
        html += '<div class="rb-filter-row"><label>Приоритет</label>' +
            '<div class="rb-multiselect" id="rb-f-priorities">';
        (F.priorities || []).forEach(function(p) {
            html += '<label><input type="checkbox" value="' + utils.escapeHtml(p) +
                '" onchange="App.Reports.onMultiPriorityChange()">' +
                utils.escapeHtml(p) + '</label>';
        });
        html += '</div></div>';

        // Тип работы
        html += '<div class="rb-filter-row"><label>Тип работы</label>' +
            '<select id="rb-f-work-type" onchange="App.Reports.onFilterChange()">' +
            '<option value="">— все —</option>';
        (F.work_types || []).forEach(function(t) {
            html += '<option value="' + utils.escapeHtml(t) + '">' +
                utils.escapeHtml(t) + '</option>';
        });
        html += '</select></div>';

        // Исполнитель
        html += '<div class="rb-filter-row"><label>Исполнитель</label>' +
            '<select id="rb-f-executor" onchange="App.Reports.onFilterChange()">' +
            '<option value="">— все —</option>';
        (F.executors || []).forEach(function(e) {
            html += '<option value="' + utils.escapeHtml(e) + '">' +
                utils.escapeHtml(e) + '</option>';
        });
        html += '</select></div>';

        // Кабинет
        html += '<div class="rb-filter-row"><label>Кабинет</label>' +
            '<select id="rb-f-cabinet" onchange="App.Reports.onFilterChange()">' +
            '<option value="">— все —</option>';
        (F.cabinets || []).forEach(function(c) {
            html += '<option value="' + utils.escapeHtml(c) + '">' +
                utils.escapeHtml(c) + '</option>';
        });
        html += '</select></div>';

        // Поиск по описанию
        html += '<div class="rb-filter-row"><label>Поиск</label>' +
            '<input type="text" id="rb-f-search" placeholder="Описание, ФИО..." ' +
            'oninput="App.Reports.onSearchInput()"></div>';

        html += '</div></div>';
        return html;
    }

    // ============================================================
    // ПАНЕЛЬ ГРУППИРОВКИ И МЕТРИК
    // ============================================================
    function renderGroupingPanel() {
        var groupableFields = (META.fields || []).filter(function(f) {
            return f.groupable;
        });

        var html = '<div class="rb-panel mb-3">';
        html += '<div class="rb-panel-head">' +
                '<span><i class="bi bi-bar-chart"></i> Группировка и метрики</span>' +
                '<button class="btn-ghost" onclick="App.Reports.clearGrouping()" ' +
                'style="padding:4px 8px;font-size:11px;">' +
                '<i class="bi bi-eraser"></i></button></div>';
        html += '<div class="rb-panel-body">';

        // Группировка
        html += '<div class="rb-section-title">Группировать по</div>';
        html += '<div class="rb-chip-list" id="rb-group-list">';
        groupableFields.forEach(function(f) {
            var selected = config.group_by.indexOf(f.key) !== -1;
            html += '<span class="rb-chip' + (selected ? ' rb-chip-selected' : '') +
                '" data-key="' + f.key + '" ' +
                'onclick="App.Reports.toggleGroupBy(\'' + f.key + '\')">' +
                utils.escapeHtml(f.label);
            if (selected) {
                html += ' <span class="rb-chip-remove">×</span>';
            }
            html += '</span>';
        });
        html += '</div>';

        // Метрики
        html += '<div class="rb-section-title">Метрики (агрегаты)</div>';
        html += '<div class="rb-chip-list" id="rb-metric-list">';
        (META.metrics || []).forEach(function(m) {
            var selected = config.metrics.indexOf(m.key) !== -1;
            html += '<span class="rb-chip rb-chip-metric' +
                (selected ? ' rb-chip-selected' : '') +
                '" data-key="' + m.key + '" ' +
                'onclick="App.Reports.toggleMetric(\'' + m.key + '\')">' +
                utils.escapeHtml(m.label);
            if (selected) {
                html += ' <span class="rb-chip-remove">×</span>';
            }
            html += '</span>';
        });
        html += '</div>';

        // Лимит
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px;">';
        html += '<div class="rb-filter-row"><label>Сортировка</label>' +
            '<select id="rb-f-sort-by" onchange="App.Reports.onSortChange()">' +
            '<option value="created_date">Дата создания</option>' +
            '<option value="deadline">Срок</option>' +
            '<option value="status">Статус</option>' +
            '<option value="priority">Приоритет</option>' +
            '<option value="executor">Исполнитель</option>' +
            '<option value="cabinet">Кабинет</option>' +
            '</select></div>';
        html += '<div class="rb-filter-row"><label>Направление</label>' +
            '<select id="rb-f-sort-order" onchange="App.Reports.onSortChange()">' +
            '<option value="DESC">Убывание</option>' +
            '<option value="ASC">Возрастание</option>' +
            '</select></div>';
        html += '</div>';

        html += '<div class="rb-filter-row"><label>Лимит строк</label>' +
            '<input type="number" id="rb-f-limit" min="10" max="10000" value="500" ' +
            'onchange="App.Reports.onLimitChange()"></div>';

        // Кнопки
        html += '<div class="rb-actions">';
        html += '<button class="btn-primary" onclick="App.Reports.runReport()">' +
                '<i class="bi bi-play-fill"></i> Выполнить</button>';
        html += '<button class="btn-ghost" onclick="App.Reports.exportXlsx()">' +
                '<i class="bi bi-file-earmark-excel"></i> Экспорт XLSX</button>';
        html += '</div>';

        html += '</div></div>';
        return html;
    }

    // ============================================================
    // ПАНЕЛЬ ПРЕВЬЮ
    // ============================================================
    function renderPreviewPanel() {
        var html = '<div class="rb-panel" id="rb-preview-panel">';
        html += '<div class="rb-panel-head">' +
                '<span><i class="bi bi-table"></i> Результат</span>' +
                '<span class="text-muted" id="rb-result-meta" ' +
                'style="font-size:11px;font-weight:500;"></span></div>';
        html += '<div id="rb-preview-body">';
        html += '<div class="text-muted" style="padding:30px;text-align:center;">' +
                'Настройте параметры и нажмите «Выполнить»</div>';
        html += '</div></div>';
        return html;
    }

    // ============================================================
    // СИНХРОНИЗАЦИЯ UI С КОНФИГОМ
    // ============================================================
    function syncFieldsUI() {
        $('#rb-fields-list .rb-field-item').each(function() {
            var key = $(this).attr('data-key');
            var selected = config.fields.indexOf(key) !== -1;
            $(this).toggleClass('selected', selected);
            $(this).find('input[type="checkbox"]').prop('checked', selected);
        });
    }

    function syncFiltersUI() {
        var F = config.filters;

        $('#rb-f-date-field').val(F.date_field || 'created_date');
        $('#rb-f-date-from').val(F.date_from || '');
        $('#rb-f-date-to').val(F.date_to || '');

        $('#rb-f-statuses input[type="checkbox"]').each(function() {
            $(this).prop('checked', (F.status || []).indexOf($(this).val()) !== -1);
        });
        $('#rb-f-priorities input[type="checkbox"]').each(function() {
            $(this).prop('checked', (F.priority || []).indexOf($(this).val()) !== -1);
        });

        $('#rb-f-work-type').val(F.work_type || '');
        $('#rb-f-executor').val(F.executor || '');
        $('#rb-f-cabinet').val(F.cabinet || '');
        $('#rb-f-search').val(F.search || '');
    }

    function syncGroupingUI() {
        $('#rb-group-list .rb-chip').each(function() {
            var key = $(this).attr('data-key');
            var sel = config.group_by.indexOf(key) !== -1;
            $(this).toggleClass('rb-chip-selected', sel);
        });
        $('#rb-metric-list .rb-chip').each(function() {
            var key = $(this).attr('data-key');
            var sel = config.metrics.indexOf(key) !== -1;
            $(this).toggleClass('rb-chip-selected', sel);
        });

        $('#rb-f-sort-by').val(config.sort.by || 'created_date');
        $('#rb-f-sort-order').val(config.sort.order || 'DESC');
        $('#rb-f-limit').val(config.limit || 500);
    }

    // ============================================================
    // ДЕЙСТВИЯ
    // ============================================================
    function toggleField(key, checked) {
        var idx = config.fields.indexOf(key);
        if (checked && idx === -1) {
            config.fields.push(key);
        } else if (!checked && idx !== -1) {
            config.fields.splice(idx, 1);
        }
        syncFieldsUI();
    }

    function clearFields() {
        config.fields = [];
        syncFieldsUI();
    }

    function toggleGroupBy(key) {
        var idx = config.group_by.indexOf(key);
        if (idx === -1) {
            config.group_by.push(key);
        } else {
            config.group_by.splice(idx, 1);
        }
        syncGroupingUI();
    }

    function toggleMetric(key) {
        var idx = config.metrics.indexOf(key);
        if (idx === -1) {
            config.metrics.push(key);
        } else {
            config.metrics.splice(idx, 1);
        }
        syncGroupingUI();
    }

    function clearGrouping() {
        config.group_by = [];
        config.metrics = [];
        syncGroupingUI();
    }

    function onFilterChange() {
        config.filters.date_field = $('#rb-f-date-field').val() || 'created_date';
        config.filters.date_from = $('#rb-f-date-from').val() || '';
        config.filters.date_to = $('#rb-f-date-to').val() || '';
        config.filters.work_type = $('#rb-f-work-type').val() || '';
        config.filters.executor = $('#rb-f-executor').val() || '';
        config.filters.cabinet = $('#rb-f-cabinet').val() || '';
    }

    function onMultiStatusChange() {
        var arr = [];
        $('#rb-f-statuses input[type="checkbox"]:checked').each(function() {
            arr.push($(this).val());
        });
        config.filters.status = arr;
    }

    function onMultiPriorityChange() {
        var arr = [];
        $('#rb-f-priorities input[type="checkbox"]:checked').each(function() {
            arr.push($(this).val());
        });
        config.filters.priority = arr;
    }

    var searchTimer = null;
    function onSearchInput() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function() {
            config.filters.search = $('#rb-f-search').val() || '';
        }, 300);
    }

    function onSortChange() {
        config.sort.by = $('#rb-f-sort-by').val() || 'created_date';
        config.sort.order = $('#rb-f-sort-order').val() || 'DESC';
    }

    function onLimitChange() {
        var v = parseInt($('#rb-f-limit').val(), 10);
        config.limit = isNaN(v) ? 500 : Math.max(10, Math.min(10000, v));
    }

    function resetFilters() {
        config.filters = {
            date_field: 'created_date',
            date_from: '',
            date_to: '',
            status: [],
            priority: [],
            work_type: '',
            executor: '',
            cabinet: '',
            from_user: '',
            search: '',
            tags: [],
        };
        syncFiltersUI();
    }

    // ============================================================
    // ЗАПУСК ОТЧЁТА
    // ============================================================
    function runReport() {
        // Забираем актуальные значения фильтров
        onFilterChange();
        onMultiStatusChange();
        onMultiPriorityChange();
        onSortChange();
        onLimitChange();

        $('#rb-preview-body').html(
            '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>'
        );

        http.post('/api/reports/run', config)
            .then(function(res) {
                if (!res.success) {
                    $('#rb-preview-body').html(
                        '<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(res.error || 'Ошибка') + '</div>'
                    );
                    return;
                }
                RESULT = res;
                renderResult(res);
            })
            .catch(function(err) {
                $('#rb-preview-body').html(
                    '<div class="alert alert-danger m-3">' +
                    utils.escapeHtml(err.message || 'Ошибка') + '</div>'
                );
            });
    }

    function renderResult(res) {
        var headers = res.headers || [];
        var rows = res.rows || [];

        var meta = 'Найдено: ' + (res.total || 0);
        if (res.is_grouped) meta += ' · сгруппировано';
        if (res.truncated) meta += ' · показаны не все (лимит)';
        $('#rb-result-meta').text(meta);

        if (rows.length === 0) {
            $('#rb-preview-body').html(
                '<div class="rb-empty" style="padding:40px;text-align:center;color:var(--text-muted);">' +
                'Нет данных по заданным условиям</div>'
            );
            return;
        }

        var html = '<div class="rb-preview-wrap"><table class="rb-preview-table">';
        html += '<thead><tr>';
        headers.forEach(function(h) {
            html += '<th>' + utils.escapeHtml(h.label) + '</th>';
        });
        html += '</tr></thead><tbody>';

        var showRows = rows.slice(0, 500);
        showRows.forEach(function(row) {
            html += '<tr>';
            headers.forEach(function(h) {
                var v = row[h.key];
                if (v === null || v === undefined) v = '';
                var text = String(v);
                html += '<td title="' + utils.escapeHtml(text) + '">' +
                    utils.escapeHtml(utils.truncateText(text, 200)) +
                    '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        if (rows.length > showRows.length) {
            html += '<div class="rb-preview-meta">' +
                'Показаны первые ' + showRows.length + ' из ' + rows.length +
                ' строк. Экспортируйте в XLSX, чтобы получить все.' +
                '</div>';
        }

        $('#rb-preview-body').html(html);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    function exportXlsx() {
        // Актуализируем конфиг
        onFilterChange();
        onMultiStatusChange();
        onMultiPriorityChange();
        onSortChange();
        onLimitChange();

        // Отправим POST через форму
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '/api/reports/export';
        form.style.display = 'none';

        // CSRF-токен из meta
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfMeta) {
            var inp = document.createElement('input');
            inp.type = 'hidden';
            inp.name = 'csrf_token';
            inp.value = csrfMeta.getAttribute('content') || '';
            form.appendChild(inp);
        }

        // config — как JSON-строка
        var inpCfg = document.createElement('input');
        inpCfg.type = 'hidden';
        inpCfg.name = 'config';
        inpCfg.value = JSON.stringify(config);
        form.appendChild(inpCfg);

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    }

    // ============================================================
    // ШАБЛОНЫ
    // ============================================================
    function saveTemplate() {
        Swal.fire({
            title: '<i class="bi bi-bookmark-plus"></i> Сохранить шаблон',
            html:
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Название *</label>' +
                '<input id="rb-tpl-name" class="form-control" placeholder="Мой отчёт"></div>' +
                '<div class="mb-2"><label class="form-label">Описание</label>' +
                '<textarea id="rb-tpl-desc" class="form-control" rows="2"></textarea></div>' +
                '<div class="form-check">' +
                '<input type="checkbox" id="rb-tpl-shared" class="form-check-input">' +
                '<label class="form-check-label" for="rb-tpl-shared">' +
                'Поделиться со всеми пользователями</label></div>' +
                '</div>',
            width: 480,
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#4e73df',
            preConfirm: function() {
                var name = ($('#rb-tpl-name').val() || '').trim();
                if (!name) {
                    Swal.showValidationMessage('Введите название');
                    return false;
                }
                return {
                    name: name,
                    description: ($('#rb-tpl-desc').val() || '').trim(),
                    is_shared: $('#rb-tpl-shared').is(':checked') ? 1 : 0,
                    config: config,
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/reports/templates', r.value).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Шаблон сохранён');
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    function applyTemplate(tid) {
        var t = TEMPLATES.find(function(x) { return x.id === tid; });
        if (!t) return;

        Swal.fire({
            title: 'Применить шаблон?',
            text: t.name,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Применить',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (!r.isConfirmed) return;

            // Копируем конфиг из шаблона
            var cfg = t.config || {};
            config.fields = cfg.fields || [];
            config.filters = Object.assign({}, config.filters, cfg.filters || {});
            config.group_by = cfg.group_by || [];
            config.metrics = cfg.metrics || [];
            config.sort = cfg.sort || { by: 'created_date', order: 'DESC' };
            config.limit = cfg.limit || 500;

            syncFieldsUI();
            syncFiltersUI();
            syncGroupingUI();
            utils.showSuccessMessage('Шаблон применён');
        });
    }

    function updateTemplate(tid) {
        var t = TEMPLATES.find(function(x) { return x.id === tid; });
        if (!t) return;

        Swal.fire({
            title: 'Обновить шаблон?',
            html: 'Текущие настройки отчёта будут сохранены в шаблон ' +
                '<strong>' + utils.escapeHtml(t.name) + '</strong>.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Обновить',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.put('/api/reports/templates/' + tid, {
                name: t.name,
                description: t.description,
                is_shared: t.is_shared ? 1 : 0,
                config: config,
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Шаблон обновлён');
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    function deleteTemplate(tid) {
        Swal.fire({
            title: 'Удалить шаблон?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/reports/templates/' + tid).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Шаблон удалён');
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    // ============================================================
    // ЭКСПОРТ МОДУЛЯ
    // ============================================================
    mod.load = load;
    mod.toggleField = toggleField;
    mod.clearFields = clearFields;
    mod.toggleGroupBy = toggleGroupBy;
    mod.toggleMetric = toggleMetric;
    mod.clearGrouping = clearGrouping;
    mod.onFilterChange = onFilterChange;
    mod.onMultiStatusChange = onMultiStatusChange;
    mod.onMultiPriorityChange = onMultiPriorityChange;
    mod.onSearchInput = onSearchInput;
    mod.onSortChange = onSortChange;
    mod.onLimitChange = onLimitChange;
    mod.resetFilters = resetFilters;
    mod.runReport = runReport;
    mod.exportXlsx = exportXlsx;
    mod.saveTemplate = saveTemplate;
    mod.applyTemplate = applyTemplate;
    mod.updateTemplate = updateTemplate;
    mod.deleteTemplate = deleteTemplate;

    console.log('[reports_builder] Загружено');
})();