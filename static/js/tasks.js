// static/js/tasks.js

// Глобальные переменные объявлены в database.js:
// currentTaskId, selectedTasks

// ============= ЗАГРУЗКА СТАТИСТИКИ =============
function loadStatistics() {
    // Для пользователя статистика не загружается
    if (window.currentUserRole === 'Пользователь') {
        return;
    }

    fetch('/api/statistics')
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(data) {
            if (!data || data.error) return;

            // Для техника показываем только его статистику
            if (window.currentUserRole === 'Техник') {
                animateNumber('#statCompleted', data.user_completed || 0);
                animateNumber('#statNewProgress', data.user_in_progress || 0);
                animateNumber('#statTotal', data.user_total || 0);
                // Меняем подписи
                $('#statCompleted').closest('.stats-card').find('.stats-label').text('Выполнено');
                $('#statNewProgress').closest('.stats-card').find('.stats-label').text('В работе');
                $('#statTotal').closest('.stats-card').find('.stats-label').text('Всего');
            } else {
                animateNumber('#statCompleted', data.completed || 0);
                animateNumber('#statNewProgress', data.new_or_progress || 0);
                animateNumber('#statTotal', data.total || 0);
                animateNumber('#statMyCompleted', data.user_total || 0);
            }
        })
        .catch(function(error) {
            console.error('Error loading statistics:', error);
        });
}

// ============= ЗАГРУЗКА ФИЛЬТРОВ =============
function loadFilters() {
    // Для пользователя фильтры не загружаются
    if (window.currentUserRole === 'Пользователь') {
        return;
    }

    fetch('/api/filters')
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(data) {
            if (!data || data.error) return;

            var $workTypeFilter = $('#filterWorkType');
            $workTypeFilter.empty().append('<option value="">Все типы работ</option>');
            if (data.work_types) {
                data.work_types.forEach(function(type) {
                    $workTypeFilter.append('<option value="' + type + '">' + type + '</option>');
                });
            }

            var $cabinetFilter = $('#filterCabinet');
            $cabinetFilter.empty().append('<option value="">Все кабинеты</option>');
            if (data.cabinets) {
                data.cabinets.forEach(function(cabinet) {
                    $cabinetFilter.append('<option value="' + cabinet + '">' + cabinet + '</option>');
                });
            }

            var $statusFilter = $('#filterStatus');
            $statusFilter.empty().append('<option value="">Все статусы</option>');
            if (data.statuses) {
                data.statuses.forEach(function(status) {
                    $statusFilter.append('<option value="' + status + '">' + status + '</option>');
                });
            }

            // Фильтр пользователей только для администратора
            if (window.currentUserRole === 'Администратор') {
                var $userFilter = $('#filterUser');
                $userFilter.empty().append('<option value="">Все пользователи</option>');
                if (data.users) {
                    data.users.forEach(function(user) {
                        $userFilter.append('<option value="' + user + '">' + user + '</option>');
                    });
                }
            }
        })
        .catch(function(error) {
            console.error('Error loading filters:', error);
        });
}

// ============= ЗАГРУЗКА СПИСКА ЗАЯВОК =============
function loadTasks() {
    showLoadingIndicator();

    // Если роль не установлена, пробуем определить её из интерфейса
    if (!window.currentUserRole) {
        var roleText = $('#userRole').text().trim();
        if (roleText === 'Техник') window.currentUserRole = 'Техник';
        else if (roleText === 'Пользователь') window.currentUserRole = 'Пользователь';
        else window.currentUserRole = 'Администратор';
        console.log('Role determined from UI:', window.currentUserRole);
    }

    var params = new URLSearchParams();
    var role = window.currentUserRole;

    console.log('loadTasks - final role:', role);

if (role === 'Техник') {
    // Всегда фильтруем по имени техника
    var userName = $('#userName').text().trim();
    if (userName && userName !== 'Неизвестно') {
        params.append('user', userName);
    }

    // Применяем фильтры из интерфейса
    var workType = $('#filterWorkType').val();
    var cabinet = $('#filterCabinet').val();
    var status = $('#filterStatus').val();
    var filterDate = $('#filterDate').val();

    if (workType) params.append('work_type', workType);
    if (cabinet) params.append('cabinet', cabinet);
    if (status) params.append('status', status);
    if (filterDate) {
        params.append('date_from', filterDate + ' 00:00:00');
        params.append('date_to', filterDate + ' 23:59:59');
    }
}
    else if (role === 'Пользователь') {
        console.log('Filtering for user ID:', currentUserId);
        if (currentUserId) {
            params.append('created_by', currentUserId);
        }
    } else {
        console.log('Admin mode - using UI filters');
        var workType = $('#filterWorkType').val();
        var cabinet = $('#filterCabinet').val();
        var status = $('#filterStatus').val();
        var user = $('#filterUser').val();
        var filterDate = $('#filterDate').val();

        if (workType) params.append('work_type', workType);
        if (cabinet) params.append('cabinet', cabinet);
        if (status) params.append('status', status);
        if (user) params.append('user', user);
        if (filterDate) {
            params.append('date_from', filterDate + ' 00:00:00');
            params.append('date_to', filterDate + ' 23:59:59');
        }
    }

    console.log('Final params:', params.toString());

    fetch('/api/tasks?' + params.toString())
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(tasks) {
            if (!tasks) return;
            if (tasks.error) {
                showErrorInTable(tasks.error);
                return;
            }
            console.log('Received tasks count:', tasks.length);
            renderTasksTable(tasks);
        })
        .catch(function(error) {
            console.error('Error loading tasks:', error);
            showErrorInTable('Не удалось загрузить заявки.');
        });
}

