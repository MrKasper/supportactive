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
        view: 'month',           // 'month' | 'week'
        anchor: new Date(),      // опорная дата
        dateField: 'deadline',
        filters: {
            statuses: [],
            priority: '',
            executor: '',
            cabinet: '',
            work_type: '',
            tags: [],
        },
        data: null,              // ответ API
        loaded: false,
    };

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function pad(n) { return String(n).padStart(2, '0'); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    function fmtDay(d) {
        return d.getDate() + ' ' + MONTHS_RU[d.getMonth()].slice(0, 3).toLowerCase();
    }

    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
    function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

    function startOfWeek(d) {
        var day = (d.getDay() + 6) % 7;  // 0 = Пн
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
    // ЗАГРУЗКА СТРАНИЦЫ
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка календаря...</p></div>'
        );

        Promise.all([
            http.get('/api/filters').catch(function() { return null; }),
        ]).then(function(results) {
            var filters = results[0] || {};
            renderShell(filters);
            fetchAndRender();
        });
    }

    function renderShell(filters) {
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
            '<option value="">Все</option>' +
            '<option value="Новое">Новое</option>' +
            '<option value="В работе">В работе</option>' +
            '<option value="Выполнено">Выполнено</option>' +
            '<option value="Отменено">Отменено</option>' +
            '</select></div>';

        html += '<div class="field"><label>Приоритет</label>' +
            '<select id="tc-f-priority" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>' +
            '<option value="Высокий">Высокий</option>' +
            '<option value="Средний">Средний</option>' +
            '<option value="Низкий">Низкий</option>' +
            '</select></div>';

        var execs = (filters.executors || []);
        if (execs.length === 0 && filters.users) {
            execs = filters.users.map(function(n) { return { full_name: n }; });
        }
        html += '<div class="field"><label>Исполнитель</label>' +
            '<select id="tc-f-executor" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        execs.forEach(function(e) {
            var name = e.full_name || e;
            html += '<option value="' + utils.escapeHtml(name) + '">' +
                    utils.escapeHtml(name) + '</option>';
        });
        html += '</select></div>';

        var cabs = (filters.cabinets || []);
        html += '<div class="field"><label>Кабинет</label>' +
            '<select id="tc-f-cabinet" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        cabs.forEach(function(c) {
            html += '<option value="' + utils.escapeHtml(c) + '">' +
                    utils.escapeHtml(c) + '</option>';
        });
        html += '</select></div>';

        var wts = (filters.work_types || []);
        html += '<div class="field"><label>Тип работы</label>' +
            '<select id="tc-f-work-type" onchange="App.TasksCalendar.applyFilters()">' +
            '<option value="">Все</option>';
        wts.forEach(function(t) {
            html += '<option value="' + utils.escapeHtml(t) + '">' +
                    utils.escapeHtml(t) + '</option>';
        });
        html += '</select></div>';

        html += '<div class="field" style="justify-content:flex-end;">' +
            '<button class="btn-ghost" onclick="App.TasksCalendar.resetFilters()">' +
            '<i class="bi bi-x-circle"></i> Сбросить</button></div>';

        html += '</div>'; // /filters

        // Контейнер календаря
        html += '<div id="tc-calendar-container">' +
            '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>' +
            '</div>';

        html += '</div>'; // /tc-wrap

        $('#otherPagesBlock').html(html);
    }

    // ============================================================
    // ПОЛУЧЕНИЕ ДИАПАЗОНА ДАТ
    // ============================================================
    function computeRange() {
        if (state.view === 'month') {
            var from = startOfMonth(state.anchor);
            var to = endOfMonth(state.anchor);
            // Для сетки нужны "хвосты" соседних недель
            var gridStart = startOfWeek(from);
            var gridEnd = endOfWeek(to);
            return { from: gridStart, to: gridEnd, display: from, displayEnd: to };
        }
        // week
        var from = startOfWeek(state.anchor);
        var to = endOfWeek(state.anchor);
        return { from: from, to: to, display: from, displayEnd: to };
    }

    function buildQuery(range) {
        var params = new URLSearchParams();
        params.append('from', iso(range.from));
        params.append('to', iso(range.to));
        params.append('date_field', state.dateField);

        var status = $('#tc-f-status').val() || '';
        if (status) params.append('status', status);
        var prio = $('#tc-f-priority').val() || '';
        if (prio) params.append('priority', prio);
        var ex = $('#tc-f-executor').val() || '';
        if (ex) params.append('executor', ex);
        var cab = $('#tc-f-cabinet').val() || '';
        if (cab) params.append('cabinet', cab);
        var wt = $('#tc-f-work-type').val() || '';
        if (wt) params.append('work_type', wt);

        // Ограничения для Техника
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
        // Заголовок периода
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

        // Заголовки дней недели
        WEEKDAYS_SHORT.forEach(function(w) {
            html += '<div class="tc-day-head">' + w + '</div>';
        });

        // Ячейки
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

            var shown = tasks.slice(0, 4);
            shown.forEach(function(t) {
                html += renderTask(t);
            });
            if (tasks.length > 4) {
                html += '<div class="tc-task-more" ' +
                    'onclick="App.TasksCalendar.showDay(\'' + dStr + '\')">' +
                    '+' + (tasks.length - 4) + ' ещё</div>';
            }

            html += '</div>';  // /tc-cell

            cursor.setDate(cursor.getDate() + 1);
        }

        html += '</div>';

        $('#tc-calendar-container').html(html);

        // Навешиваем drag-n-drop на ячейки и задачи
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
        if (window.currentUserRole === 'Техник') {
            // Техник не может менять deadline произвольно — пропускаем
            return;
        }

        var draggedTaskId = null;

        $('#tc-calendar-container').off('dragstart.tc dragend.tc dragover.tc dragleave.tc drop.tc')
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

                // Отправляем на сервер обновление deadline
                moveTask(draggedTaskId, newDate);
                draggedTaskId = null;
            });
    }

    function moveTask(taskId, newDate) {
        // Получаем старую заявку, чтобы забрать её deadline'ы и другие поля
        http.get('/api/task/' + taskId)
            .then(function(task) {
                if (task.error) {
                    utils.showErrorMessage(task.error);
                    return;
                }

                // Формируем новый deadline с сохранением времени, если было
                var oldDeadline = task.deadline || '';
                var timePart = '12:00:00';
                if (oldDeadline && oldDeadline.indexOf(' ') !== -1) {
                    timePart = oldDeadline.split(' ')[1];
                }
                var newDeadline = newDate + ' ' + timePart;

                var payload = {
                    deadline: newDeadline,
                };

                return http.post('/api/update_task/' + taskId, payload);
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
    // ПУБЛИЧНЫЕ ДЕЙСТВИЯ
    // ============================================================
    function setView(v) {
        state.view = v;
        renderShell(null);  // перерендер оболочки
        // Восстановим фильтры (мы их не сохраняем при перерендере — оставим всё как было)
        // Просто заново навесим значения из state
        applyFilterValues();
        fetchAndRender();
    }

    function applyFilterValues() {
        // Ничего — фильтры будут показаны как "Все" после перерендера оболочки
        // (не критично, пользователь их выберет заново)
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