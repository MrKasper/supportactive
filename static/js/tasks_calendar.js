// static/js/tasks_calendar.js
// Календарь заявок: месяц/неделя, фильтры, drag-n-drop по датам.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[tasks_calendar] App не инициализирован');
        return;
    }

    var mod = window.App.register('TasksCalendar');
    var http = window.App.api;
    var utils = window.App.utils;

    var WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    var state = {
        view: 'month',
        anchor: new Date(),
        dateField: 'deadline',
        data: null,
        loaded: false,
        filtersMeta: null,   // ← данные из /api/filters + /api/executors
    };

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function fmtDay(d) {
        return d.getDate() + ' ' + MONTHS_RU[d.getMonth()].slice(0, 3).toLowerCase();
    }

    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
    function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

    function startOfWeek(d) {
        var day = (d.getDay() + 6) % 7;
        var r = new Date(d);
        r.setDate(r.getDate() - day);
        return r;
    }
    function endOfWeek(d) {
        var r = startOfWeek(d);
        r.setDate(r.getDate() + 6);
        return r;
    }

    function statusClass(s) {
        switch (s) {
            case 'Новое':     return 'tc-st-new';
            case 'В работе':  return 'tc-st-in-progress';
            case 'Выполнено': return 'tc-st-completed';
            case 'Отменено':  return 'tc-st-cancelled';
            default:          return 'tc-st-new';
        }
    }

    // ============================================================
    // СОХРАНЕНИЕ / ВОССТАНОВЛЕНИЕ ФИЛЬТРОВ
    // ============================================================
    function readFiltersFromUI() {
        return {
            status:      $('#tc-f-status').val() || '',
            priority:    $('#tc-f-priority').val() || '',
            executor:    $('#tc-f-executor').val() || '',
            cabinet:     $('#tc-f-cabinet').val() || '',
            work_type:   $('#tc-f-work-type').val() || '',
        };
    }

    function applyFiltersToUI(filters) {
        filters = filters || {};
        $('#tc-f-status').val(filters.status || '');
        $('#tc-f-priority').val(filters.priority || '');
        $('#tc-f-executor').val(filters.executor || '');
        $('#tc-f-cabinet').val(filters.cabinet || '');
        $('#tc-f-work-type').val(filters.work_type || '');
        $('#tc-date-field').val(state.dateField);
    }

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка календаря...</p></div>'
        );

        Promise.all([
            http.get('/api/filters').catch(function() { return {}; }),
            http.get('/api/executors').catch(function() { return []; }),
        ]).then(function(results) {
            var baseMeta = results[0] || {};
            var executorsRaw = Array.isArray(results[1]) ? results[1] : [];

            // Только Техники
            var techs = executorsRaw.filter(function(e) {
                return e && e.role === 'Техник';
            });

            state.filtersMeta = {
                statuses: baseMeta.statuses || ['Новое', 'В работе', 'Выполнено', 'Отменено'],
                priorities: baseMeta.priorities || ['Высокий', 'Средний', 'Низкий'],
                work_types: baseMeta.work_types || [],
                cabinets: baseMeta.cabinets || [],
                executors: techs,
            };

            renderShell();
            fetchAndRender();
        });
    }

    // ============================================================
    // РЕНДЕР ОБОЛОЧКИ (не зависит от filters)
    // ============================================================
    function renderShell() {
        var meta = state.filtersMeta || {};
        var savedFilters = readFiltersFromUI();

        var html = '';

        html += '<div class="tc-wrap">';

        // Тулбар
        html += '<div class="tc-toolbar">';
        html += '<div class="tc-toolbar-left">';
        html += '<div class="tc-view-switch">';
        html += '<button type="button" class="' + (state.view === 'month' ? 'active' : '') +
                '" onclick="App.TasksCalendar.setView(\'month\')">Месяц</button>';
        html += '<button type="button" class="' + (state.view === 'week' ? 'active' : '') +
                '" onclick="App.TasksCalendar.setView(\'week\')">Неделя</button>';
        html += '</div>';
        html += '<button class="btn-ghost" onclick="App.TasksCalendar.shift(-1)">' +
                '<i class="bi bi-chevron-left"></i></button>';
        html += '<span class="tc-period-title" id="tc-period-title">—</span>';
        html += '<button class="btn-ghost" onclick="App.TasksCalendar.shift(1)">' +
                '<i class="bi bi-chevron-right"></i></button>';
        html += '<button class="btn-ghost" onclick="App.TasksCalendar.goToday()">Сегодня</button>';
        html += '</div>';

        html += '<div class="tc-toolbar-right">';
        html += '<select class="form-select form-select-sm" id="tc-date-field" ' +
                'style="width:auto;" onchange="App.TasksCalendar.onDateFieldChange()">' +
                '<option value="deadline">По сроку</option>' +
                '<option value="created_date">По дате создания</option>' +
                '<option value="completed_date">По дате выполнения</option>' +
                '</select>';
        html += '<button class="btn-ghost" onclick="App.TasksCalendar.load()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '</div>';
        html += '</div>';

        // Фильтры
        html += '<div class="tc-filters">';

        html += '<div class="field"><label>Статус</label>' +
            '<select id="tc-f-status" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        (meta.statuses || []).forEach(function(s) {
            html += '<option value="' + utils.escapeHtml(s) + '">' +
                utils.escapeHtml(s) + '</option>';
        });
        html += '</select></div>';

        html += '<div class="field"><label>Приоритет</label>' +
            '<select id="tc-f-priority" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        (meta.priorities || []).forEach(function(p) {
            html += '<option value="' + utils.escapeHtml(p) + '">' +
                utils.escapeHtml(p) + '</option>';
        });
        html += '</select></div>';

        // Только Техники
        html += '<div class="field"><label>Исполнитель</label>' +
            '<select id="tc-f-executor" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        (meta.executors || []).forEach(function(e) {
            var name = e.full_name || '';
            if (!name) return;
            html += '<option value="' + utils.escapeHtml(name) + '">' +
                utils.escapeHtml(name) + '</option>';
        });
        html += '</select></div>';

        html += '<div class="field"><label>Кабинет</label>' +
            '<select id="tc-f-cabinet" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        (meta.cabinets || []).forEach(function(c) {
            html += '<option value="' + utils.escapeHtml(c) + '">' +
                utils.escapeHtml(c) + '</option>';
        });
        html += '</select></div>';

        html += '<div class="field"><label>Тип работы</label>' +
            '<select id="tc-f-work-type" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        (meta.work_types || []).forEach(function(t) {
            html += '<option value="' + utils.escapeHtml(t) + '">' +
                utils.escapeHtml(t) + '</option>';
        });
        html += '</select></div>';

        html += '<div class="field" style="justify-content:flex-end;">' +
            '<button class="btn-ghost" onclick="App.TasksCalendar.resetFilters()">' +
            '<i class="bi bi-x-circle"></i> Сбросить</button></div>';

        html += '</div>';

        // Контейнер календаря
        html += '<div id="tc-calendar-container">' +
            '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>' +
            '</div>';

        html += '</div>';

        $('#otherPagesBlock').html(html);

        // Восстанавливаем фильтры и поле даты
        applyFiltersToUI(savedFilters);
        $('#tc-date-field').val(state.dateField);
    }

    // ============================================================
    // ДИАПАЗОН
    // ============================================================
    function computeRange() {
        if (state.view === 'month') {
            var from = startOfMonth(state.anchor);
            var to = endOfMonth(state.anchor);
            var gridStart = startOfWeek(from);
            var gridEnd = endOfWeek(to);
            return { from: gridStart, to: gridEnd, display: from, displayEnd: to };
        }
        var from = startOfWeek(state.anchor);
        var to = endOfWeek(state.anchor);
        return { from: from, to: to, display: from, displayEnd: to };
    }

    function buildQuery(range) {
        var params = new URLSearchParams();
        params.append('from', iso(range.from));
        params.append('to', iso(range.to));
        params.append('date_field', state.dateField);

        var f = readFiltersFromUI();
        if (f.status)    params.append('status', f.status);
        if (f.priority)  params.append('priority', f.priority);
        if (f.executor)  params.append('executor', f.executor);
        if (f.cabinet)   params.append('cabinet', f.cabinet);
        if (f.work_type) params.append('work_type', f.work_type);

        if (window.currentUserRole === 'Техник' && window.currentUserFullName) {
            params.append('for_technician', window.currentUserFullName);
        }

        return params;
    }

    // ============================================================
    // ЗАГРУЗКА И РЕНДЕР
    // ============================================================
    function fetchAndRender() {
        var range = computeRange();
        var params = buildQuery(range);

        http.get('/api/tasks/calendar?' + params.toString())
            .then(function(data) {
                if (data.error) {
                    $('#tc-calendar-container').html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(data.error) + '</div>'
                    );
                    return;
                }
                state.data = data;
                state.loaded = true;
                render(range);
            })
            .catch(function(err) {
                $('#tc-calendar-container').html(
                    '<div class="alert alert-danger">' +
                    'Ошибка загрузки: ' + utils.escapeHtml(err.message) + '</div>'
                );
            });
    }

    function render(range) {
        var title;
        if (state.view === 'month') {
            title = MONTHS_RU[range.display.getMonth()] + ' ' + range.display.getFullYear();
        } else {
            title = fmtDay(range.display) + ' — ' + fmtDay(range.displayEnd) +
                    ' ' + range.displayEnd.getFullYear();
        }
        $('#tc-period-title').text(title);

        var days = (state.data && state.data.days) || {};
        var today = iso(new Date());

        var html = '<div class="tc-calendar">';

        WEEKDAYS_SHORT.forEach(function(w) {
            html += '<div class="tc-day-head">' + w + '</div>';
        });

        var cursor = new Date(range.from);
        while (cursor <= range.to) {
            var dStr = iso(cursor);
            var isToday = (dStr === today);
            var dow = cursor.getDay();
            var isWeekend = (dow === 0 || dow === 6);
            var tasks = days[dStr] || [];

            var cls = 'tc-cell';
            if (isToday) cls += ' tc-today';
            if (isWeekend) cls += ' tc-weekend';

            html += '<div class="' + cls + '" data-date="' + dStr + '">';
            html += '<div class="tc-day-num">';
            html += '<span>' + cursor.getDate() + '</span>';
            if (tasks.length > 0) {
                html += '<span class="tc-day-count">' + tasks.length + '</span>';
            }
            html += '</div>';

            tasks.slice(0, 4).forEach(function(t) {
                html += renderTask(t);
            });
            if (tasks.length > 4) {
                html += '<div class="tc-task-more" ' +
                    'onclick="App.TasksCalendar.showDay(\'' + dStr + '\')">' +
                    '+' + (tasks.length - 4) + ' ещё</div>';
            }

            html += '</div>';

            cursor.setDate(cursor.getDate() + 1);
        }

        html += '</div>';

        $('#tc-calendar-container').html(html);
        enableDragDrop();
    }

    function renderTask(t) {
        var cls = 'tc-task ' + statusClass(t.status);
        if (t.is_overdue) cls += ' tc-overdue';
        var label = '#' + t.id + ' ' + (t.description || 'Без описания');
        return '<span class="' + cls + '" draggable="true" ' +
            'data-task-id="' + t.id + '" ' +
            'title="' + utils.escapeHtml(label) + '" ' +
            'onclick="event.stopPropagation(); viewTask(' + t.id + ')">' +
            utils.escapeHtml(utils.truncateText(label, 40)) +
            '</span>';
    }

    // ============================================================
    // DRAG-N-DROP
    // ============================================================
    function enableDragDrop() {
        if (window.currentUserRole === 'Пользователь') return;
        if (window.currentUserRole === 'Техник') return;

        var draggedTaskId = null;

        $('#tc-calendar-container')
            .off('dragstart.tc dragend.tc dragover.tc dragleave.tc drop.tc')
            .on('dragstart.tc', '.tc-task', function(e) {
                draggedTaskId = parseInt($(this).attr('data-task-id'), 10);
                e.originalEvent.dataTransfer.effectAllowed = 'move';
                e.originalEvent.dataTransfer.setData('text/plain', String(draggedTaskId));
                $(this).css('opacity', '0.4');
            })
            .on('dragend.tc', '.tc-task', function() {
                $(this).css('opacity', '');
                $('.tc-cell').removeClass('tc-drag-over');
            })
            .on('dragover.tc', '.tc-cell', function(e) {
                if (!draggedTaskId) return;
                e.preventDefault();
                e.originalEvent.dataTransfer.dropEffect = 'move';
                $('.tc-cell').removeClass('tc-drag-over');
                $(this).addClass('tc-drag-over');
            })
            .on('dragleave.tc', '.tc-cell', function(e) {
                if (e.relatedTarget && this.contains(e.relatedTarget)) return;
                $(this).removeClass('tc-drag-over');
            })
            .on('drop.tc', '.tc-cell', function(e) {
                e.preventDefault();
                $(this).removeClass('tc-drag-over');
                if (!draggedTaskId) return;

                var newDate = $(this).attr('data-date');
                if (!newDate) return;

                moveTask(draggedTaskId, newDate);
                draggedTaskId = null;
            });
    }

    function moveTask(taskId, newDate) {
        http.get('/api/task/' + taskId)
            .then(function(task) {
                if (task.error) {
                    utils.showErrorMessage(task.error);
                    return;
                }

                var oldDeadline = task.deadline || '';
                var timePart = '12:00:00';
                if (oldDeadline && oldDeadline.indexOf(' ') !== -1) {
                    timePart = oldDeadline.split(' ')[1];
                }
                var newDeadline = newDate + ' ' + timePart;

                return http.post('/api/update_task/' + taskId, {
                    deadline: newDeadline,
                });
            })
            .then(function(res) {
                if (res && res.success) {
                    utils.showSuccessMessage('Срок заявки обновлён');
                    fetchAndRender();
                } else if (res && res.error) {
                    utils.showErrorMessage(res.error);
                }
            })
            .catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка перемещения');
            });
    }

    // ============================================================
    // ДЕЙСТВИЯ
    // ============================================================
    function setView(v) {
        if (state.view === v) return;
        state.view = v;
        renderShell();
        fetchAndRender();
    }

    function shift(delta) {
        if (state.view === 'month') {
            state.anchor = new Date(
                state.anchor.getFullYear(),
                state.anchor.getMonth() + delta,
                1
            );
        } else {
            var d = new Date(state.anchor);
            d.setDate(d.getDate() + 7 * delta);
            state.anchor = d;
        }
        fetchAndRender();
    }

    function goToday() {
        state.anchor = new Date();
        fetchAndRender();
    }

    function onDateFieldChange() {
        state.dateField = $('#tc-date-field').val() || 'deadline';
        fetchAndRender();
    }

    function applyFilters() {
        fetchAndRender();
    }

    function resetFilters() {
        $('#tc-f-status, #tc-f-priority, #tc-f-executor, #tc-f-cabinet, #tc-f-work-type').val('');
        fetchAndRender();
    }

    function showDay(dateStr) {
        var days = (state.data && state.data.days) || {};
        var tasks = days[dateStr] || [];
        if (tasks.length === 0) {
            utils.showErrorMessage('Нет заявок в этот день');
            return;
        }

        var html = '<div class="text-start">';
        tasks.forEach(function(t) {
            var cls = statusClass(t.status);
            html += '<div class="d-flex align-items-start gap-2 mb-2 pb-2" ' +
                'style="border-bottom:1px solid var(--border);">' +
                '<span class="badge" style="background:var(--surface-2);color:var(--text);">' +
                '#' + t.id + '</span>' +
                '<div style="flex:1;min-width:0;">' +
                '<a href="#" onclick="Swal.close(); viewTask(' + t.id +
                '); return false;" style="font-weight:600;">' +
                utils.escapeHtml(utils.truncateText(t.description || '', 80)) +
                '</a>' +
                '<div class="text-muted" style="font-size:11px;">' +
                utils.escapeHtml(t.cabinet || '—') + ' · ' +
                utils.escapeHtml(t.executor || 'не назначен') +
                '</div></div>' +
                '<span class="tc-task ' + cls + '" style="pointer-events:none;">' +
                utils.escapeHtml(t.status || '') +
                '</span></div>';
        });
        html += '</div>';

        Swal.fire({
            title: dateStr,
            html: html,
            width: 600,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = load;
    mod.setView = setView;
    mod.shift = shift;
    mod.goToday = goToday;
    mod.onDateFieldChange = onDateFieldChange;
    mod.applyFilters = applyFilters;
    mod.resetFilters = resetFilters;
    mod.showDay = showDay;

    console.log('[tasks_calendar] Загружено');
})();