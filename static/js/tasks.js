// static/js/tasks.js
// Список заявок, фильтры, пагинация, серверный поиск, создание, контекстное меню

(function() {
    'use strict';

    if (!window.App) {
        console.error('[tasks] App не инициализирован');
        return;
    }

    var api = window.App.register('Tasks');
    var utils = window.App.utils;
    var state = window.App.state;

    // Приватная переменная модуля
    var searchDebounceTimer = null;

    // ============= СТАТИСТИКА =============
    function loadStatistics() {
        if (window.currentUserRole === 'Пользователь') return;

        fetch('/api/statistics')
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/login'; return null; }
                return r.json();
            })
            .then(function(data) {
                if (!data || data.error) return;

                if (window.currentUserRole === 'Техник') {
                    utils.animateNumber('#statCompleted', data.user_completed || 0);
                    utils.animateNumber('#statNewProgress', data.user_in_progress || 0);
                    utils.animateNumber('#statTotal', data.user_total || 0);
                    $('#statCompleted').closest('.stats-card').find('.stats-label').text('Мои выполнено');
                    $('#statNewProgress').closest('.stats-card').find('.stats-label').text('Мои в работе');
                    $('#statTotal').closest('.stats-card').find('.stats-label').text('Мои всего');
                } else {
                    utils.animateNumber('#statCompleted', data.completed || 0);
                    utils.animateNumber('#statNewProgress', data.new_or_progress || 0);
                    utils.animateNumber('#statTotal', data.total || 0);
                    utils.animateNumber('#statMyCompleted', data.user_total || 0);
                }
            })
            .catch(function(err) { console.error('[tasks] statistics error:', err); });
    }

    // ============= ФИЛЬТРЫ =============
    function loadFilters() {
        if (window.currentUserRole === 'Пользователь') return;

        fetch('/api/filters')
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/login'; return null; }
                return r.json();
            })
            .then(function(data) {
                if (!data || data.error) return;

                function fill(sel, list, allText) {
                    var $s = $(sel);
                    $s.empty().append('<option value="">' + allText + '</option>');
                    (list || []).forEach(function(v) {
                        $s.append('<option value="' + utils.escapeHtml(v) + '">' + utils.escapeHtml(v) + '</option>');
                    });
                }

                fill('#filterWorkType', data.work_types, 'Все типы работ');
                fill('#filterCabinet', data.cabinets, 'Все кабинеты');
                fill('#filterStatus', data.statuses, 'Все статусы');

                if (window.currentUserRole === 'Администратор') {
                    fill('#filterUser', data.users, 'Все пользователи');
                }
            })
            .catch(function(err) { console.error('[tasks] filters error:', err); });
    }

    // ============= СПИСОК =============
    function loadTasks(page) {
        page = page || 1;
        state.currentPage = page;

        showLoadingIndicator();

        var params = new URLSearchParams();
        params.append('page', page);
        params.append('per_page', state.currentPerPage);

        var role = window.currentUserRole;

        if (role === 'Техник') {
            var userName = window.currentUserFullName || $('#userName').text().trim();
            if (userName && userName !== 'Неизвестно') params.append('user', userName);

            var wt = $('#filterWorkType').val();
            var cb = $('#filterCabinet').val();
            var st = $('#filterStatus').val();
            var fd = $('#filterDate').val();

            if (wt) params.append('work_type', wt);
            if (cb) params.append('cabinet', cb);
            if (st) params.append('status', st);
            else params.append('exclude_status', 'Выполнено,Отменено');
            if (fd) {
                params.append('date_from', fd + ' 00:00:00');
                params.append('date_to', fd + ' 23:59:59');
            }
        } else if (role === 'Пользователь') {
            if (state.currentUserId) params.append('created_by', state.currentUserId);
        } else {
            var wt2 = $('#filterWorkType').val();
            var cb2 = $('#filterCabinet').val();
            var st2 = $('#filterStatus').val();
            var us = $('#filterUser').val();
            var fd2 = $('#filterDate').val();

            if (wt2) params.append('work_type', wt2);
            if (cb2) params.append('cabinet', cb2);
            if (st2) params.append('status', st2);
            if (us) params.append('user', us);
            if (fd2) {
                params.append('date_from', fd2 + ' 00:00:00');
                params.append('date_to', fd2 + ' 23:59:59');
            }
        }

        var searchText = $('#taskSearchInput').val();
        if (searchText && searchText.trim().length >= 2) {
            params.append('search', searchText.trim());
        }

        fetch('/api/tasks?' + params.toString())
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/login'; return null; }
                return r.json();
            })
            .then(function(data) {
                if (!data) return;
                if (data.error) { showErrorInTable(data.error); return; }
                renderTasksTable(data.items || []);
                state.currentTotalPages = data.pages || 1;
                renderPagination(data);
            })
            .catch(function(err) {
                console.error('[tasks] load error:', err);
                showErrorInTable('Не удалось загрузить заявки.');
            });
    }

    function showLoadingIndicator() {
        var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
        $('#tasksTableBody').html(
            '<tr><td colspan="' + colSpan + '" class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2 text-muted">Загрузка...</p></td></tr>'
        );
    }

    function showErrorInTable(msg) {
        var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
        $('#tasksTableBody').html(
            '<tr><td colspan="' + colSpan + '" class="text-center py-5 text-danger">' +
            '<i class="bi bi-exclamation-triangle" style="font-size:3rem;"></i>' +
            '<p class="mt-2">' + utils.escapeHtml(msg) + '</p>' +
            '<button class="btn btn-sm btn-primary mt-2" onclick="loadTasks(1)">Повторить</button></td></tr>'
        );
    }

    function renderTasksTable(tasks) {
        var tbody = $('#tasksTableBody');
        tbody.empty();
        updateTableHeaders();

        if (!tasks || tasks.length === 0) {
            var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
            tbody.append(
                '<tr><td colspan="' + colSpan + '" class="text-center py-5">' +
                '<i class="bi bi-inbox" style="font-size:3rem;color:#ccc;"></i>' +
                '<p class="text-muted mt-2">Нет заявок</p></td></tr>'
            );
            return;
        }
        tasks.forEach(function(t) { tbody.append(createTaskRow(t)); });
    }

    function renderPagination(data) {
        var $pag = $('#tasksPagination');
        if (!data || data.pages <= 1) { $pag.empty(); return; }

        var page = data.page, pages = data.pages;
        var html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';

        html += '<li class="page-item ' + (page === 1 ? 'disabled' : '') + '">' +
                '<a class="page-link" href="#" onclick="loadTasks(1); return false;">' +
                '<i class="bi bi-chevron-double-left"></i></a></li>';
        html += '<li class="page-item ' + (page === 1 ? 'disabled' : '') + '">' +
                '<a class="page-link" href="#" onclick="loadTasks(' + (page - 1) + '); return false;">' +
                '<i class="bi bi-chevron-left"></i></a></li>';

        var start = Math.max(1, page - 2), end = Math.min(pages, page + 2);

        if (start > 1) {
            html += '<li class="page-item"><a class="page-link" href="#" onclick="loadTasks(1); return false;">1</a></li>';
            if (start > 2) html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
        }
        for (var i = start; i <= end; i++) {
            html += '<li class="page-item ' + (i === page ? 'active' : '') + '">' +
                    '<a class="page-link" href="#" onclick="loadTasks(' + i + '); return false;">' + i + '</a></li>';
        }
        if (end < pages) {
            if (end < pages - 1) html += '<li class="page-item disabled"><span class="page-link">…</span></li>';
            html += '<li class="page-item"><a class="page-link" href="#" onclick="loadTasks(' + pages + '); return false;">' + pages + '</a></li>';
        }

        html += '<li class="page-item ' + (page === pages ? 'disabled' : '') + '">' +
                '<a class="page-link" href="#" onclick="loadTasks(' + (page + 1) + '); return false;">' +
                '<i class="bi bi-chevron-right"></i></a></li>';
        html += '<li class="page-item ' + (page === pages ? 'disabled' : '') + '">' +
                '<a class="page-link" href="#" onclick="loadTasks(' + pages + '); return false;">' +
                '<i class="bi bi-chevron-double-right"></i></a></li>';
        html += '</ul></nav>';

        html += '<div class="text-center text-muted small mt-2">' +
                'Показано ' + ((page - 1) * data.per_page + 1) + '–' +
                Math.min(page * data.per_page, data.total) +
                ' из ' + data.total + '</div>';

        $pag.html(html);
    }

    function updateTableHeaders() {
        var thead = $('.table-container table thead tr');
        if (window.currentUserRole === 'Администратор') {
            thead.html(
                '<th><input type="checkbox" id="selectAll"></th>' +
                '<th>Дата</th><th>Срок</th><th>От кого</th><th>Кабинет</th>' +
                '<th>Описание</th><th>Тип</th><th>Статус</th><th>Приоритет</th>' +
                '<th>Исполнитель</th><th>Помощник</th>'
            );
        } else {
            thead.html(
                '<th>Дата</th><th>Срок</th><th>От кого</th><th>Кабинет</th>' +
                '<th>Описание</th><th>Тип</th><th>Статус</th><th>Приоритет</th>' +
                '<th>Исполнитель</th><th>Помощник</th>'
            );
        }
    }

    function createTaskRow(task) {
        var statusClass = utils.getStatusClass(task.status);
        var priorityClass = utils.getPriorityClass(task.priority);

        var rowStyle = '', rowClass = '', deadlineHtml = '';

        if (task.status !== 'Выполнено' && task.status !== 'Отменено' && task.deadline) {
            var dl = new Date(task.deadline.replace(' ', 'T'));
            var diffMs = dl - new Date();
            var diffHours = diffMs / 3600000;
            if (diffMs < 0) {
                rowClass = 'table-danger';
                rowStyle = 'background-color:#f8d7da !important;';
                deadlineHtml = '<span class="badge bg-danger">Просрочена</span> ' + utils.formatDate(task.deadline);
            } else if (diffHours < 24) {
                rowClass = 'table-warning';
                rowStyle = 'background-color:#fff3cd !important;';
                deadlineHtml = '<span class="badge bg-warning text-dark">Скоро</span> ' + utils.formatDate(task.deadline);
            } else {
                deadlineHtml = utils.formatDate(task.deadline);
            }
        } else {
            deadlineHtml = utils.formatDate(task.deadline);
        }

        var row = '<tr class="task-row ' + rowClass + '" style="' + rowStyle + '" ' +
                  'data-task-id="' + task.id + '" ' +
                  'onclick="viewTask(' + task.id + ')" ' +
                  'oncontextmenu="handleContextMenu(event, ' + task.id + '); return false;">';

        if (window.currentUserRole === 'Администратор') {
            row += '<td onclick="event.stopPropagation()">' +
                   '<input type="checkbox" class="task-checkbox" value="' + task.id + '" ' +
                   'onchange="toggleTaskSelection(' + task.id + ', this.checked)"></td>';
        }

        row += '<td>' + utils.formatDate(task.created_date) + '</td>' +
            '<td>' + deadlineHtml + '</td>' +
            '<td>' + utils.escapeHtml(task.from_user || '-') + '</td>' +
            '<td>' + utils.escapeHtml(task.cabinet || '-') + '</td>' +
            '<td title="' + utils.escapeHtml(task.description || '') + '">' + utils.escapeHtml(utils.truncateText(task.description, 40)) + '</td>' +
            '<td><span class="badge bg-secondary">' + utils.escapeHtml(task.work_type || 'Не указан') + '</span></td>' +
            '<td><span class="status-badge ' + statusClass + '">' + utils.escapeHtml(task.status || 'Новое') + '</span></td>' +
            '<td><span class="' + priorityClass + '"><i class="bi bi-flag-fill"></i> ' + utils.escapeHtml(task.priority || 'Средний') + '</span></td>' +
            '<td>' + (task.executor ? utils.escapeHtml(task.executor) : '<span class="text-muted">Не назначен</span>') + '</td>' +
            '<td>' + (task.assistant ? utils.escapeHtml(task.assistant) : '<span class="text-muted">Не назначен</span>') + '</td>';

        return row + '</tr>';
    }

    function clearFilters() {
        $('#filterWorkType, #filterCabinet, #filterStatus, #filterUser, #filterDate, #taskSearchInput').val('');
        loadTasks(1);
    }

    // ============= СОЗДАНИЕ =============
    function createTask() {
        var form = document.getElementById('createTaskForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var formData = new FormData(form);
        var data = {};
        formData.forEach(function(value, key) { data[key] = value; });

        Swal.fire({ title: 'Создание...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

        fetch('/api/create_task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (result.success) {
                    $('#createTaskModal').modal('hide');
                    Swal.fire({ icon: 'success', title: 'Заявка создана!', text: 'Номер: ' + result.task_id, timer: 2000, showConfirmButton: false });
                    api.refreshData();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
                }
            })
            .catch(function() { Swal.fire({ icon: 'error', title: 'Ошибка', text: 'Не удалось создать заявку' }); });
    }

    // ============= МАССОВОЕ ЗАКРЫТИЕ =============
    function closeSelectedTasks() {
        if (state.selectedTasks.size === 0) { Swal.fire({ icon: 'info', title: 'Не выбраны заявки' }); return; }
        Swal.fire({
            title: 'Закрыть заявки?',
            text: 'Выбрано: ' + state.selectedTasks.size,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да'
        }).then(function(r) { if (r.isConfirmed) executeCloseMultipleTasks(); });
    }

    function executeCloseMultipleTasks() {
        var promises = Array.from(state.selectedTasks).map(function(id) {
            return fetch('/api/close_task/' + id, { method: 'POST' }).then(function(r) { return r.json(); });
        });
        Promise.all(promises).then(function() {
            state.selectedTasks.clear();
            $('#selectAll').prop('checked', false);
            Swal.fire({ icon: 'success', title: 'Заявки закрыты!', timer: 1500, showConfirmButton: false });
            api.refreshData();
        });
    }

    function toggleTaskSelection(taskId, isChecked) {
        if (isChecked) state.selectedTasks.add(taskId.toString());
        else {
            state.selectedTasks.delete(taskId.toString());
            $('#selectAll').prop('checked', false);
        }
    }

    // ============= КОНТЕКСТНОЕ МЕНЮ =============
    function handleContextMenu(event, taskId) {
        event.preventDefault();
        event.stopPropagation();
        $('#contextMenu').remove();

        var menuHtml = '<div id="contextMenu" class="context-menu" ' +
                       'style="left:' + event.pageX + 'px;top:' + event.pageY + 'px;">' +
            '<div class="context-menu-item" onclick="viewTask(' + taskId + '); $(\'#contextMenu\').remove();">' +
            '<i class="bi bi-eye"></i> Просмотреть</div>';

        if (window.currentUserRole === 'Администратор' || window.currentUserRole === 'Техник') {
            menuHtml += '<div class="context-menu-divider"></div>' +
                '<div class="context-menu-item" onclick="currentTaskId=' + taskId + '; closeCurrentTask(); $(\'#contextMenu\').remove();">' +
                '<i class="bi bi-check-circle"></i> Закрыть</div>';
        }

        menuHtml += '<div class="context-menu-divider"></div>' +
            '<div class="context-menu-item text-danger" onclick="$(\'#contextMenu\').remove();">' +
            '<i class="bi bi-x-circle"></i> Отмена</div></div>';

        $('body').append(menuHtml);

        var $menu = $('#contextMenu');
        var mw = $menu.outerWidth(), mh = $menu.outerHeight();
        var ww = $(window).width(), wh = $(window).height();
        var left = event.pageX, top = event.pageY;
        if (left + mw > ww) left = ww - mw - 10;
        if (top + mh > wh) top = wh - mh - 10;
        if (left < 0) left = 10;
        if (top < 0) top = 10;
        $menu.css({ left: left + 'px', top: top + 'px' });
    }

    // ============= ОБРАБОТЧИКИ =============
    function setupEventHandlers() {
        $('#filterWorkType, #filterCabinet, #filterStatus, #filterUser')
            .on('change', function() { loadTasks(1); });

        $(document).on('input', '#taskSearchInput', function() {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function() { loadTasks(1); }, 400);
        });

        $(document).on('change', '#selectAll', function() {
            var isChecked = $(this).prop('checked');
            $('.task-checkbox').each(function() {
                $(this).prop('checked', isChecked);
                if (isChecked) state.selectedTasks.add($(this).val().toString());
                else state.selectedTasks.delete($(this).val().toString());
            });
        });

        $(document).on('click', function(event) {
            if ($('#contextMenu').length && !$(event.target).closest('#contextMenu').length) {
                $('#contextMenu').remove();
            }
        });

        $(window).on('scroll', function() { $('#contextMenu').remove(); });
        $(document).on('keydown', function(event) {
            if (event.key === 'Escape') $('#contextMenu').remove();
        });
    }

    function setupContextMenu() {
        $(document).on('contextmenu', '.task-row', function(event) {
            event.preventDefault();
            return false;
        });
    }

    // ============= ФОРМА СОЗДАНИЯ =============
    function loadCabinetsForForm() {
        fetch('/api/cabinets')
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                var $s = $('#cabinetSelect');
                $s.empty().append('<option value="">Выберите кабинет</option>');
                (cabinets || []).forEach(function(c) {
                    var label = c.cabinet_number + (c.description ? ' - ' + c.description : '');
                    $s.append('<option value="' + utils.escapeHtml(c.cabinet_number) + '">' + utils.escapeHtml(label) + '</option>');
                });
            });
    }

    function loadExecutorsForForm() {
        fetch('/api/executors')
            .then(function(r) { return r.json(); })
            .then(function(executors) {
                var $e = $('#executorSelect');
                var $a = $('#assistantSelect');
                $e.empty().append('<option value="">Выберите исполнителя</option>');
                $a.empty().append('<option value="">Выберите помощника</option>');
                (executors || []).forEach(function(x) {
                    var label = x.full_name + ' (' + x.role + ')';
                    $e.append('<option value="' + utils.escapeHtml(x.full_name) + '">' + utils.escapeHtml(label) + '</option>');
                    $a.append('<option value="' + utils.escapeHtml(x.full_name) + '">' + utils.escapeHtml(label) + '</option>');
                });
            });
    }

    function loadProblemTypesForForm() {
        fetch('/api/directory/problem-types')
            .then(function(r) { return r.json(); })
            .then(function(types) {
                var $s = $('select[name="work_type"]');
                $s.empty().append('<option value="">Выберите тип работы</option>');
                if (types && !types.error) {
                    types.forEach(function(t) {
                        if (t.is_active) $s.append('<option value="' + utils.escapeHtml(t.name) + '">' + utils.escapeHtml(t.name) + '</option>');
                    });
                }
            });
    }

    function showCreateTaskModal() {
        var form = document.getElementById('createTaskForm');
        if (form) form.reset();

        loadCabinetsForForm();
        loadProblemTypesForForm();

        fetch('/api/current_user')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.full_name) {
                    $('input[name="from_user"]').val(data.full_name);
                }
                if (data.role === 'Пользователь') {
                    $('select[name="executor"]').closest('.col-md-6').hide();
                    $('select[name="assistant"]').closest('.col-md-6').hide();
                    $('select[name="executor"]').val('');
                    $('select[name="assistant"]').val('');
                } else {
                    $('select[name="executor"]').closest('.col-md-6').show();
                    $('select[name="assistant"]').closest('.col-md-6').show();
                    loadExecutorsForForm();
                }
            });

        var now = new Date();
        var tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var dt = tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' +
                 pad(tomorrow.getDate()) + 'T' + pad(tomorrow.getHours()) + ':' + pad(tomorrow.getMinutes());
        $('input[name="deadline"]').val(dt);

        $('#createTaskModal').modal('show');
    }

    function setupCabinetSearch() {
        $('#cabinetSelect').on('input', function() {
            var t = $(this).val();
            if (t && t.length >= 1) searchCabinetsFromAPI(t);
            else loadCabinetsForForm();
        });
    }

    function searchCabinetsFromAPI(query) {
        fetch('/api/cabinets/search?q=' + encodeURIComponent(query))
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                var $s = $('#cabinetSelect');
                var cur = $s.val();
                $s.empty().append('<option value="">Выберите кабинет</option>');
                (cabinets || []).forEach(function(c) {
                    var label = c.cabinet_number + (c.description ? ' - ' + c.description : '');
                    $s.append('<option value="' + utils.escapeHtml(c.cabinet_number) + '">' + utils.escapeHtml(label) + '</option>');
                });
                if (cur) $s.val(cur);
            });
    }

    // ============= ОБНОВЛЕНИЕ ВСЕГО =============
    function refreshData() {
        if (typeof loadUserInfo === 'function') loadUserInfo();
        loadStatistics();
        loadTasks(state.currentPage || 1);
        if (window.App.Notifications && window.App.Notifications.loadUnreadCount) {
            window.App.Notifications.loadUnreadCount();
        }
    }

    // ============= ЭКСПОРТ =============
    api.loadStatistics = loadStatistics;
    api.loadFilters = loadFilters;
    api.loadTasks = loadTasks;
    api.refreshData = refreshData;
    api.clearFilters = clearFilters;
    api.createTask = createTask;
    api.closeSelectedTasks = closeSelectedTasks;
    api.toggleTaskSelection = toggleTaskSelection;
    api.handleContextMenu = handleContextMenu;
    api.setupEventHandlers = setupEventHandlers;
    api.setupContextMenu = setupContextMenu;
    api.setupCabinetSearch = setupCabinetSearch;
    api.showCreateTaskModal = showCreateTaskModal;

    // Совместимость со старым кодом (inline onclick из HTML)
    window.loadStatistics = loadStatistics;
    window.loadFilters = loadFilters;
    window.loadTasks = loadTasks;
    window.refreshData = refreshData;
    window.clearFilters = clearFilters;
    window.createTask = createTask;
    window.closeSelectedTasks = closeSelectedTasks;
    window.toggleTaskSelection = toggleTaskSelection;
    window.handleContextMenu = handleContextMenu;
    window.setupEventHandlers = setupEventHandlers;
    window.setupContextMenu = setupContextMenu;
    window.setupCabinetSearch = setupCabinetSearch;
    window.showCreateTaskModal = showCreateTaskModal;

    console.log('[tasks] Загружено');
})();