function showLoadingIndicator() {
    var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
    $('#tasksTableBody').html(
        '<tr><td colspan="' + colSpan + '" class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2 text-muted">Загрузка заявок...</p></td></tr>'
    );
}

function showErrorInTable(message) {
    var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
    $('#tasksTableBody').html(
        '<tr><td colspan="' + colSpan + '" class="text-center py-5 text-danger">' +
        '<i class="bi bi-exclamation-triangle" style="font-size: 3rem;"></i>' +
        '<p class="mt-2">' + message + '</p>' +
        '<button class="btn btn-sm btn-primary mt-2" onclick="loadTasks()">Попробовать снова</button></td></tr>'
    );
}

function renderTasksTable(tasks) {
    var tbody = $('#tasksTableBody');
    tbody.empty();

    // Обновляем заголовки таблицы
    updateTableHeaders();

    if (!tasks || tasks.length === 0) {
        var colSpan = (window.currentUserRole === 'Администратор') ? 11 : 10;
        tbody.append(
            '<tr><td colspan="' + colSpan + '" class="text-center py-5">' +
            '<i class="bi bi-inbox" style="font-size: 3rem; color: #ccc;"></i>' +
            '<p class="text-muted mt-2">Нет заявок</p>' +
            '</td></tr>'
        );
        return;
    }

    tasks.forEach(function(task) {
        tbody.append(createTaskRow(task));
    });
}

function updateTableHeaders() {
    var thead = $('.table-container table thead tr');

    if (window.currentUserRole === 'Администратор') {
        thead.html(
            '<th><input type="checkbox" id="selectAll"></th>' +
            '<th>Дата создания</th>' +
            '<th>Срок</th>' +
            '<th>От кого</th>' +
            '<th>Кабинет</th>' +
            '<th>Описание работы</th>' +
            '<th>Тип работы</th>' +
            '<th>Статус</th>' +
            '<th>Приоритет</th>' +
            '<th>Исполнитель</th>' +
            '<th>Помощник</th>'
        );
    } else {
        thead.html(
            '<th>Дата создания</th>' +
            '<th>Срок</th>' +
            '<th>От кого</th>' +
            '<th>Кабинет</th>' +
            '<th>Описание работы</th>' +
            '<th>Тип работы</th>' +
            '<th>Статус</th>' +
            '<th>Приоритет</th>' +
            '<th>Исполнитель</th>' +
            '<th>Помощник</th>'
        );
    }
}

function createTaskRow(task) {
    var statusClass = getStatusClass(task.status);
    var priorityClass = getPriorityClass(task.priority);

    var row = '<tr class="task-row" data-task-id="' + task.id + '" onclick="viewTask(' + task.id + ')" oncontextmenu="handleContextMenu(event, ' + task.id + '); return false;">';

    // Чекбокс только для администратора
    if (window.currentUserRole === 'Администратор') {
        row += '<td onclick="event.stopPropagation()"><input type="checkbox" class="task-checkbox" value="' + task.id + '" onchange="toggleTaskSelection(' + task.id + ', this.checked)"></td>';
    }

    row += '<td>' + formatDate(task.created_date) + '</td>' +
        '<td>' + formatDate(task.deadline) + '</td>' +
        '<td>' + (task.from_user || '-') + '</td>' +
        '<td>' + (task.cabinet || '-') + '</td>' +
        '<td title="' + escapeHtml(task.description || '') + '">' + truncateText(task.description, 40) + '</td>' +
        '<td><span class="badge bg-secondary">' + (task.work_type || 'Не указан') + '</span></td>' +
        '<td><span class="status-badge ' + statusClass + '">' + (task.status || 'Новое') + '</span></td>' +
        '<td><span class="' + priorityClass + '"><i class="bi bi-flag-fill"></i> ' + (task.priority || 'Средний') + '</span></td>' +
        '<td>' + (task.executor || '<span class="text-muted">Не назначен</span>') + '</td>' +
        '<td>' + (task.assistant || '<span class="text-muted">Не назначен</span>') + '</td>';

    row += '</tr>';

    return row;
}

