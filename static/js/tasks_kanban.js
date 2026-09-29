// static/js/tasks_kanban.js
// Kanban-доска для Техника / Админа / Разработчика.
// Единый рендер в #adminKanbanBlock. Переключатель #viewSwitcher
// показывает/скрывает таблицу и доску через switchView().
//
// Техник видит только «свои + новые без исполнителя» через
// параметр for_technician на бэкенде.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[tasks_kanban] App не инициализирован');
        return;
    }

    var mod = window.App.register('TasksKanban');
    var api = window.App.api;
    var state = window.App.state;

    var VIEW_KEY = 'supportactive_view';

    // Разрешённые переходы статусов
    var ADMIN_TRANSITIONS = {
        'Новое':     ['В работе', 'Выполнено'],
        'В работе':  ['Выполнено'],
        'Выполнено': [],
    };

    var draggedCard = null;
    var draggedFromStatus = null;

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function escapeHtmlLocal(s) {
        if (window.escapeHtml) return window.escapeHtml(s);
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(String(s == null ? '' : s)));
        return d.innerHTML;
    }

    // ============================================================
    // ПЕРЕКЛЮЧАТЕЛЬ
    // ============================================================
    function switchView(view) {
        document.querySelectorAll('#viewSwitcher button').forEach(function(b) {
            b.classList.toggle('active', b.dataset.view === view);
        });
        try { localStorage.setItem(VIEW_KEY, view); } catch (e) {}

        $('#tasksBlock').show();

        if (view === 'kanban') {
            $('#tableView').hide();
            $('#bulkBar').hide();
            $('#adminKanbanBlock').show();
            renderAdminKanban();
        } else {
            $('#adminKanbanBlock').hide();
            $('#tableView').show();
            if (window.App.Tasks && typeof window.App.Tasks.loadTasks === 'function') {
                window.App.Tasks.loadTasks(1);
            }
        }
    }

    // ============================================================
    // ЗАПРОС
    // ============================================================
    function buildKanbanQuery() {
        var params = new URLSearchParams();
        params.append('per_page', '500');
        params.append('page', '1');

        var role = window.currentUserRole;
        var userName = window.currentUserFullName || '';

        if (role === 'Техник' && userName) {
            params.append('for_technician', userName);
        }

        var wt = $('#filterWorkType').val();
        var cb = $('#filterCabinet').val();
        var st = $('#filterStatus').val();
        var us = $('#filterUser').val();
        var fd = $('#filterDate').val();
        var search = $('#taskSearchInput').val();

        if (wt) params.append('work_type', wt);
        if (cb) params.append('cabinet', cb);
        if (st) params.append('status', st);
        if (us && role === 'Администратор') params.append('user', us);
        if (fd) {
            params.append('date_from', fd + ' 00:00:00');
            params.append('date_to', fd + ' 23:59:59');
        }
        if (search && search.trim().length >= 2) {
            params.append('search', search.trim());
        }
        return params;
    }

    // ============================================================
    // РЕНДЕР КАНБАНА
    // ============================================================
    function renderAdminKanban() {
        var $block = $('#adminKanbanBlock');
        if (!$block.length) return;

        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border"></div>' +
            '<p class="mt-2 text-muted">Загрузка заявок…</p>' +
            '</div>'
        );

        var params = buildKanbanQuery();
        fetch('/api/tasks?' + params.toString())
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.error) {
                    $block.html(
                        '<div class="alert alert-danger m-3">' +
                        escapeHtmlLocal(data.error) + '</div>'
                    );
                    return;
                }
                var items = (data && data.items) || [];
                renderKanbanBoard(items);
                initAdminKanbanDrag();
            })
            .catch(function(err) {
                console.error('[tasks_kanban] renderAdminKanban error:', err);
                $block.html(
                    '<div class="alert alert-danger m-3">' +
                    'Не удалось загрузить заявки</div>'
                );
            });
    }

    function renderKanbanBoard(items) {
        var COLUMNS = [
            { status: 'Новое',     icon: 'bi-inbox',           color: 'var(--accent)', emptyText: 'Нет новых заявок' },
            { status: 'В работе',  icon: 'bi-hourglass-split', color: '#b45309',       emptyText: 'В работе ничего нет' },
            { status: 'Выполнено', icon: 'bi-check-circle',    color: '#047857',       emptyText: 'Выполненных нет' },
        ];

        var grouped = { 'Новое': [], 'В работе': [], 'Выполнено': [] };
        (items || []).forEach(function(t) {
            if (grouped[t.status]) grouped[t.status].push(t);
        });

        var html = '<div class="kanban">';
        COLUMNS.forEach(function(col) {
            var list = grouped[col.status] || [];
            html += '<div class="kanban-column" data-status="' + escapeHtmlLocal(col.status) + '">';
            html += '<div class="kanban-column-head">';
            html += '<div class="kanban-column-title" style="color:' + col.color + '">';
            html += '<i class="bi ' + col.icon + '"></i>';
            html += '<span>' + escapeHtmlLocal(col.status) + '</span>';
            html += '</div>';
            html += '<span class="kanban-column-count">' + list.length + '</span>';
            html += '</div>';

            html += '<div class="kanban-column-body" data-status="' + escapeHtmlLocal(col.status) + '">';
            if (list.length === 0) {
                html += '<div class="kanban-empty-hint text-muted text-center py-4 small" ' +
                        'style="font-style:italic">' + escapeHtmlLocal(col.emptyText) + '</div>';
            } else {
                list.forEach(function(t) { html += renderKanbanCard(t); });
            }
            html += '</div></div>';
        });
        html += '</div>';

        $('#adminKanbanBlock').html(html);
    }

    function renderKanbanCard(t) {
        var prio = t.priority || 'Средний';
        var prioClass = prio === 'Высокий' ? 'p-high'
            : (prio === 'Низкий' ? 'p-low' : 'p-medium');
        var prioBadgeClass = prio === 'Высокий' ? 'high'
            : (prio === 'Низкий' ? 'low' : 'medium');

        var desc = (t.description || '').trim();
        var title = desc ? desc.slice(0, 130) : 'Без описания';

        var chips = '';
        if (t.cabinet) chips += '<span class="kanban-chip">📁 ' + escapeHtmlLocal(t.cabinet) + '</span>';
        if (t.work_type) chips += '<span class="kanban-chip">🏷️ ' + escapeHtmlLocal(t.work_type) + '</span>';

        var tagsHtml = '';
        if (t.tags && t.tags.length > 0 && window.App.Tags) {
            tagsHtml = '<div class="kanban-card-tags">' +
                t.tags.map(function(tag) {
                    return window.App.Tags.renderChip(tag, { small: true });
                }).join('') +
                '</div>';
        }

        var deadlineHtml = '';
        if (t.deadline) {
            var dlDate = window.formatDateOnly ? window.formatDateOnly(t.deadline) : t.deadline;
            var dlCls = t.is_overdue ? ' style="color:var(--danger);font-weight:600"' : '';
            deadlineHtml = '<div class="kanban-card-deadline"' + dlCls + '>⏰ ' + escapeHtmlLocal(dlDate) + '</div>';
        }

        var executorHtml;
        if (t.executor) {
            var initial = String(t.executor).charAt(0).toUpperCase();
            executorHtml = '<div class="kanban-avatar" title="' +
                escapeHtmlLocal(t.executor) + '">' + escapeHtmlLocal(initial) + '</div>';
        } else {
            executorHtml = '<span style="font-style:italic;">Не назначен</span>';
        }

        var fromUser = t.from_user || '—';

        return '<div class="kanban-card ' + prioClass + '" ' +
            'data-task-id="' + t.id + '" ' +
            'onclick="viewTask(' + t.id + ')">' +
            '<div class="kanban-card-head">' +
            '<span class="kanban-card-id">#' + t.id + '</span>' +
            '<span class="badge-priority ' + prioBadgeClass + '">' + escapeHtmlLocal(prio) + '</span>' +
            '</div>' +
            '<div class="kanban-card-title">' + escapeHtmlLocal(title) + '</div>' +
            (chips ? '<div class="kanban-card-chips">' + chips + '</div>' : '') +
            tagsHtml +
            deadlineHtml +
            '<div class="kanban-card-foot">' +
            '<span>' + escapeHtmlLocal(fromUser) + '</span>' +
            executorHtml +
            '</div>' +
            '</div>';
    }

    // ============================================================
    // DRAG & DROP
    // ============================================================
    function initAdminKanbanDrag() {
        var block = document.getElementById('adminKanbanBlock');
        if (!block) return;

        var cards = block.querySelectorAll('.kanban-card');
        var columns = block.querySelectorAll('.kanban-column');

        cards.forEach(function(card) {
            var newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            newCard.setAttribute('draggable', 'true');

            newCard.addEventListener('dragstart', function(e) {
                draggedCard = newCard;
                draggedFromStatus = $(newCard).closest('.kanban-column').data('status');
                newCard.classList.add('kanban-card-dragging');
                document.body.classList.add('kanban-dragging-active');
                try {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain',
                        String($(newCard).data('task-id')));
                } catch (err) {}
            });

            newCard.addEventListener('dragend', function() {
                newCard.classList.remove('kanban-card-dragging');
                document.body.classList.remove('kanban-dragging-active');
                block.querySelectorAll('.kanban-column').forEach(function(c) {
                    c.classList.remove('drop-valid', 'drop-invalid');
                });
                draggedCard = null;
                draggedFromStatus = null;
            });
        });

        columns.forEach(function(col) {
            var $col = $(col);
            var toStatus = $col.data('status');
            var body = col.querySelector('.kanban-column-body') || col;

            col.addEventListener('dragover', function(e) {
                if (!draggedCard) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                var allowed = ADMIN_TRANSITIONS[draggedFromStatus] || [];
                var isAllowed = (draggedFromStatus === toStatus)
                    || (allowed.indexOf(toStatus) !== -1);

                $col.removeClass('drop-valid drop-invalid');
                if (draggedFromStatus === toStatus) {
                    // та же колонка — без подсветки
                } else if (isAllowed) {
                    $col.addClass('drop-valid');
                } else {
                    $col.addClass('drop-invalid');
                }
            });

            col.addEventListener('dragleave', function(e) {
                if (e.relatedTarget && col.contains(e.relatedTarget)) return;
                $col.removeClass('drop-valid drop-invalid');
            });

            col.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var fromStatus = draggedFromStatus;
                var isSameCol = (fromStatus === toStatus);
                var allowed = ADMIN_TRANSITIONS[fromStatus] || [];
                var isAllowed = isSameCol || (allowed.indexOf(toStatus) !== -1);

                $col.removeClass('drop-valid drop-invalid');

                if (!draggedCard || isSameCol) return;

                if (!isAllowed) {
                    if (window.App.Toasts) {
                        window.App.Toasts.warning('Переход запрещён',
                            fromStatus + ' → ' + toStatus, { duration: 2200 });
                    }
                    return;
                }

                var card = draggedCard;
                var taskId = parseInt($(card).data('task-id'), 10);

                $col.find('.kanban-empty-hint').remove();
                body.appendChild(card);
                updateKanbanCounts();
                moveTaskAdmin(taskId, toStatus);
            });
        });
    }

    function moveTaskAdmin(taskId, newStatus) {
        fetch('/api/task/' + taskId + '/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res && res.success) {
                    if (window.App.Toasts) {
                        window.App.Toasts.success('Готово',
                            'Заявка → ' + newStatus, { duration: 1800 });
                    }
                    updateKanbanCounts();
                    if (window.App.Tasks && window.App.Tasks.loadStatistics) {
                        window.App.Tasks.loadStatistics();
                    }
                } else {
                    if (window.App.Toasts) {
                        window.App.Toasts.error('Ошибка',
                            (res && res.error) || 'Не удалось',
                            { duration: 2600 });
                    }
                    renderAdminKanban();
                }
            })
            .catch(function(err) {
                if (window.App.Toasts) {
                    window.App.Toasts.error('Ошибка',
                        err.message || 'Ошибка сети', { duration: 2600 });
                }
                renderAdminKanban();
            });
    }

    function updateKanbanCounts() {
        document.querySelectorAll('#adminKanbanBlock .kanban-column')
            .forEach(function(col) {
                var count = col.querySelectorAll('.kanban-card').length;
                $(col).find('.kanban-column-count').text(count);

                var $body = $(col).find('.kanban-column-body');
                var hasCards = $body.find('.kanban-card').length > 0;
                var hasPlaceholder = $body.find('.kanban-empty-hint').length > 0;
                if (!hasCards && !hasPlaceholder) {
                    $body.append(
                        '<div class="kanban-empty-hint text-muted text-center py-4 small" ' +
                        'style="font-style:italic">Нет заявок</div>'
                    );
                }
            });
    }

    // ============================================================
    // ФИЛЬТРЫ → ПЕРЕРИСОВКА КАНБАНА
    // ============================================================
    function bindAdminKanbanFilters() {
        $(document)
            .off('change.adminKf', '#filterWorkType, #filterCabinet, #filterStatus, #filterUser, #filterDate')
            .on('change.adminKf', '#filterWorkType, #filterCabinet, #filterStatus, #filterUser, #filterDate',
                function() {
                    if (!$('#adminKanbanBlock').is(':visible')) return;
                    renderAdminKanban();
                });

        $(document)
            .off('input.adminKf', '#taskSearchInput')
            .on('input.adminKf', '#taskSearchInput', function() {
                if (!$('#adminKanbanBlock').is(':visible')) return;
                clearTimeout(window._adminKfTimer);
                window._adminKfTimer = setTimeout(function() {
                    renderAdminKanban();
                }, 400);
            });
    }

    // ============================================================
    // ПОКАЗ СЕГМЕНТИРОВАННОГО ПЕРЕКЛЮЧАТЕЛЯ
    // ============================================================
    function applyViewSwitcherVisibility() {
        var role = window.currentUserRole;
        var $sw = $('#viewSwitcher');
        if (!$sw.length) return;

        if (role === 'Пользователь') {
            $sw.hide();
            return;
        }

        $sw.css('display', 'inline-flex');

        var mode = 'table';
        try { mode = localStorage.getItem(VIEW_KEY) || 'table'; } catch (e) {}
        if (mode !== 'kanban' && mode !== 'table') mode = 'table';

        $sw.find('button').each(function() {
            $(this).toggleClass('active', $(this).data('view') === mode);
        });

        if (mode === 'kanban') switchView('kanban');
    }

    function pollUserRole() {
        var tries = 0;
        var timer = setInterval(function() {
            tries++;
            if (window.currentUserRole) {
                applyViewSwitcherVisibility();
                clearInterval(timer);
            } else if (tries > 50) {
                clearInterval(timer);
            }
        }, 200);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.switchView = switchView;
    mod.renderAdminKanban = renderAdminKanban;
    mod.applyViewSwitcherVisibility = applyViewSwitcherVisibility;

    window.switchView = switchView;
    window.loadTasksKanban = renderAdminKanban;

    $(document).ready(function() {
        bindAdminKanbanFilters();
        pollUserRole();
    });

    console.log('[tasks_kanban] Загружено (v6: unified)');
})();