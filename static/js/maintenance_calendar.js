// static/js/maintenance_calendar.js
// Календарь обслуживания оборудования.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[maintenance_calendar] App не инициализирован');
        return;
    }

    var mod = window.App.register('Maintenance');
    var http = window.App.api;
    var utils = window.App.utils;

    var WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                     'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    var cache = [];
    var currentView = 'list';     // 'list' | 'calendar'
    var currentMonth = null;      // {year, month} для календаря
    var calendarCache = null;

    // ============================================================
    // ЦВЕТ ПРИОРИТЕТА
    // ============================================================
    function applyPriorityStyle($select) {
        $select.removeClass('priority-high priority-medium priority-low');
        var v = $select.val();
        if (v === 'Высокий') $select.addClass('priority-high');
        else if (v === 'Средний') $select.addClass('priority-medium');
        else if (v === 'Низкий') $select.addClass('priority-low');
    }

    function bindPriorityStyle() {
        $('#mc-priority')
            .off('change.prioStyle')
            .on('change.prioStyle', function() {
                applyPriorityStyle($(this));
            });
        applyPriorityStyle($('#mc-priority'));
    }

    // ============================================================
    // ЗАГРУЗКА СПИСКА ПЛАНОВ
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка планов ТО...</p></div>'
        );

        http.get('/api/maintenance')
            .then(function(list) {
                if (!list || list.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml((list && list.error) || 'Ошибка') +
                        '</div>');
                    return;
                }
                cache = Array.isArray(list) ? list : [];
                renderPage();
            })
            .catch(function(err) {
                $block.html('<div class="alert alert-danger">' +
                    'Ошибка загрузки: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function renderPage() {
        var html = '';

        html += '<div class="mc-toolbar">';
        html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
        html += '<div class="mc-view-switch">';
        html += '<button type="button" class="' + (currentView === 'list' ? 'active' : '') + '" ' +
                'onclick="App.Maintenance.setView(\'list\')">' +
                '<i class="bi bi-list"></i> Список</button>';
        html += '<button type="button" class="' + (currentView === 'calendar' ? 'active' : '') + '" ' +
                'onclick="App.Maintenance.setView(\'calendar\')">' +
                '<i class="bi bi-calendar3"></i> Календарь</button>';
        html += '</div>';
        html += '<span class="cabinets-count ms-2">Планов: <strong>' + cache.length + '</strong></span>';
        html += '</div>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn-ghost" onclick="App.Maintenance.load()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn-primary" onclick="App.Maintenance.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Новый план</button>';
        html += '</div></div>';

        html += '<div id="mc-content">';
        if (currentView === 'calendar') {
            html += '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>';
        } else {
            html += renderList();
        }
        html += '</div>';

        $('#otherPagesBlock').html(html);

        if (currentView === 'calendar') {
            loadCalendar();
        }
    }

    function renderList() {
        if (cache.length === 0) {
            return '<div class="cabinets-empty">' +
                '<i class="bi bi-calendar-check" style="font-size:3rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">Планов ТО ещё нет</p>' +
                '<button class="btn-primary mt-3" onclick="App.Maintenance.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Создать первый</button></div>';
        }
        var html = '<div class="cabinets-grid">';
        cache.forEach(function(p) { html += renderCard(p); });
        html += '</div>';
        return html;
    }

    function renderCard(p) {
        var statusBadge = p.is_active
            ? '<span class="cabinet-card-status active">Активно</span>'
            : '<span class="cabinet-card-status inactive">Отключено</span>';

        var metaParts = [];
        if (p.work_type) metaParts.push('🏷️ ' + utils.escapeHtml(p.work_type));
        if (p.priority) metaParts.push('⚡ ' + utils.escapeHtml(p.priority));
        if (p.executor) metaParts.push('👤 ' + utils.escapeHtml(p.executor));

        return '<div class="cabinet-card schedule-card" data-plan-id="' + p.id + '">' +
            '<div class="cabinet-card-head">' +
            '<div class="cabinet-card-title">' + utils.escapeHtml(p.name) + '</div>' +
            statusBadge + '</div>' +

            (p.description
                ? '<div class="cabinet-card-subtitle">' +
                  utils.escapeHtml(p.description) + '</div>'
                : '') +

            '<div class="schedule-recurrence">' +
            '<i class="bi bi-arrow-repeat"></i> ' +
            utils.escapeHtml(describeRecurrence(p)) + '</div>' +

            (metaParts.length
                ? '<div class="schedule-meta">' + metaParts.join(' · ') + '</div>'
                : '') +

            '<div class="cabinet-card-divider"></div>' +

            '<div class="schedule-dates">' +
            '<div><span class="schedule-date-label">Следующий:</span> ' +
            '<strong>' + (p.next_run_at ? utils.formatDate(p.next_run_at) : '—') +
            '</strong></div>' +
            '<div><span class="schedule-date-label">Последний:</span> ' +
            (p.last_run_at ? utils.formatDate(p.last_run_at) : '—') +
            (p.last_task_id
                ? ' · <a href="#" onclick="viewTask(' + p.last_task_id +
                  '); return false;">заявка #' + p.last_task_id + '</a>'
                : '') +
            '</div></div>' +

            '<div class="schedule-actions">' +
            '<button class="btn-ghost" onclick="App.Maintenance.toggle(' + p.id + ')" title="' +
            (p.is_active ? 'Отключить' : 'Включить') + '">' +
            '<i class="bi bi-' + (p.is_active ? 'pause-circle' : 'play-circle') + '"></i></button>' +
            '<button class="btn-ghost" onclick="App.Maintenance.runNow(' + p.id + ')" title="Запустить сейчас">' +
            '<i class="bi bi-lightning-charge"></i></button>' +
            '<button class="btn-ghost" onclick="App.Maintenance.edit(' + p.id + ')" title="Редактировать">' +
            '<i class="bi bi-pencil"></i></button>' +
            '<button class="btn-ghost danger" onclick="App.Maintenance.remove(' + p.id + ')" title="Удалить">' +
            '<i class="bi bi-trash"></i></button>' +
            '</div></div>';
    }

    function describeRecurrence(p) {
        var cfg = p.recurrence_config || {};
        var time = cfg.time || '09:00';

        if (p.recurrence_type === 'daily') return 'Каждый день в ' + time;
        if (p.recurrence_type === 'weekly') {
            var days = (cfg.days || []).slice().sort(function(a,b){return a-b;});
            return 'По ' + days.map(function(d){ return WEEKDAYS_SHORT[d] || '?'; }).join(', ') +
                   ' в ' + time;
        }
        if (p.recurrence_type === 'monthly') {
            var dM = (cfg.days || []).slice().sort(function(a,b){return a-b;});
            return 'Числа ' + dM.join(', ') + ' в ' + time;
        }
        if (p.recurrence_type === 'quarterly') {
            return 'Раз в квартал' +
                   (cfg.start_date ? ' с ' + cfg.start_date : '') +
                   ' в ' + time;
        }
        if (p.recurrence_type === 'yearly') {
            return 'Раз в год' +
                   (cfg.start_date ? ' с ' + cfg.start_date : '') +
                   ' в ' + time;
        }
        return '—';
    }

    // ============================================================
    // КАЛЕНДАРЬ
    // ============================================================
    function setView(v) {
        currentView = v;
        renderPage();
    }

    function loadCalendar() {
        if (!currentMonth) {
            var now = new Date();
            currentMonth = { year: now.getFullYear(), month: now.getMonth() };
        }

        var firstDay = new Date(currentMonth.year, currentMonth.month, 1);
        var lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);

        var from = isoDate(firstDay);
        var to = isoDate(lastDay);

        http.get('/api/maintenance/calendar?from=' + from + '&to=' + to)
            .then(function(data) {
                if (data.error) {
                    $('#mc-content').html('<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(data.error) + '</div>');
                    return;
                }
                calendarCache = data;
                renderCalendar(data, firstDay, lastDay);
            })
            .catch(function(err) {
                $('#mc-content').html('<div class="alert alert-danger m-3">' +
                    'Ошибка: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function isoDate(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function renderCalendar(data, firstDay, lastDay) {
        var planned = data.planned || [];
        var eventsByDay = {};
        planned.forEach(function(e) {
            if (!eventsByDay[e.date]) eventsByDay[e.date] = [];
            eventsByDay[e.date].push(e);
        });

        var html = '<div class="mc-toolbar">';
        html += '<div class="d-flex align-items-center gap-2">';
        html += '<button class="btn-ghost" onclick="App.Maintenance.shiftMonth(-1)">' +
                '<i class="bi bi-chevron-left"></i></button>';
        html += '<strong style="min-width:180px;text-align:center;display:inline-block;">' +
                MONTHS_RU[currentMonth.month] + ' ' + currentMonth.year + '</strong>';
        html += '<button class="btn-ghost" onclick="App.Maintenance.shiftMonth(1)">' +
                '<i class="bi bi-chevron-right"></i></button>';
        html += '<button class="btn-ghost ms-2" onclick="App.Maintenance.goToday()">Сегодня</button>';
        html += '</div>';
        html += '<span class="text-muted small">Событий за период: ' +
                planned.length + '</span>';
        html += '</div>';

        html += '<div class="mc-calendar">';
        WEEKDAYS_SHORT.forEach(function(w) {
            html += '<div class="mc-day-head">' + w + '</div>';
        });

        // Пустые ячейки до первого дня недели
        var startWeekday = firstDay.getDay(); // 0 = Вс, 1 = Пн...
        var offset = (startWeekday + 6) % 7;  // 0 = Пн
        for (var i = 0; i < offset; i++) {
            html += '<div class="mc-day mc-day-empty"></div>';
        }

        var today = isoDate(new Date());
        var totalDays = lastDay.getDate();

        for (var d = 1; d <= totalDays; d++) {
            var dateStr = isoDate(new Date(currentMonth.year, currentMonth.month, d));
            var isToday = (dateStr === today);
            var dayEvents = eventsByDay[dateStr] || [];

            html += '<div class="mc-day' + (isToday ? ' mc-day-today' : '') + '">';
            html += '<div class="mc-day-head-num">' + d + '</div>';

            dayEvents.slice(0, 4).forEach(function(ev) {
                var pCls = 'mc-p-medium';
                if (ev.priority === 'Высокий') pCls = 'mc-p-high';
                else if (ev.priority === 'Низкий') pCls = 'mc-p-low';
                html += '<span class="mc-event-pill ' + pCls + '" ' +
                        'title="' + utils.escapeHtml(ev.name) + '" ' +
                        'onclick="App.Maintenance.showEvent(' + ev.plan_id + ')">' +
                        utils.escapeHtml(ev.name) + '</span>';
            });
            if (dayEvents.length > 4) {
                html += '<span class="text-muted" style="font-size:10px;">+' +
                        (dayEvents.length - 4) + ' ещё</span>';
            }
            html += '</div>';
        }

        // Пустые ячейки в конце
        var endWeekday = lastDay.getDay();
        var endOffset = (endWeekday + 6) % 7;
        var fill = 6 - endOffset;
        for (var j = 0; j < fill; j++) {
            html += '<div class="mc-day mc-day-empty"></div>';
        }

        html += '</div>';
        $('#mc-content').html(html);
    }

    function shiftMonth(delta) {
        if (!currentMonth) return;
        var m = currentMonth.month + delta;
        var y = currentMonth.year;
        while (m < 0) { m += 12; y -= 1; }
        while (m > 11) { m -= 12; y += 1; }
        currentMonth = { year: y, month: m };
        loadCalendar();
    }

    function goToday() {
        var now = new Date();
        currentMonth = { year: now.getFullYear(), month: now.getMonth() };
        loadCalendar();
    }

    function showEvent(planId) {
        var p = cache.find(function(x) { return x.id === planId; });
        if (!p) return;
        edit(p.id);
    }

    // ============================================================
    // ФОРМА ПЛАНА
    // ============================================================
    function buildForm(p) {
        p = p || {};
        var cfg = p.recurrence_config || {};

        return '<div class="text-start">' +
            '<div class="row g-2 schedule-form">' +

            '<div class="col-md-8"><label class="form-label">Название *</label>' +
            '<input id="mc-name" class="form-control" maxlength="200" value="' +
            utils.escapeHtml(p.name || '') + '"></div>' +

            '<div class="col-md-4"><label class="form-label">Приоритет</label>' +
            '<select id="mc-priority" class="form-select">' +
            ['Высокий', 'Средний', 'Низкий'].map(function(v) {
                return '<option' +
                    (v === (p.priority || 'Средний') ? ' selected' : '') +
                    '>' + v + '</option>';
            }).join('') +
            '</select></div>' +

            '<div class="col-12"><label class="form-label">Описание</label>' +
            '<textarea id="mc-description" class="form-control" rows="2">' +
            utils.escapeHtml(p.description || '') + '</textarea></div>' +

            '<div class="col-md-6"><label class="form-label">Тип работы</label>' +
            '<select id="mc-work-type" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-md-6"><label class="form-label">Исполнитель</label>' +
            '<select id="mc-executor" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-md-6"><label class="form-label">От кого</label>' +
            '<input id="mc-from-user" class="form-control" value="' +
            utils.escapeHtml(p.from_user || '') + '" placeholder="Иванов И.И."></div>' +

            '<div class="col-md-6"><label class="form-label">Длительность, мин</label>' +
            '<input type="number" id="mc-duration" class="form-control" ' +
            'min="15" max="1440" value="' + (p.duration_minutes || 60) + '"></div>' +

            '<div class="col-12"><hr><h6 class="mb-2">Повторение</h6></div>' +

            '<div class="col-md-4"><label class="form-label">Тип</label>' +
            '<select id="mc-rec-type" class="form-select" ' +
            'onchange="App.Maintenance.onRecTypeChange()">' +
            '<option value="daily"' +
            (p.recurrence_type === 'daily' ? ' selected' : '') + '>Ежедневно</option>' +
            '<option value="weekly"' +
            (p.recurrence_type === 'weekly' ? ' selected' : '') + '>По дням недели</option>' +
            '<option value="monthly"' +
            (p.recurrence_type === 'monthly' ? ' selected' : '') + '>По числам месяца</option>' +
            '<option value="quarterly"' +
            (p.recurrence_type === 'quarterly' ? ' selected' : '') + '>Раз в квартал</option>' +
            '<option value="yearly"' +
            (p.recurrence_type === 'yearly' ? ' selected' : '') + '>Раз в год</option>' +
            '</select></div>' +

            '<div class="col-md-4"><label class="form-label">Время</label>' +
            '<input type="time" id="mc-rec-time" class="form-control" value="' +
            utils.escapeHtml(cfg.time || '09:00') + '"></div>' +

            '<div class="col-12" id="mc-rec-days-wrap"></div>' +

            '</div></div>';
    }

    function populateForm(p) {
        Promise.all([
            http.get('/api/directory/problem-types').catch(function() { return []; }),
            http.get('/api/executors').catch(function() { return []; }),
        ]).then(function(results) {
            var workTypes = results[0] || [];
            var executors = results[1] || [];

            fillSelect('#mc-work-type',
                workTypes.map(function(t) { return t.name; }),
                p ? p.work_type : '');
            fillSelect('#mc-executor',
                executors.map(function(e) { return e.full_name; }),
                p ? p.executor : '');

            if (!p && window.currentUserFullName) {
                var $from = $('#mc-from-user');
                if ($from.length && !($from.val() || '').trim()) {
                    $from.val(window.currentUserFullName);
                }
            }

            renderDaysPicker(
                (p && p.recurrence_type) || 'daily',
                (p && p.recurrence_config && p.recurrence_config.days) || []
            );
        });
    }

    function fillSelect(sel, values, current) {
        var $s = $(sel);
        $s.find('option').slice(1).remove();
        (values || []).forEach(function(v) {
            $s.append('<option value="' + utils.escapeHtml(v) + '"' +
                (v === current ? ' selected' : '') + '>' +
                utils.escapeHtml(v) + '</option>');
        });
        if (current) $s.val(current);
    }

    function renderDaysPicker(recType, selectedDays) {
        var $wrap = $('#mc-rec-days-wrap');
        if (recType === 'daily' || recType === 'quarterly' || recType === 'yearly') {
            $wrap.empty();
            return;
        }

        var html = '';
        if (recType === 'weekly') {
            html += '<label class="form-label">Дни недели</label>' +
                '<div class="schedule-days-picker">';
            WEEKDAYS_SHORT.forEach(function(d, i) {
                var checked = selectedDays.indexOf(i) !== -1;
                html += '<label class="schedule-day-check">' +
                    '<input type="checkbox" value="' + i + '"' +
                    (checked ? ' checked' : '') + '>' +
                    '<span>' + d + '</span></label>';
            });
            html += '</div>';
        } else if (recType === 'monthly') {
            html += '<label class="form-label">Числа месяца</label>' +
                '<div class="schedule-days-picker schedule-days-grid">';
            for (var d = 1; d <= 31; d++) {
                var c = selectedDays.indexOf(d) !== -1;
                html += '<label class="schedule-day-check">' +
                    '<input type="checkbox" value="' + d + '"' +
                    (c ? ' checked' : '') + '>' +
                    '<span>' + d + '</span></label>';
            }
            html += '</div>';
        }
        $wrap.html(html);
    }

    function onRecTypeChange() {
        var t = $('#mc-rec-type').val();
        var days = [];
        $('#mc-rec-days-wrap input[type="checkbox"]:checked').each(function() {
            days.push(parseInt(this.value, 10));
        });
        renderDaysPicker(t, days);
    }

    function collectForm() {
        var name = ($('#mc-name').val() || '').trim();
        if (!name) {
            Swal.showValidationMessage('Введите название');
            return false;
        }

        var recType = $('#mc-rec-type').val();
        var cfg = { time: $('#mc-rec-time').val() || '09:00' };

        if (recType === 'weekly' || recType === 'monthly') {
            var days = [];
            $('#mc-rec-days-wrap input[type="checkbox"]:checked')
                .each(function() { days.push(parseInt(this.value, 10)); });
            if (days.length === 0) {
                Swal.showValidationMessage('Выберите хотя бы один день');
                return false;
            }
            cfg.days = days;
        }

        return {
            name: name,
            description: ($('#mc-description').val() || '').trim(),
            work_type: $('#mc-work-type').val() || '',
            executor: $('#mc-executor').val() || '',
            from_user: ($('#mc-from-user').val() || '').trim(),
            priority: $('#mc-priority').val() || 'Средний',
            duration_minutes: parseInt($('#mc-duration').val(), 10) || 60,
            recurrence_type: recType,
            recurrence_config: cfg,
        };
    }

    // ============================================================
    // CRUD
    // ============================================================
    function showAdd() {
        Swal.fire({
            title: '<i class="bi bi-calendar-plus"></i> Новый план ТО',
            html: buildForm(null),
            width: 780,
            showCancelButton: true,
            confirmButtonText: 'Создать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                populateForm(null);
                bindPriorityStyle();
            },
            preConfirm: collectForm,
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/maintenance', r.value).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage(res.message || 'Создано');
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    function edit(id) {
        http.get('/api/maintenance/' + id).then(function(p) {
            if (!p || p.error) {
                utils.showErrorMessage(p && p.error);
                return;
            }
            Swal.fire({
                title: '<i class="bi bi-pencil-square"></i> План ТО',
                html: buildForm(p),
                width: 780,
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                customClass: { popup: 'swal-wide' },
                didOpen: function() {
                    populateForm(p);
                    bindPriorityStyle();
                },
                preConfirm: collectForm,
            }).then(function(r) {
                if (!r.isConfirmed) return;
                http.put('/api/maintenance/' + id, r.value).then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Сохранено');
                        load();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
            });
        });
    }

    function toggle(id) {
        http.post('/api/maintenance/' + id + '/toggle', {}).then(function(res) {
            if (res.success) {
                utils.showSuccessMessage(res.message || 'Готово');
                load();
            } else {
                utils.showErrorMessage(res.error);
            }
        });
    }

    function runNow(id) {
        Swal.fire({
            title: 'Запустить сейчас?',
            text: 'Будет создана заявка по шаблону плана.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-lightning-charge"></i> Запустить',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/maintenance/' + id + '/run-now', {}).then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Заявка создана',
                        text: res.message || ('#' + res.task_id),
                        timer: 2000,
                        showConfirmButton: false,
                    });
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    function remove(id) {
        Swal.fire({
            title: 'Удалить план?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/maintenance/' + id).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Удалено');
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = load;
    mod.showAdd = showAdd;
    mod.edit = edit;
    mod.toggle = toggle;
    mod.runNow = runNow;
    mod.remove = remove;
    mod.setView = setView;
    mod.shiftMonth = shiftMonth;
    mod.goToday = goToday;
    mod.showEvent = showEvent;
    mod.onRecTypeChange = onRecTypeChange;

    window.loadMaintenancePage = load;

    console.log('[maintenance_calendar] Загружено');
})();