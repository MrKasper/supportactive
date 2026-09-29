// static/js/schedules.js
// Страница «Расписания» — CRUD повторяющихся задач.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[schedules] App не инициализирован');
        return;
    }

    var mod = window.App.register('Schedules');
    var http = window.App.api;
    var utils = window.App.utils;

    if (!http || typeof http.get !== 'function') {
        console.error('[schedules] App.api не загружен');
        return;
    }

    var WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var cache = [];

    // ============================================================
    // ЦВЕТ ПРИОРИТЕТА (как в форме создания заявки)
    // ============================================================
    function applyPriorityStyle($select) {
        $select.removeClass('priority-high priority-medium priority-low');
        var v = $select.val();
        if (v === 'Высокий') $select.addClass('priority-high');
        else if (v === 'Средний') $select.addClass('priority-medium');
        else if (v === 'Низкий') $select.addClass('priority-low');
    }

    function bindPriorityStyle() {
        $('#sch-priority')
            .off('change.prioStyle')
            .on('change.prioStyle', function() {
                applyPriorityStyle($(this));
            });
        applyPriorityStyle($('#sch-priority'));
    }

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка расписаний...</p></div>'
        );

        http.get('/api/schedules')
            .then(function(list) {
                if (!list || list.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml((list && list.error) ||
                            'Ошибка загрузки') + '</div>');
                    return;
                }
                cache = Array.isArray(list) ? list : [];
                render();
            })
            .catch(function(err) {
                console.error('[schedules] load error:', err);
                $block.html('<div class="alert alert-danger">' +
                    'Ошибка загрузки: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function render() {
        var html = '';

        html += '<div class="cabinets-toolbar">';
        html += '<div class="toolbar-left">';
        html += '<div class="search-input">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
            '<input type="text" id="scheduleSearchInput" placeholder="Поиск по названию, кабинету, типу…" oninput="App.Schedules.filter()">' +
            '</div>';
        html += '<span class="cabinets-count">Всего: <strong>' +
                cache.length + '</strong></span>';
        html += '</div>';
        html += '<div class="toolbar-right">';
        html += '<button class="btn-ghost" onclick="App.Schedules.load()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn-primary" onclick="App.Schedules.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Новое расписание</button>';
        html += '</div></div>';

        html += '<div class="cabinets-grid" id="schedulesGrid">';
        if (cache.length === 0) {
            html += '<div class="cabinets-empty">' +
                '<i class="bi bi-calendar-week" style="font-size:3rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">Расписаний ещё нет</p>' +
                '<button class="btn-primary mt-3" onclick="App.Schedules.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Создать первое</button></div>';
        } else {
            cache.forEach(function(s) { html += renderCard(s); });
        }
        html += '</div>';

        $('#otherPagesBlock').html(html);
    }

    function renderCard(s) {
        var recurrence = describeRecurrence(s);
        var statusBadge = s.is_active
            ? '<span class="cabinet-card-status active">Активно</span>'
            : '<span class="cabinet-card-status inactive">Отключено</span>';

        var metaParts = [];
        if (s.cabinet) metaParts.push('📁 ' + utils.escapeHtml(s.cabinet));
        if (s.work_type) metaParts.push('🏷️ ' + utils.escapeHtml(s.work_type));
        if (s.priority) metaParts.push('⚡ ' + utils.escapeHtml(s.priority));
        if (s.executor) metaParts.push('👤 ' + utils.escapeHtml(s.executor));

        var tagsHtml = '';
        if (s.tags && s.tags.length > 0 && window.App.Tags) {
            tagsHtml = '<div class="schedule-tags">' +
                s.tags.map(function(t) {
                    return window.App.Tags.renderChip(t, { small: true });
                }).join('') +
                '</div>';
        }

        return '<div class="cabinet-card schedule-card" data-schedule-id="' + s.id + '">' +
            '<div class="cabinet-card-head">' +
            '<div class="cabinet-card-title">' + utils.escapeHtml(s.name) + '</div>' +
            statusBadge + '</div>' +

            (s.description
                ? '<div class="cabinet-card-subtitle">' +
                  utils.escapeHtml(s.description) + '</div>'
                : '') +

            '<div class="schedule-recurrence">' +
            '<i class="bi bi-arrow-repeat"></i> ' +
            utils.escapeHtml(recurrence) + '</div>' +

            (metaParts.length
                ? '<div class="schedule-meta">' + metaParts.join(' · ') + '</div>'
                : '') +

            tagsHtml +

            '<div class="cabinet-card-divider"></div>' +

            '<div class="schedule-dates">' +
            '<div><span class="schedule-date-label">Следующий:</span> ' +
            '<strong>' +
            (s.next_run_at ? utils.formatDate(s.next_run_at) : '—') +
            '</strong></div>' +
            '<div><span class="schedule-date-label">Последний:</span> ' +
            (s.last_run_at ? utils.formatDate(s.last_run_at) : '—') +
            '</div></div>' +

            '<div class="schedule-actions">' +
            '<button class="btn-ghost" onclick="App.Schedules.toggle(' + s.id + ')" title="' +
            (s.is_active ? 'Отключить' : 'Включить') + '">' +
            '<i class="bi bi-' + (s.is_active ? 'pause-circle' : 'play-circle') + '"></i></button>' +
            '<button class="btn-ghost" onclick="App.Schedules.runNow(' + s.id + ')" title="Запустить сейчас">' +
            '<i class="bi bi-lightning-charge"></i></button>' +
            '<button class="btn-ghost" onclick="App.Schedules.edit(' + s.id + ')" title="Редактировать">' +
            '<i class="bi bi-pencil"></i></button>' +
            '<button class="btn-ghost danger" onclick="App.Schedules.remove(' + s.id + ')" title="Удалить">' +
            '<i class="bi bi-trash"></i></button>' +
            '</div></div>';
    }

    function describeRecurrence(s) {
        var cfg = s.recurrence_config || {};
        var time = cfg.time || '09:00';

        if (s.recurrence_type === 'daily') {
            return 'Каждый день в ' + time;
        }
        if (s.recurrence_type === 'weekly') {
            var days = (cfg.days || []).slice().sort(function(a, b) { return a - b; });
            var names = days.map(function(d) { return WEEKDAYS[d] || '?'; }).join(', ');
            return 'По ' + (names || 'Пн') + ' в ' + time;
        }
        if (s.recurrence_type === 'monthly') {
            var dM = (cfg.days || []).slice().sort(function(a, b) { return a - b; });
            return 'Числа ' + (dM.join(', ') || '1') + ' в ' + time;
        }
        return '—';
    }

    // ============================================================
    // ФИЛЬТР
    // ============================================================
    function filter() {
        var q = ($('#scheduleSearchInput').val() || '').toLowerCase().trim();
        $('#schedulesGrid .schedule-card').each(function() {
            var $card = $(this);
            var id = parseInt($card.attr('data-schedule-id'), 10);
            var s = cache.find(function(x) { return x.id === id; });
            if (!s) { $card.hide(); return; }
            var haystack = [
                s.name, s.description, s.cabinet, s.work_type,
                s.priority, s.executor, s.from_user
            ].join(' ').toLowerCase();
            $card.toggle(!q || haystack.indexOf(q) !== -1);
        });
    }

    // ============================================================
    // ФОРМА
    // ============================================================
    function buildForm(s) {
        s = s || {};
        var cfg = s.recurrence_config || {};

        return '<div class="text-start">' +
            '<div class="row g-2 schedule-form">' +

            '<div class="col-md-8"><label class="form-label">Название *</label>' +
            '<input id="sch-name" class="form-control" maxlength="200" value="' +
            utils.escapeHtml(s.name || '') + '"></div>' +

            '<div class="col-md-4"><label class="form-label">Приоритет</label>' +
            '<select id="sch-priority" class="form-select">' +
            ['Высокий', 'Средний', 'Низкий'].map(function(p) {
                return '<option' +
                    (p === (s.priority || 'Средний') ? ' selected' : '') +
                    '>' + p + '</option>';
            }).join('') +
            '</select></div>' +

            '<div class="col-12"><label class="form-label">Описание</label>' +
            '<textarea id="sch-description" class="form-control" rows="2">' +
            utils.escapeHtml(s.description || '') + '</textarea></div>' +

            '<div class="col-md-6"><label class="form-label">Тип работы</label>' +
            '<select id="sch-work-type" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-md-6"><label class="form-label">Кабинет</label>' +
            '<select id="sch-cabinet" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-md-6"><label class="form-label">От кого</label>' +
            '<input id="sch-from-user" class="form-control" value="' +
            utils.escapeHtml(s.from_user || '') + '" placeholder="Иванов И.И."></div>' +

            '<div class="col-md-6"><label class="form-label">Длительность, мин</label>' +
            '<input type="number" id="sch-duration" class="form-control" ' +
            'min="15" max="1440" value="' + (s.duration_minutes || 60) + '"></div>' +

            '<div class="col-md-6"><label class="form-label">Исполнитель</label>' +
            '<select id="sch-executor" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-md-6"><label class="form-label">Помощник</label>' +
            '<select id="sch-assistant" class="form-select">' +
            '<option value="">— не указан —</option></select></div>' +

            '<div class="col-12"><hr><h6 class="mb-2">Повторение</h6></div>' +

            '<div class="col-md-4"><label class="form-label">Тип</label>' +
            '<select id="sch-rec-type" class="form-select" ' +
            'onchange="App.Schedules.onRecTypeChange()">' +
            '<option value="daily"' +
            (s.recurrence_type === 'daily' ? ' selected' : '') + '>Ежедневно</option>' +
            '<option value="weekly"' +
            (s.recurrence_type === 'weekly' ? ' selected' : '') + '>По дням недели</option>' +
            '<option value="monthly"' +
            (s.recurrence_type === 'monthly' ? ' selected' : '') + '>По числам месяца</option>' +
            '</select></div>' +

            '<div class="col-md-4"><label class="form-label">Время</label>' +
            '<input type="time" id="sch-rec-time" class="form-control" value="' +
            utils.escapeHtml(cfg.time || '09:00') + '"></div>' +

            '<div class="col-12" id="sch-rec-days-wrap"></div>' +

            '<div class="col-12"><hr><h6 class="mb-2">Теги</h6>' +
            '<div id="sch-tags-picker" class="tag-picker">' +
            '<span class="text-muted small">Загрузка…</span></div></div>' +

            '</div></div>';
    }

    function populateForm(s) {
        Promise.all([
            http.get('/api/directory/problem-types').catch(function() { return []; }),
            http.get('/api/cabinets').catch(function() { return []; }),
            http.get('/api/executors').catch(function() { return []; }),
            http.get('/api/tags').catch(function() { return []; })
        ]).then(function(results) {
            var workTypes = results[0] || [];
            var cabinets = results[1] || [];
            var executors = results[2] || [];
            var allTags = results[3] || [];

            fillSelect('#sch-work-type',
                workTypes.map(function(t) { return t.name; }),
                s ? s.work_type : '');
            fillSelect('#sch-cabinet',
                cabinets.map(function(c) { return c.cabinet_number; }),
                s ? s.cabinet : '');
            fillSelect('#sch-executor',
                executors.map(function(e) { return e.full_name; }),
                s ? s.executor : '');
            fillSelect('#sch-assistant',
                executors.map(function(e) { return e.full_name; }),
                s ? s.assistant : '');

            var selectedIds = (s && s.tags)
                ? s.tags.map(function(t) { return t.id; })
                : [];
            renderTagPicker('#sch-tags-picker', allTags, selectedIds);

            // «От кого» — подставляем текущего пользователя только
            // при создании (s == null). При редактировании оставляем
            // то, что пришло с бэкенда.
            if (!s && window.currentUserFullName) {
                var $from = $('#sch-from-user');
                if ($from.length && !($from.val() || '').trim()) {
                    $from.val(window.currentUserFullName);
                }
            }

            renderDaysPicker(
                (s && s.recurrence_type) || 'daily',
                (s && s.recurrence_config && s.recurrence_config.days) || []
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

    function renderTagPicker(sel, allTags, selectedIds) {
        var $wrap = $(sel);
        if (!allTags || allTags.length === 0) {
            $wrap.html('<span class="text-muted small">' +
                'Теги не созданы. Добавьте их в разделе «Теги».</span>');
            return;
        }
        var html = '';
        allTags.forEach(function(t) {
            var checked = selectedIds.indexOf(t.id) !== -1;
            html += '<label class="tag-picker-item">' +
                '<input type="checkbox" value="' + t.id + '"' +
                (checked ? ' checked' : '') + '>' +
                window.App.Tags.renderChip(t) +
                '</label>';
        });
        $wrap.html(html);
    }

    function renderDaysPicker(recType, selectedDays) {
        var $wrap = $('#sch-rec-days-wrap');
        if (recType === 'daily') { $wrap.empty(); return; }

        var html = '';
        if (recType === 'weekly') {
            html += '<label class="form-label">Дни недели</label>' +
                '<div class="schedule-days-picker">';
            WEEKDAYS.forEach(function(d, i) {
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
        var t = $('#sch-rec-type').val();
        var days = [];
        $('#sch-rec-days-wrap input[type="checkbox"]:checked').each(function() {
            days.push(parseInt(this.value, 10));
        });
        renderDaysPicker(t, days);
    }

    function collectForm() {
        var name = ($('#sch-name').val() || '').trim();
        if (!name) {
            Swal.showValidationMessage('Введите название');
            return false;
        }

        var recType = $('#sch-rec-type').val();
        var cfg = { time: $('#sch-rec-time').val() || '09:00' };

        if (recType === 'weekly' || recType === 'monthly') {
            var days = [];
            $('#sch-rec-days-wrap input[type="checkbox"]:checked')
                .each(function() { days.push(parseInt(this.value, 10)); });
            if (days.length === 0) {
                Swal.showValidationMessage('Выберите хотя бы один день');
                return false;
            }
            cfg.days = days;
        }

        var tagIds = [];
        $('#sch-tags-picker input[type="checkbox"]:checked')
            .each(function() { tagIds.push(parseInt(this.value, 10)); });

        return {
            name: name,
            description: ($('#sch-description').val() || '').trim(),
            work_type: $('#sch-work-type').val() || '',
            cabinet: $('#sch-cabinet').val() || '',
            priority: $('#sch-priority').val() || 'Средний',
            from_user: ($('#sch-from-user').val() || '').trim(),
            executor: $('#sch-executor').val() || '',
            assistant: $('#sch-assistant').val() || '',
            duration_minutes: parseInt($('#sch-duration').val(), 10) || 60,
            recurrence_type: recType,
            recurrence_config: cfg,
            tag_ids: tagIds
        };
    }

    // ============================================================
    // CRUD
    // ============================================================
    function showAdd() {
        Swal.fire({
            title: '<i class="bi bi-calendar-plus"></i> Новое расписание',
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
            preConfirm: collectForm
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/schedules', r.value).then(function(res) {
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
        http.get('/api/schedules/' + id).then(function(s) {
            if (!s || s.error) {
                utils.showErrorMessage(s && s.error);
                return;
            }
            Swal.fire({
                title: '<i class="bi bi-pencil-square"></i> Расписание',
                html: buildForm(s),
                width: 780,
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                customClass: { popup: 'swal-wide' },
                didOpen: function() {
                    populateForm(s);
                    bindPriorityStyle();
                },
                preConfirm: collectForm
            }).then(function(r) {
                if (!r.isConfirmed) return;
                http.put('/api/schedules/' + id, r.value).then(function(res) {
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
        http.post('/api/schedules/' + id + '/toggle', {}).then(function(res) {
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
            text: 'Будет создана заявка по шаблону расписания.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-lightning-charge"></i> Запустить',
            cancelButtonText: 'Отмена'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/schedules/' + id + '/run-now', {}).then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Заявка создана',
                        text: res.message || ('#' + res.task_id),
                        timer: 2000,
                        showConfirmButton: false
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
            title: 'Удалить расписание?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/schedules/' + id).then(function(res) {
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
    mod.filter = filter;
    mod.onRecTypeChange = onRecTypeChange;

    window.loadSchedulesPage = load;

    console.log('[schedules] Загружено');
})();