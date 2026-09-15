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
                $('#statCompleted').closest('.stats-card').find('.stats-label').text('Мои выполнено');
                $('#statNewProgress').closest('.stats-card').find('.stats-label').text('Мои в работе');
                $('#statTotal').closest('.stats-card').find('.stats-label').text('Мои всего');
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

    var params = new URLSearchParams();
    var role = window.currentUserRole;

    console.log('loadTasks called - role:', role, 'currentUserId:', currentUserId);

    if (role === 'Техник') {
        // 🆕 Берём ФИО из глобальной переменной (устанавливается до вызова loadTasks)
        var userName = window.currentUserFullName || $('#userName').text().trim();
        if (userName && userName !== 'Неизвестно') {
            params.append('user', userName);
        }

        // Применяем фильтры из интерфейса для техника
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
    } else if (role === 'Пользователь') {
        if (currentUserId) {
            params.append('created_by', currentUserId);
        }
    } else {
        // Администратор
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

    console.log('Fetching tasks with params:', params.toString());

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

    // Определяем подсветку строки
    var rowStyle = '';
    var rowClass = '';
    var deadlineHtml = '';

    if (task.status !== 'Выполнено' && task.status !== 'Отменено' && task.deadline) {
        var deadlineDate = new Date(task.deadline.replace(' ', 'T'));
        var now = new Date();
        var diffMs = deadlineDate - now;
        var diffHours = diffMs / (1000 * 60 * 60);

        if (diffMs < 0) {
            // Просрочена - красный
            rowClass = 'table-danger';
            rowStyle = 'background-color: #f8d7da !important;';
            deadlineHtml = '<span class="badge bg-danger">Просрочена</span> ' + formatDate(task.deadline);
        } else if (diffHours < 24) {
            // Менее 24 часов - желтый
            rowClass = 'table-warning';
            rowStyle = 'background-color: #fff3cd !important;';
            deadlineHtml = '<span class="badge bg-warning text-dark">Скоро</span> ' + formatDate(task.deadline);
        } else {
            deadlineHtml = formatDate(task.deadline);
        }
    } else {
        deadlineHtml = formatDate(task.deadline);
    }

    var row = '<tr class="task-row ' + rowClass + '" style="' + rowStyle + '" data-task-id="' + task.id + '" onclick="viewTask(' + task.id + ')" oncontextmenu="handleContextMenu(event, ' + task.id + '); return false;">';

    // Чекбокс только для администратора
    if (window.currentUserRole === 'Администратор') {
        row += '<td onclick="event.stopPropagation()"><input type="checkbox" class="task-checkbox" value="' + task.id + '" onchange="toggleTaskSelection(' + task.id + ', this.checked)"></td>';
    }

    row += '<td>' + formatDate(task.created_date) + '</td>' +
        '<td>' + deadlineHtml + '</td>' +
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
    var canTake = false;

    // 🔧 ИСПРАВЛЕНО: логика для кнопки "Взять в работу"
    // - Администратор: может взять любую новую заявку
    // - Техник: может взять, если он назначен исполнителем ИЛИ исполнитель не назначен
    if (task.status === 'Новое') {
        if (window.currentUserRole === 'Администратор') {
            canTake = true;
        } else if (window.currentUserRole === 'Техник') {
            var currentName = window.currentUserFullName || '';
            if (!task.executor || task.executor === currentName) {
                canTake = true;
            }
        }
    }

    // Для пользователя скрываем кнопки
    if (window.currentUserRole === 'Пользователь') {
        canClose = false;
        canTake = false;
    }

    var html = '<div class="row">' +
        '<div class="col-md-6">' +
        '<p><strong>Дата создания:</strong> ' + formatDate(task.created_date) + '</p>';

    // Срок с подсветкой
    if (task.status !== 'Выполнено' && task.status !== 'Отменено' && task.deadline) {
        var deadlineDate = new Date(task.deadline.replace(' ', 'T'));
        var now = new Date();
        if (deadlineDate < now) {
            html += '<p><strong>Срок:</strong> <span class="text-danger fw-bold">' + formatDate(task.deadline) + ' (Просрочена)</span></p>';
        } else if ((deadlineDate - now) / (1000 * 60 * 60) < 24) {
            html += '<p><strong>Срок:</strong> <span class="text-warning fw-bold">' + formatDate(task.deadline) + ' (Скоро истекает)</span></p>';
        } else {
            html += '<p><strong>Срок:</strong> ' + formatDate(task.deadline) + '</p>';
        }
    } else {
        html += '<p><strong>Срок:</strong> ' + formatDate(task.deadline) + '</p>';
    }

    html += '<p><strong>От кого:</strong> ' + (task.from_user || 'Не указано') + '</p>' +
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

    $(document).on('change', '#selectAll', function() {
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
    loadProblemTypesForForm();

    // Автоматически заполняем поле "От кого" ФИО текущего пользователя
    fetch('/api/current_user')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data && data.full_name) {
                $('input[name="from_user"]').val(data.full_name);
            }

            // Для роли "Пользователь" скрываем выбор исполнителя и помощника
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