function clearFilters() {
    $('#filterWorkType, #filterCabinet, #filterStatus, #filterUser, #filterDate').val('');
    loadTasks();
}

// ============= ФУНКЦИИ ДЛЯ РАБОТЫ С ЗАЯВКАМИ =============
function viewTask(taskId) {
    currentTaskId = taskId;
    $('#taskNumber').text(taskId);
    $('#taskDetails').html('<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Загрузка...</p></div>');
    $('#viewTaskModal').modal('show');

    fetch('/api/task/' + taskId)
        .then(function(response) { return response.json(); })
        .then(function(task) {
            if (task.error) { showErrorMessage(task.error); $('#viewTaskModal').modal('hide'); return; }
            displayTaskDetails(task);
        })
        .catch(function() { showErrorMessage('Не удалось загрузить заявку'); $('#viewTaskModal').modal('hide'); });
}

function displayTaskDetails(task) {
    var statusClass = getStatusClass(task.status);
    var canClose = task.status !== 'Выполнено' && task.status !== 'Отменено';
    var canTake = task.status === 'Новое';

    // Для пользователя скрываем кнопки
    if (window.currentUserRole === 'Пользователь') {
        canClose = false;
        canTake = false;
    }

    var html = '<div class="row">' +
        '<div class="col-md-6">' +
        '<p><strong>Дата создания:</strong> ' + formatDate(task.created_date) + '</p>' +
        '<p><strong>Срок:</strong> ' + formatDate(task.deadline) + '</p>' +
        '<p><strong>От кого:</strong> ' + (task.from_user || 'Не указано') + '</p>' +
        '<p><strong>Кабинет:</strong> ' + (task.cabinet || 'Не указан') + '</p></div>' +
        '<div class="col-md-6">' +
        '<p><strong>Статус:</strong> <span class="status-badge ' + statusClass + '">' + task.status + '</span></p>' +
        '<p><strong>Тип работы:</strong> ' + (task.work_type || 'Не указан') + '</p>' +
        '<p><strong>Приоритет:</strong> ' + (task.priority || 'Средний') + '</p>' +
        '<p><strong>Исполнитель:</strong> ' + (task.executor || 'Не назначен') + '</p>' +
        '<p><strong>Помощник:</strong> ' + (task.assistant || 'Не назначен') + '</p></div>' +
        '<div class="col-12"><hr><h6>Описание:</h6><div class="p-3 bg-light rounded">' + (task.description || 'Нет описания') + '</div></div>';
    if (task.completed_date) html += '<div class="col-12 mt-3"><p class="text-success"><strong>Выполнено:</strong> ' + formatDate(task.completed_date) + '</p></div>';
    html += '</div>';

    $('#taskDetails').html(html);

    // Показываем/скрываем кнопки
    $('#btnCloseTask').toggle(canClose);
    $('#btnTakeTask').toggle(canTake);
}

function createTask() {
    var form = document.getElementById('createTaskForm');
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var formData = new FormData(form);
    var data = {};
    formData.forEach(function(value, key) { data[key] = value; });

    Swal.fire({ title: 'Создание...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

    fetch('/api/create_task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function(response) { return response.json(); })
        .then(function(result) {
            if (result.success) {
                $('#createTaskModal').modal('hide');
                Swal.fire({ icon: 'success', title: 'Заявка создана!', text: 'Номер: ' + result.task_id, timer: 2000, showConfirmButton: false });
                refreshData();
            } else {
                Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
            }
        })
        .catch(function() { Swal.fire({ icon: 'error', title: 'Ошибка', text: 'Не удалось создать заявку' }); });
}

function closeCurrentTask() {
    if (!currentTaskId) return;
    Swal.fire({ title: 'Закрыть заявку?', text: 'Заявка №' + currentTaskId, icon: 'question', showCancelButton: true, confirmButtonText: 'Да', cancelButtonText: 'Нет' })
        .then(function(result) { if (result.isConfirmed) executeCloseTask(currentTaskId); });
}

function executeCloseTask(taskId) {
    fetch('/api/close_task/' + taskId, { method: 'POST' })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                $('#viewTaskModal').modal('hide');
                Swal.fire({ icon: 'success', title: 'Заявка закрыта!', timer: 1500, showConfirmButton: false });
                refreshData();
            } else { showErrorMessage(data.error); }
        });
}

