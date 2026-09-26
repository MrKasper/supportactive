// static/js/tasks_kanban.js
// Kanban-доска для Техника + переключатель вида + фильтры.
// ComboBox «Вид» сохраняется в localStorage.
//
// ⚠️ init() вызывается из main.js при setupInterfaceByRole('Техник').
//     $(document).ready НЕ вызывает init — только биндит глобальные
//     обработчики (клики, кнопки открытия, refresh после модалки).

(function() {
    'use strict';

    if (!window.App) {
        console.error('[tasks_kanban] App не инициализирован');
        return;
    }

    var mod = window.App.register('TasksKanban');
    var api = window.App.api;
    var utils = window.App.utils;
    var state = window.App.state;

    // ============================================================
    // КОНСТАНТЫ
    // ============================================================
    var VIEW_MODE_KEY = 'supportactive_tasks_view_mode';

    var COLUMNS = [
        {
            status: 'Новое',
            icon: 'bi-inbox',
            color: '#4e73df',
            accent: '#4e73df',
            emptyText: 'Нет новых заявок',
            emptyHint: 'Очередь пуста',
        },
        {
            status: 'В работе',
            icon: 'bi-hourglass-split',
            color: '#e8a41c',
            accent: '#f6c23e',
            emptyText: 'В работе ничего нет',
            emptyHint: 'Перетащите заявку сюда, чтобы взять в работу',
        },
        {
            status: 'Выполнено',
            icon: 'bi-check-circle',
            color: '#1a9c6e',
            accent: '#1cc88a',
            emptyText: 'Выполненных нет',
            emptyHint: 'Здесь будут закрытые заявки',
        },
    ];

    var TRANSITIONS = {
        'Новое':      ['В работе', 'Выполнено'],
        'В работе':   ['Выполнено'],
        'Выполнено':  [],
        'Отменено':   [],
    };

    function isTransitionAllowed(from, to) {
        if (from === to) return true;
        var allowed = TRANSITIONS[from] || [];
        return allowed.indexOf(to) !== -1;
    }

    function describeTransition(from, to) {
        if (from === 'Выполнено') {
            return 'Заявка уже выполнена — переход невозможен';
        }
        if (to === 'Новое') {
            return 'Нельзя вернуть заявку в «Новое»';
        }
        if (to === 'В работе' && from === 'Выполнено') {
            return 'Нельзя вернуть выполненную заявку в работу';
        }
        return 'Такой переход запрещён';
    }

    // ============================================================
    // СОСТОЯНИЕ
    // ============================================================
    var sortables = {};
    var tasksCache = [];
    var searchQuery = '';
    var filters = {
        workType: '',
        cabinet: '',
        dateFrom: '',
        dateTo: '',
    };
    var reloadTimer = null;
    var rejectedHint = null;
    var clickTracker = null;
    var currentMode = 'kanban';

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
    // ============================================================
    function init() {
        ensureToolbar();

        var saved = 'kanban';
        try {
            saved = localStorage.getItem(VIEW_MODE_KEY) || 'kanban';
        } catch (e) {}
        if (saved !== 'kanban' && saved !== 'table') saved = 'kanban';

        setViewMode(saved, true);

        if (saved === 'kanban') {
            load();
        } else {
            // 🆕 Пользователь выбрал таблицу — грузим фильтры и задачи
            if (window.App.Tasks) {
                if (window.App.Tasks.loadFilters) {
                    window.App.Tasks.loadFilters();
                }
                if (window.App.Tasks.setupEventHandlers) {
                    window.App.Tasks.setupEventHandlers();
                }
                if (window.App.Tasks.loadTasks) {
                    window.App.Tasks.loadTasks(1);
                }
            }
        }
    }

    // ============================================================
    // ТУЛБАР
    // ============================================================
    function ensureToolbar() {
        if ($('#tasksToolbar').length > 0) return;

        var $tasksBlock = $('#tasksBlock');
        if ($tasksBlock.length === 0) return;

        var toolbarHtml =
            '<div id="tasksToolbar" class="tasks-toolbar">' +
                '<div class="tasks-toolbar-left">' +
                    '<h5 class="tasks-toolbar-title">' +
                        '<i class="bi bi-kanban-fill" id="tasksToolbarIcon"></i> ' +
                        '<span id="tasksToolbarTitle">Моя доска заявок</span>' +
                    '</h5>' +
                    '<span class="tasks-toolbar-hint" id="tasksToolbarHint">' +
                        'Перетаскивайте карточки · кликните, чтобы открыть' +
                    '</span>' +
                '</div>' +
                '<div class="tasks-toolbar-right">' +
                    '<select class="form-select form-select-sm view-mode-switch" ' +
                        'id="viewModeSelect" title="Вид отображения">' +
                        '<option value="kanban">⬛ Канбан</option>' +
                        '<option value="table">📋 Таблица</option>' +
                    '</select>' +
                    '<div class="kanban-only-controls" id="kanbanOnlyControls">' +
                        '<button type="button" ' +
                            'class="btn btn-sm btn-outline-secondary" ' +
                            'id="kanbanFiltersToggle" ' +
                            'title="Фильтры">' +
                            '<i class="bi bi-funnel"></i>' +
                            '<span class="badge bg-primary ms-1" ' +
                                'id="kanbanFiltersCount" ' +
                                'style="display:none">0</span>' +
                        '</button>' +
                        '<div class="kanban-search">' +
                            '<i class="bi bi-search search-icon"></i>' +
                            '<input type="text" id="kanbanSearch" ' +
                                'placeholder="Поиск…" ' +
                                'autocomplete="off">' +
                            '<button class="search-clear" type="button" ' +
                                'id="kanbanSearchClear" title="Очистить">' +
                                '<i class="bi bi-x"></i></button>' +
                        '</div>' +
                        '<button type="button" ' +
                            'class="btn btn-sm btn-outline-primary" ' +
                            'id="kanbanRefreshBtn" title="Обновить">' +
                            '<i class="bi bi-arrow-clockwise"></i>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div id="kanbanFiltersPanel" ' +
                'class="kanban-filters-panel" style="display:none">' +
                '<div class="row g-2 align-items-end">' +
                    '<div class="col-md-3 col-sm-6">' +
                        '<label class="kanban-filter-label">Тип работы</label>' +
                        '<select id="kfWorkType" ' +
                            'class="form-select form-select-sm">' +
                            '<option value="">Все типы</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="col-md-3 col-sm-6">' +
                        '<label class="kanban-filter-label">Кабинет</label>' +
                        '<select id="kfCabinet" ' +
                            'class="form-select form-select-sm">' +
                            '<option value="">Все кабинеты</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="col-md-2 col-sm-6">' +
                        '<label class="kanban-filter-label">Срок с</label>' +
                        '<input type="date" id="kfDateFrom" ' +
                            'class="form-control form-control-sm">' +
                    '</div>' +
                    '<div class="col-md-2 col-sm-6">' +
                        '<label class="kanban-filter-label">Срок по</label>' +
                        '<input type="date" id="kfDateTo" ' +
                            'class="form-control form-control-sm">' +
                    '</div>' +
                    '<div class="col-md-2 d-flex align-items-end">' +
                        '<button type="button" ' +
                            'class="btn btn-sm btn-outline-secondary w-100" ' +
                            'id="kfReset">' +
                            '<i class="bi bi-x-circle"></i> Сбросить' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        $tasksBlock.before(toolbarHtml);

        bindToolbarEvents();
        loadFilterOptions();
    }

    // ============================================================
    // РЕЖИМ ОТОБРАЖЕНИЯ
    // ============================================================
    function setViewMode(mode, silent) {
        currentMode = mode;

        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch (e) {}

        var $select = $('#viewModeSelect');
        if ($select.val() !== mode) $select.val(mode);

        if (mode === 'kanban') {
            $('#tasksToolbarTitle').text('Моя доска заявок');
            $('#tasksToolbarIcon')
                .removeClass('bi-table').addClass('bi-kanban-fill');
            $('#tasksToolbarHint').show();
            $('#kanbanOnlyControls').show();
            $('#tasksBlock').hide();
            $('#kanbanBlock').show();

            if (!silent) load();
        } else {
            // ===== ТАБЛИЦА =====
            $('#tasksToolbarTitle').text('Список заявок');
            $('#tasksToolbarIcon')
                .removeClass('bi-kanban-fill').addClass('bi-table');
            $('#tasksToolbarHint').hide();
            $('#kanbanOnlyControls').hide();
            $('#kanbanFiltersPanel').hide();
            $('#kanbanBlock').hide();
            $('#tasksBlock').show();

            if (!silent) {
                // 🆕 Загружаем фильтры И задачи
                if (window.App.Tasks) {
                    if (window.App.Tasks.loadFilters) {
                        window.App.Tasks.loadFilters();
                    }
                    if (window.App.Tasks.setupEventHandlers) {
                        window.App.Tasks.setupEventHandlers();
                    }
                    if (window.App.Tasks.loadTasks) {
                        window.App.Tasks.loadTasks(1);
                    }
                }
            }
        }
    }

    // ============================================================
    // ФИЛЬТРЫ — загрузка опций
    // ============================================================
    function loadFilterOptions() {
        api.get('/api/filters')
            .then(function(data) {
                if (!data || data.error) return;

                var $wt = $('#kfWorkType');
                var current = $wt.val();
                $wt.find('option:not(:first)').remove();
                (data.work_types || []).forEach(function(t) {
                    $wt.append(
                        '<option value="' + utils.escapeHtml(t) + '">' +
                        utils.escapeHtml(t) +
                        '</option>'
                    );
                });
                if (current) $wt.val(current);

                var $cab = $('#kfCabinet');
                current = $cab.val();
                $cab.find('option:not(:first)').remove();
                (data.cabinets || []).forEach(function(c) {
                    $cab.append(
                        '<option value="' + utils.escapeHtml(c) + '">' +
                        utils.escapeHtml(c) +
                        '</option>'
                    );
                });
                if (current) $cab.val(current);
            })
            .catch(function() {});
    }

    // ============================================================
    // ФИЛЬТРЫ — обновление state
    // ============================================================
    function readFilters() {
        filters.workType = ($('#kfWorkType').val() || '').trim();
        filters.cabinet = ($('#kfCabinet').val() || '').trim();
        filters.dateFrom = ($('#kfDateFrom').val() || '').trim();
        filters.dateTo = ($('#kfDateTo').val() || '').trim();
    }

    function updateFiltersCount() {
        var count = 0;
        if (filters.workType) count++;
        if (filters.cabinet) count++;
        if (filters.dateFrom) count++;
        if (filters.dateTo) count++;

        var $badge = $('#kanbanFiltersCount');
        if (count > 0) $badge.text(count).show();
        else $badge.hide();
    }

    function onFiltersChanged() {
        readFilters();
        updateFiltersCount();
        if (currentMode === 'kanban') renderBoard();
    }

    // ============================================================
    // ОБРАБОТЧИКИ ТУЛБАРА
    // ============================================================
    function bindToolbarEvents() {
        $('#viewModeSelect').off('change.viewmode')
            .on('change.viewmode', function() {
                setViewMode($(this).val(), false);
            });

        $('#kanbanFiltersToggle').off('click.kf')
            .on('click.kf', function() {
                var $panel = $('#kanbanFiltersPanel');
                if ($panel.is(':visible')) {
                    $panel.slideUp(180);
                    $(this).removeClass('active');
                } else {
                    $panel.slideDown(180);
                    $(this).addClass('active');
                }
            });

        $('#kfWorkType, #kfCabinet, #kfDateFrom, #kfDateTo')
            .off('change.kf')
            .on('change.kf', onFiltersChanged);

        $('#kfReset').off('click.kf').on('click.kf', function() {
            $('#kfWorkType').val('');
            $('#kfCabinet').val('');
            $('#kfDateFrom').val('');
            $('#kfDateTo').val('');
            onFiltersChanged();
        });

        var $search = $('#kanbanSearch');
        var $wrap = $search.closest('.kanban-search');

        $search.off('input.kf').on('input.kf', function() {
            searchQuery = ($(this).val() || '').trim();
            $wrap.toggleClass('has-value', searchQuery.length > 0);

            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = setTimeout(function() {
                var $input = $('#kanbanSearch');
                var pos = $input.length && $input[0].selectionStart;
                if (currentMode === 'kanban') renderBoard();
                var $newInput = $('#kanbanSearch');
                if ($newInput.length && typeof pos === 'number') {
                    $newInput.focus();
                    try {
                        $newInput[0].setSelectionRange(pos, pos);
                    } catch (e) {}
                }
            }, 220);
        });

        $('#kanbanSearchClear').off('click.kf').on('click.kf', function() {
            searchQuery = '';
            $('#kanbanSearch').val('').trigger('input');
            $('#kanbanSearch').focus();
        });

        $('#kanbanRefreshBtn').off('click.kf').on('click.kf', function() {
            var $btn = $(this);
            var old = $btn.html();
            $btn.prop('disabled', true).html(
                '<span class="spinner-border spinner-border-sm"></span>'
            );
            load();
            setTimeout(function() {
                $btn.prop('disabled', false).html(old);
            }, 600);
        });
    }

    // ============================================================
    // ЗАГРУЗКА ДАННЫХ
    // ============================================================
    function load() {
        var $block = $('#kanbanBlock');
        if ($block.length === 0) return;

        var hasBoard = $block.find('.kanban-wrapper').length > 0;
        if (!hasBoard) renderSkeleton();

        api.get('/api/tasks/kanban')
            .then(function(data) {
                if (data.error) {
                    $block.html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(data.error) + '</div>'
                    );
                    return;
                }
                tasksCache = data.items || [];
                renderBoard();
                updateStats();
            })
            .catch(function(err) {
                console.error('[tasks_kanban] load error:', err);
                if (!hasBoard) {
                    $block.html(
                        '<div class="alert alert-danger">' +
                        'Не удалось загрузить заявки: ' +
                        utils.escapeHtml(err.message || '') + '</div>'
                    );
                }
            });
    }

    // ============================================================
    // СКЕЛЕТОН
    // ============================================================
    function renderSkeleton() {
        var html = '<div class="kanban-wrapper">';
        COLUMNS.forEach(function(col) {
            html += '<div class="kanban-column" ' +
                'data-status="' + utils.escapeHtml(col.status) + '" ' +
                'style="--kanban-accent:' + col.accent + '">' +
                renderColumnHeader(col, '…') +
                '<div class="kanban-column-body" ' +
                'data-status="' + utils.escapeHtml(col.status) + '">' +
                '<div class="kanban-loading">' +
                '<div class="spinner-border spinner-border-sm text-primary"></div>' +
                '</div></div></div>';
        });
        html += '</div>';
        $('#kanbanBlock').html(html);
    }

    function renderColumnHeader(col, count) {
        return '<div class="kanban-column-header">' +
            '<div class="kanban-column-title" ' +
            'style="color:' + col.color + '">' +
            '<i class="bi ' + col.icon + '"></i>' +
            '<span>' + utils.escapeHtml(col.status) + '</span>' +
            '</div>' +
            '<span class="kanban-column-count">' + count + '</span>' +
            '</div>';
    }

    function buildEmptyState(col) {
        return '<div class="kanban-empty">' +
            '<i class="bi ' + col.icon + '"></i>' +
            '<div class="kanban-empty-text">' +
            utils.escapeHtml(col.emptyText) + '</div>' +
            '<div class="kanban-empty-hint">' +
            utils.escapeHtml(col.emptyHint) + '</div>' +
            '</div>';
    }

    // ============================================================
    // ОТРИСОВКА ДОСКИ
    // ============================================================
    function renderBoard() {
        var filtered = filterTasks(tasksCache);

        var grouped = {};
        COLUMNS.forEach(function(col) { grouped[col.status] = []; });
        filtered.forEach(function(t) {
            if (grouped[t.status]) grouped[t.status].push(t);
        });

        var html = '<div class="kanban-wrapper">';

        COLUMNS.forEach(function(col) {
            var items = grouped[col.status] || [];
            html += '<div class="kanban-column" ' +
                'data-status="' + utils.escapeHtml(col.status) + '" ' +
                'style="--kanban-accent:' + col.accent + '">';

            html += renderColumnHeader(col, items.length);

            html += '<div class="kanban-column-body" ' +
                'data-status="' + utils.escapeHtml(col.status) + '">';

            if (items.length === 0) {
                html += buildEmptyState(col);
            } else {
                items.forEach(function(t) {
                    html += renderCard(t);
                });
            }

            html += '</div></div>';
        });

        html += '</div>';
        $('#kanbanBlock').html(html);

        initSortables();
    }

    // ============================================================
    // КАРТОЧКА
    // ============================================================
    function renderCard(t) {
        var prio = t.priority || 'Средний';
        var prioClass = 'priority-medium';
        if (prio === 'Высокий') prioClass = 'priority-high';
        else if (prio === 'Низкий') prioClass = 'priority-low';

        var hasDescription = !!(t.description && t.description.trim());
        var title = hasDescription
            ? utils.truncateText(t.description, 110)
            : 'Без описания';

        var chips = '';
        if (t.cabinet) {
            chips += '<span class="kanban-chip" title="Кабинет">' +
                '<i class="bi bi-door-closed-fill"></i> ' +
                utils.escapeHtml(t.cabinet) + '</span>';
        }
        if (t.work_type) {
            chips += '<span class="kanban-chip" title="' +
                utils.escapeHtml(t.work_type) + '">' +
                '<i class="bi bi-tag-fill"></i> ' +
                utils.escapeHtml(utils.truncateText(t.work_type, 16)) +
                '</span>';
        }

        var deadlineHtml = '';
        if (t.deadline) {
            var dlIcon = t.is_overdue
                ? 'bi-exclamation-triangle-fill'
                : 'bi-clock-fill';
            var dlLabel = t.is_overdue ? 'Просрочено · ' : '';
            deadlineHtml = '<div class="kanban-card-deadline ' +
                (t.is_overdue ? 'is-overdue' : '') + '">' +
                '<i class="bi ' + dlIcon + '"></i>' +
                '<span>' + dlLabel +
                utils.formatDateOnly(t.deadline) + '</span>' +
                '</div>';
        }

        var avatarHtml;
        if (t.executor) {
            var initials = String(t.executor).charAt(0).toUpperCase();
            avatarHtml = '<div class="kanban-avatar" title="' +
                utils.escapeHtml(t.executor) + '">' +
                utils.escapeHtml(initials) + '</div>';
        } else {
            avatarHtml = '<span class="kanban-no-executor">' +
                'Не назначен</span>';
        }

        return '<div class="kanban-card ' + prioClass + '" ' +
            'data-task-id="' + t.id + '" ' +
            'data-priority="' + utils.escapeHtml(prio) + '">' +

            '<div class="kanban-card-header">' +
            '<span class="kanban-card-id">#' + t.id + '</span>' +
            '<div class="kanban-card-header-right">' +
            '<span class="kanban-card-prio prio-' + prioClass +
            '" title="Приоритет: ' + utils.escapeHtml(prio) + '">' +
            '<i class="bi bi-flag-fill"></i> ' +
            utils.escapeHtml(prio) +
            '</span>' +
            '<button type="button" class="kanban-card-open" ' +
            'data-open-task="' + t.id + '" ' +
            'title="Открыть карточку заявки">' +
            '<i class="bi bi-box-arrow-up-right"></i>' +
            '</button>' +
            '</div>' +
            '</div>' +

            '<div class="kanban-card-title' +
            (hasDescription ? '' : ' is-empty') + '">' +
            utils.escapeHtml(title) +
            '</div>' +

            (chips ? '<div class="kanban-card-meta">' + chips + '</div>' : '') +
            deadlineHtml +

            '<div class="kanban-card-footer">' +
            '<span class="kanban-from" title="От: ' +
            utils.escapeHtml(t.from_user || '—') + '">' +
            '<i class="bi bi-person-fill"></i> ' +
            utils.escapeHtml(utils.truncateText(t.from_user || '—', 18)) +
            '</span>' +
            avatarHtml +
            '</div>' +

            '</div>';
    }

    // ============================================================
    // ФИЛЬТРАЦИЯ (клиентская — для поиска и Kanban-фильтров)
    // ============================================================
    function filterTasks(list) {
        var q = searchQuery.toLowerCase();

        return list.filter(function(t) {
            if (filters.workType &&
                (t.work_type || '').trim() !== filters.workType) {
                return false;
            }
            if (filters.cabinet &&
                (t.cabinet || '').trim() !== filters.cabinet) {
                return false;
            }
            if (filters.dateFrom) {
                var dl = (t.deadline || '').substring(0, 10);
                if (!dl || dl < filters.dateFrom) return false;
            }
            if (filters.dateTo) {
                var dl2 = (t.deadline || '').substring(0, 10);
                if (!dl2 || dl2 > filters.dateTo) return false;
            }
            if (q) {
                var fields = [
                    t.description, t.cabinet, t.from_user,
                    t.executor, t.work_type, String(t.id),
                ];
                var matched = false;
                for (var i = 0; i < fields.length; i++) {
                    if (fields[i] &&
                        String(fields[i]).toLowerCase().indexOf(q) !== -1) {
                        matched = true;
                        break;
                    }
                }
                if (!matched) return false;
            }
            return true;
        });
    }

    // ============================================================
    // ОТКРЫТИЕ КАРТОЧКИ
    // ============================================================
    function openTaskCard(taskId) {
        if (!taskId) return;
        if (typeof window.viewTask !== 'function') {
            utils.showErrorMessage('Модуль карточки заявки не загружен');
            return;
        }
        try {
            window.viewTask(taskId);
        } catch (e) {
            console.error('[tasks_kanban] viewTask error:', e);
            utils.showErrorMessage('Не удалось открыть карточку');
        }
    }

    // ============================================================
    // КЛИК vs DRAG
    // ============================================================
    function bindClickDetection() {
        $(document)
            .off('mousedown.kfClick touchstart.kfClick', '.kanban-card')
            .on('mousedown.kfClick touchstart.kfClick',
                '.kanban-card', function(e) {
                    var pt = e.touches && e.touches[0] ? e.touches[0] : e;
                    clickTracker = {
                        x: pt.clientX,
                        y: pt.clientY,
                        time: Date.now(),
                        target: this,
                    };
                });

        $(document)
            .off('mouseup.kfClick touchend.kfClick', '.kanban-card')
            .on('mouseup.kfClick touchend.kfClick',
                '.kanban-card', function(e) {
                    if (!clickTracker || clickTracker.target !== this) {
                        clickTracker = null;
                        return;
                    }

                    if ($(e.target).closest('.kanban-card-open').length) {
                        clickTracker = null;
                        return;
                    }

                    var pt = e.changedTouches && e.changedTouches[0]
                        ? e.changedTouches[0] : e;
                    var dx = Math.abs(pt.clientX - clickTracker.x);
                    var dy = Math.abs(pt.clientY - clickTracker.y);
                    var dt = Date.now() - clickTracker.time;
                    clickTracker = null;

                    if (dx < 6 && dy < 6 && dt < 400) {
                        var taskId = parseInt(
                            $(this).attr('data-task-id'), 10
                        );
                        openTaskCard(taskId);
                    }
                });
    }

    // ============================================================
    // SORTABLE
    // ============================================================
    function initSortables() {
        Object.keys(sortables).forEach(function(k) {
            try { sortables[k].destroy(); } catch (e) {}
        });
        sortables = {};

        if (typeof Sortable === 'undefined') return;

        $('.kanban-column-body').each(function() {
            var el = this;
            var status = $(el).data('status');

            sortables[status] = Sortable.create(el, {
                group: { name: 'kanban', pull: true, put: true },
                animation: 200,
                easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
                ghostClass: 'kanban-card-ghost',
                dragClass: 'kanban-card-dragging',
                chosenClass: 'kanban-card-chosen',
                handle: '.kanban-card',
                filter: '.kanban-card-open',
                preventOnFilter: false,
                scroll: true,
                scrollSensitivity: 100,
                scrollSpeed: 14,
                delay: 120,
                delayOnTouchOnly: true,
                touchStartThreshold: 6,
                fallbackOnBody: true,
                swapThreshold: 0.65,

                onStart: function(evt) {
                    $('.kanban-empty').hide();
                    $('.kanban-column').removeClass(
                        'drag-valid drag-invalid drag-over'
                    );
                    $(evt.item).addClass('kanban-card-dragging');
                    clickTracker = null;
                },

                onMove: function(evt) {
                    var fromStatus = $(evt.from).data('status');
                    var toStatus = $(evt.to).data('status');

                    if (fromStatus === toStatus) return true;

                    $('.kanban-column').removeClass(
                        'drag-valid drag-invalid'
                    );

                    if (!isTransitionAllowed(fromStatus, toStatus)) {
                        $(evt.to).closest('.kanban-column')
                            .addClass('drag-invalid');
                        rejectedHint = { from: fromStatus, to: toStatus };
                        return false;
                    }

                    $(evt.to).closest('.kanban-column')
                        .addClass('drag-valid');
                    rejectedHint = null;
                    return true;
                },

                onEnd: function(evt) {
                    $(evt.item).removeClass('kanban-card-dragging');
                    $('.kanban-column').removeClass(
                        'drag-valid drag-invalid drag-over'
                    );

                    var taskId = parseInt(
                        $(evt.item).attr('data-task-id'), 10
                    );
                    var toStatus = $(evt.to).data('status');
                    var fromStatus = $(evt.from).data('status');

                    if (rejectedHint) {
                        showRejectionToast(
                            rejectedHint.from, rejectedHint.to
                        );
                        rejectedHint = null;
                        setTimeout(refreshEmptyStates, 50);
                        return;
                    }

                    if (!taskId || fromStatus === toStatus) {
                        setTimeout(refreshEmptyStates, 50);
                        return;
                    }

                    moveTask(taskId, toStatus, fromStatus, evt);
                },
            });
        });
    }

    // ============================================================
    // ПУСТЫЕ СОСТОЯНИЯ
    // ============================================================
    function refreshEmptyStates() {
        COLUMNS.forEach(function(col) {
            var $col = $('.kanban-column[data-status="' +
                col.status + '"]');
            if ($col.length === 0) return;

            var $body = $col.find('.kanban-column-body');
            var count = $body.find('.kanban-card').length;
            var $empty = $body.find('.kanban-empty');

            if (count === 0) {
                if ($empty.length === 0) {
                    $body.html(buildEmptyState(col));
                } else {
                    $empty.show();
                }
            } else {
                $empty.remove();
            }

            $col.find('.kanban-column-count').text(count);
        });
    }

    // ============================================================
    // ПЕРЕМЕЩЕНИЕ
    // ============================================================
    function moveTask(taskId, newStatus, oldStatus, evt) {
        refreshEmptyStates();

        var $item = $(evt.item);
        $item.css('box-shadow', '0 0 0 3px rgba(102, 126, 234, 0.4)');

        api.post('/api/task/' + taskId + '/move', { status: newStatus })
            .then(function(res) {
                $item.css('box-shadow', '');

                if (!res.success) {
                    utils.showErrorMessage(res.error || 'Ошибка');
                    load();
                    return;
                }

                var t = tasksCache.find(function(x) {
                    return x.id === taskId;
                });
                if (t) {
                    t.status = newStatus;
                    if (newStatus === 'В работе' && !t.executor) {
                        t.executor = window.currentUserFullName;
                    }
                    if (newStatus === 'Выполнено') {
                        t.completed_date = new Date().toISOString();
                        if (!t.executor) {
                            t.executor = window.currentUserFullName;
                        }
                    }
                }

                var msgs = {
                    'В работе': 'Заявка взята в работу',
                    'Выполнено': 'Заявка закрыта',
                };
                var msg = msgs[newStatus] || ('Заявка → ' + newStatus);

                if (window.App.Toasts) {
                    window.App.Toasts.success(msg, '', { duration: 2200 });
                } else {
                    utils.showSuccessMessage(msg);
                }

                updateStats();
                scheduleReload();
            })
            .catch(function(err) {
                $item.css('box-shadow', '');
                utils.showErrorMessage(err.message || 'Ошибка');
                load();
            });
    }

    function scheduleReload() {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(function() {
            load();
        }, 900);
    }

    // ============================================================
    // ТОСТ: ПЕРЕХОД ЗАПРЕЩЁН
    // ============================================================
    function showRejectionToast(from, to) {
        var text = describeTransition(from, to);

        if (window.App.Toasts) {
            window.App.Toasts.warning(
                'Переход запрещён', text, { duration: 2600 }
            );
        } else {
            utils.showErrorMessage(text);
        }

        var $card = $('.kanban-card[data-task-id]').filter(function() {
            return $(this).closest('.kanban-column')
                .data('status') === from;
        }).first();

        if ($card.length) {
            $card.css('animation', 'kanban-shake 0.35s');
            setTimeout(function() {
                $card.css('animation', '');
            }, 400);
        }
    }

    // ============================================================
    // СТАТИСТИКА
    // ============================================================
    function updateStats() {
        if (window.App.Tasks && window.App.Tasks.loadStatistics) {
            window.App.Tasks.loadStatistics();
        }
    }

    // ============================================================
    // КНОПКА «ОТКРЫТЬ»
    // ============================================================
    function bindOpenButtons() {
        $(document)
            .off('click.kfOpen', '.kanban-card-open')
            .on('click.kfOpen', '.kanban-card-open', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var id = parseInt(
                    $(this).attr('data-open-task'), 10
                );
                openTaskCard(id);
            });
    }

    // ============================================================
    // ПОСЛЕ МОДАЛКИ — ОБНОВИТЬ
    // ============================================================
    function bindModalRefresh() {
        $(document)
            .off('hidden.bs.modal.kf', '#viewTaskModal')
            .on('hidden.bs.modal.kf', '#viewTaskModal', function() {
                if (currentMode === 'kanban' &&
                    $('#kanbanBlock').is(':visible')) {
                    setTimeout(function() { load(); }, 150);
                }
            });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.init = init;
    mod.load = load;
    mod.reload = load;
    mod.setViewMode = setViewMode;
    mod.isTransitionAllowed = isTransitionAllowed;
    mod.openTask = openTaskCard;
    mod.getViewMode = function() { return currentMode; };

    window.loadTasksKanban = load;
    window.setTasksViewMode = setViewMode;

    $(document).ready(function() {
        bindClickDetection();
        bindOpenButtons();
        bindModalRefresh();
    });

    console.log('[tasks_kanban] Загружено (v4: init вызывает фильтры)');
})();