function takeTask() {
    if (!currentTaskId) return;

    Swal.fire({
        title: 'Взять заявку в работу?',
        text: 'Заявка №' + currentTaskId + ' будет переведена в статус "В работе"',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, взять в работу',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#0d6efd'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/task/' + currentTaskId + '/take', {
                method: 'POST'
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    $('#viewTaskModal').modal('hide');
                    Swal.fire({
                        icon: 'success',
                        title: 'Заявка взята в работу!',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    refreshData();
                } else {
                    showErrorMessage(data.error);
                }
            })
            .catch(function() {
                showErrorMessage('Не удалось взять заявку в работу');
            });
        }
    });
}

function closeSelectedTasks() {
    if (selectedTasks.size === 0) { Swal.fire({ icon: 'info', title: 'Не выбраны заявки' }); return; }
    Swal.fire({ title: 'Закрыть заявки?', text: 'Выбрано: ' + selectedTasks.size, icon: 'question', showCancelButton: true, confirmButtonText: 'Да' })
        .then(function(result) { if (result.isConfirmed) executeCloseMultipleTasks(); });
}

function executeCloseMultipleTasks() {
    var promises = Array.from(selectedTasks).map(function(taskId) { return fetch('/api/close_task/' + taskId, { method: 'POST' }).then(function(r) { return r.json(); }); });
    Promise.all(promises).then(function() {
        selectedTasks.clear();
        $('#selectAll').prop('checked', false);
        Swal.fire({ icon: 'success', title: 'Заявки закрыты!', timer: 1500, showConfirmButton: false });
        refreshData();
    });
}

function toggleTaskSelection(taskId, isChecked) {
    if (isChecked) selectedTasks.add(taskId.toString());
    else { selectedTasks.delete(taskId.toString()); $('#selectAll').prop('checked', false); }
}

// ============= КОНТЕКСТНОЕ МЕНЮ =============
function handleContextMenu(event, taskId) {
    event.preventDefault();
    event.stopPropagation();
    $('#contextMenu').remove();

    var menuHtml = '<div id="contextMenu" class="context-menu" style="left: ' + event.pageX + 'px; top: ' + event.pageY + 'px;">' +
        '<div class="context-menu-item" onclick="viewTask(' + taskId + '); $(\'#contextMenu\').remove();"><i class="bi bi-eye"></i> Просмотреть</div>';

    // Кнопка "Закрыть" только для админа и техника
    if (window.currentUserRole === 'Администратор' || window.currentUserRole === 'Техник') {
        menuHtml += '<div class="context-menu-divider"></div>' +
            '<div class="context-menu-item" onclick="currentTaskId=' + taskId + '; closeCurrentTask(); $(\'#contextMenu\').remove();"><i class="bi bi-check-circle"></i> Закрыть</div>';
    }

    menuHtml += '<div class="context-menu-divider"></div>' +
        '<div class="context-menu-item text-danger" onclick="$(\'#contextMenu\').remove();"><i class="bi bi-x-circle"></i> Отмена</div></div>';

    $('body').append(menuHtml);

    var $menu = $('#contextMenu');
    var menuWidth = $menu.outerWidth();
    var menuHeight = $menu.outerHeight();
    var windowWidth = $(window).width();
    var windowHeight = $(window).height();
    var left = event.pageX, top = event.pageY;
    if (left + menuWidth > windowWidth) left = windowWidth - menuWidth - 10;
    if (top + menuHeight > windowHeight) top = windowHeight - menuHeight - 10;
    if (left < 0) left = 10;
    if (top < 0) top = 10;
    $menu.css({ left: left + 'px', top: top + 'px' });
}

// ============= ОБРАБОТЧИКИ СОБЫТИЙ =============
function setupEventHandlers() {
    $('#filterWorkType, #filterCabinet, #filterStatus, #filterUser').on('change', function() { loadTasks(); });

    $('#selectAll').on('change', function() {
        var isChecked = $(this).prop('checked');
        $('.task-checkbox').each(function() {
            $(this).prop('checked', isChecked);
            if (isChecked) selectedTasks.add($(this).val().toString());
            else selectedTasks.delete($(this).val().toString());
        });
    });

    $(document).on('click', function(event) {
        if ($('#contextMenu').length && !$(event.target).closest('#contextMenu').length) {
            $('#contextMenu').remove();
        }
    });

    $(window).on('scroll', function() { $('#contextMenu').remove(); });
    $(document).on('keydown', function(event) { if (event.key === 'Escape') $('#contextMenu').remove(); });
}

function setupContextMenu() {
    $(document).on('contextmenu', '.task-row', function(event) { event.preventDefault(); return false; });
}

// ============= ЗАГРУЗКА ДАННЫХ ДЛЯ ФОРМ =============
function loadCabinetsForForm() {
    fetch('/api/cabinets')
        .then(function(response) { return response.json(); })
        .then(function(cabinets) {
            var $select = $('#cabinetSelect');
            $select.empty().append('<option value="">Выберите кабинет</option>');
            cabinets.forEach(function(cabinet) {
                var label = cabinet.cabinet_number + (cabinet.description ? ' - ' + cabinet.description : '');
                $select.append('<option value="' + cabinet.cabinet_number + '">' + label + '</option>');
            });
        });
}

function loadExecutorsForForm() {
    fetch('/api/executors')
        .then(function(response) { return response.json(); })
        .then(function(executors) {
            var $executorSelect = $('#executorSelect');
            $executorSelect.empty().append('<option value="">Выберите исполнителя</option>');
            var $assistantSelect = $('#assistantSelect');
            $assistantSelect.empty().append('<option value="">Выберите помощника</option>');

            executors.forEach(function(executor) {
                var label = executor.full_name + ' (' + executor.role + ')';
                $executorSelect.append('<option value="' + executor.full_name + '">' + label + '</option>');
                $assistantSelect.append('<option value="' + executor.full_name + '">' + label + '</option>');
            });
        });
}

function loadProblemTypesForForm() {
    fetch('/api/directory/problem-types')
        .then(function(response) { return response.json(); })
        .then(function(types) {
            var $workTypeSelect = $('select[name="work_type"]');
            $workTypeSelect.empty();
            $workTypeSelect.append('<option value="">Выберите тип работы</option>');

            if (types && !types.error) {
                types.forEach(function(type) {
                    if (type.is_active) {
                        $workTypeSelect.append('<option value="' + type.name + '">' + type.name + '</option>');
                    }
                });
            }
        })
        .catch(function(error) {
            console.error('Error loading problem types:', error);
        });
}

function showCreateTaskModal() {
    var form = document.getElementById('createTaskForm');
    if (form) form.reset();

    loadCabinetsForForm();
    loadExecutorsForForm();
    loadProblemTypesForForm();

    // Автоматически заполняем поле "От кого" ФИО текущего пользователя
    fetch('/api/current_user')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.full_name) {
                $('input[name="from_user"]').val(data.full_name);
            }
        })
        .catch(function(error) {
            console.error('Error loading user info for form:', error);
        });

    var now = new Date();
    var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    var tomorrowStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0') + 'T' + String(tomorrow.getHours()).padStart(2, '0') + ':' + String(tomorrow.getMinutes()).padStart(2, '0');
    $('input[name="deadline"]').val(tomorrowStr);

    $('#createTaskModal').modal('show');
}

function setupCabinetSearch() {
    $('#cabinetSelect').on('input', function() {
        var searchText = $(this).val();
        if (searchText && searchText.length >= 1) {
            searchCabinetsFromAPI(searchText);
        } else {
            loadCabinetsForForm();
        }
    });
}

function searchCabinetsFromAPI(query) {
    fetch('/api/cabinets/search?q=' + encodeURIComponent(query))
        .then(function(response) { return response.json(); })
        .then(function(cabinets) {
            var $select = $('#cabinetSelect');
            var currentValue = $select.val();
            $select.empty().append('<option value="">Выберите кабинет</option>');
            cabinets.forEach(function(cabinet) {
                var label = cabinet.cabinet_number + (cabinet.description ? ' - ' + cabinet.description : '');
                $select.append('<option value="' + cabinet.cabinet_number + '">' + label + '</option>');
            });
            if (currentValue) $select.val(currentValue);
        });
}

console.log('Tasks module loaded');