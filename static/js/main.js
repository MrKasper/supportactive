// static/js/main.js

// Глобальная переменная объявлена в database.js:
// currentUserId

// ============= ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =============
$(document).ready(function() {
    console.log('=== Support Active System Initialization ===');

    if (typeof jQuery === 'undefined') {
        console.error('jQuery is not loaded!');
        return;
    }

    // Проверяем авторизацию
    checkAuthAndInit();

    // Обновление аватарки при вводе ФИО
    $('#editFullName').on('input', function() {
        var fullName = $(this).val();
        var editMode = $('#editUserForm').data('edit-mode');

        if (editMode === 'create' && fullName && fullName.trim().length > 0) {
            var initials = fullName.trim().charAt(0).toUpperCase();
            var colorIndex = fullName.trim().length % avatarColors.length;

            $('#editUserAvatar').css({
                'background-image': 'none',
                'background-color': avatarColors[colorIndex],
                'color': 'white'
            }).html('<span style="font-size:40px;">' + initials + '</span>');

            if (typeof updateAvatarSelectorForName === 'function') {
                updateAvatarSelectorForName(fullName.trim());
            }
        }
    });
});

function checkAuthAndInit() {
    fetch('/api/current_user')
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(data) {
            if (!data || data.error) {
                window.location.href = '/login';
                return;
            }

            currentUserId = data.id;

            // Устанавливаем роль ДО всего
            window.currentUserRole = data.role;
            window.currentUserFullName = data.full_name;  // 🆕 надёжный источник ФИО
            console.log('Current user role set to:', window.currentUserRole);
            console.log('Current user name set to:', window.currentUserFullName);

            // Настраиваем интерфейс в зависимости от роли
            setupInterfaceByRole(data.role);

            // Загружаем данные
            if (typeof loadUserInfo === 'function') loadUserInfo();
            if (typeof loadStatistics === 'function') loadStatistics();
            if (typeof loadFilters === 'function') loadFilters();
            if (typeof loadTasks === 'function') loadTasks();
            if (typeof loadUnreadCount === 'function') loadUnreadCount();
            if (typeof setupEventHandlers === 'function') setupEventHandlers();
            if (typeof setupContextMenu === 'function') setupContextMenu();
            if (typeof setupCabinetSearch === 'function') setupCabinetSearch();

            console.log('Application initialized successfully');
        })
        .catch(function(error) {
            console.error('Auth check failed:', error);
            window.location.href = '/login';
        });
}

// ============= НАСТРОЙКА ИНТЕРФЕЙСА ПО РОЛИ =============
function setupInterfaceByRole(role) {
    console.log('Setting up interface for role:', role);

    if (role === 'Техник') {
        // Скрываем модули для техника
        $('.sidebar .nav-link[data-page="users"]').hide();
        $('.sidebar .nav-link[data-page="directory"]').hide();
        $('.sidebar .nav-link[data-page="report"]').hide();

        // Скрываем кнопки
        $('#tasksBlock .btn-danger').hide(); // Закрыть заявки
        $('#tasksBlock .btn-success').hide(); // Создать заявку

        // Скрываем фильтр "Пользователь"
        $('#filterUser').closest('.col-md-2').hide();

        // Скрываем блок "Мои заявки" в статистике
        $('#statMyCompleted').closest('.col-3').hide();

        // Перераспределяем оставшиеся 3 блока статистики
        $('.user-card .col-md-6 .col-3').removeClass('col-3').addClass('col-4');

    } else if (role === 'Пользователь') {
        // Скрываем все модули кроме заявок
        $('.sidebar .nav-link[data-page="users"]').hide();
        $('.sidebar .nav-link[data-page="cartridges"]').hide();
        $('.sidebar .nav-link[data-page="licenses"]').hide();
        $('.sidebar .nav-link[data-page="contacts"]').hide();
        $('.sidebar .nav-link[data-page="directory"]').hide();
        $('.sidebar .nav-link[data-page="cabinets-manage"]').hide();
        $('.sidebar .nav-link[data-page="report"]').hide();

        // Скрываем статистику
        $('.user-card .col-md-6').hide();

        // Скрываем фильтры
        $('.filters-section').hide();

        // Скрываем кнопки "Закрыть заявки" и "Обновить"
        $('.filters-section .btn-danger').hide();
        $('.filters-section .btn-primary').hide();

        // Показываем кнопку "Создать заявку" отдельно над таблицей
        if ($('#userCreateTaskBtn').length === 0) {
            $('.table-container').before(
                '<div id="userCreateTaskBtn" class="mb-3">' +
                '<button class="btn btn-success" onclick="showCreateTaskModal()">' +
                '<i class="bi bi-plus-circle"></i> Создать заявку' +
                '</button>' +
                '</div>'
            );
        }
        $('#userCreateTaskBtn').show();

    } else if (role === 'Администратор') {
        // Скрываем кнопку для пользователя, если она была создана
        $('#userCreateTaskBtn').hide();
    }
}

// ============= ЗАГРУЗКА ИНФОРМАЦИИ О ПОЛЬЗОВАТЕЛЕ =============
function loadUserInfo() {
    fetch('/api/current_user')
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(data) {
            if (!data) return;
            if (data.error) {
                window.location.href = '/login';
                return;
            }

            currentUserId = data.id;
            window.currentUserFullName = data.full_name;  // 🆕 дублируем для надёжности

            var userName = data.full_name || 'Неизвестно';
            var userRole = data.role || '';
            var userAvatar = userName.charAt(0).toUpperCase();

            $('#userName').text(userName);
            $('#userRole').text(userRole);
            $('#userAvatar').text(userAvatar);

            if (data.avatar && data.avatar.indexOf('uploads/') === 0) {
                $('#userAvatar').css({
                    'background-image': 'url(/' + data.avatar + ')',
                    'background-size': 'cover',
                    'background-position': 'center',
                    'color': 'transparent'
                });
            } else {
                $('#userAvatar').css({
                    'background-image': 'none',
                    'background': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    'color': 'white'
                });
            }
        })
        .catch(function(error) {
            console.error('Error loading user info:', error);
        });
}

function showUserCard() {
    fetch('/api/current_user').then(function(r) { return r.json(); }).then(function(data) {
        var avatarHtml = '';
        if (data.avatar && data.avatar.indexOf('uploads/') === 0) {
            avatarHtml = '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px;background-image:url(/' + data.avatar + ');background-size:cover;background-position:center;color:transparent">' + (data.full_name||'?').charAt(0) + '</div>';
        } else {
            avatarHtml = '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px">' + (data.full_name||'?').charAt(0) + '</div>';
        }

        Swal.fire({
            title: 'Карточка пользователя',
            html: '<div class="text-center">' + avatarHtml + '<h4>' + data.full_name + '</h4><p>' + data.role + '</p><hr><p><i class="bi bi-building"></i> ' + (data.department||'-') + '</p><p><i class="bi bi-envelope"></i> ' + (data.email||'-') + '</p><p><i class="bi bi-phone"></i> ' + (data.phone||'-') + '</p></div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: data.role === 'Администратор',
            cancelButtonText: '<i class="bi bi-pencil-square"></i> Редактировать',
            cancelButtonColor: '#28a745'
        })
        .then(function(result) {
            if (result.dismiss === Swal.DismissReason.cancel && typeof editUserProfile === 'function') {
                editUserProfile();
            }
        });
    });
}

function changeUser() {
    Swal.fire({ title: 'Сменить пользователя?', icon: 'question', showCancelButton: true, confirmButtonText: 'Да' })
        .then(function(result) { if (result.isConfirmed) window.location.href = '/logout'; });
}

// ============= НАВИГАЦИЯ ПО СТРАНИЦАМ =============
function loadPage(pageName) {
    console.log('Loading page:', pageName);

    $('.sidebar .nav-link').removeClass('active');
    $('.sidebar .nav-link[data-page="' + pageName + '"]').addClass('active');

    if (pageName === 'tasks') {
        $('#tasksBlock').show();
        $('#otherPagesBlock').hide();
        if (typeof loadTasks === 'function') loadTasks();
    } else {
        $('#tasksBlock').hide();
        $('#otherPagesBlock').show();

        if (pageName === 'users' && typeof loadUsersPage === 'function') {
            loadUsersPage();
        } else if (pageName === 'cartridges' && typeof loadCartridgesPage === 'function') {
            loadCartridgesPage();
        } else if (pageName === 'licenses' && typeof loadLicensesPage === 'function') {
            loadLicensesPage();
        } else if (pageName === 'contacts' && typeof loadContactsPage === 'function') {
            loadContactsPage();
        } else if (pageName === 'directory' && typeof loadDirectoryPage === 'function') {
            loadDirectoryPage();
        } else if (pageName === 'cabinets-manage' && typeof loadCabinetsManagePage === 'function') {
            loadCabinetsManagePage();
        } else if (pageName === 'report' && typeof loadReportPage === 'function') {
            loadReportPage();
        } else {
            var $contentBlock = $('#otherPagesBlock');
            $contentBlock.html('<div class="text-center py-5"><div class="alert alert-warning">Страница не найдена</div></div>');
        }
    }
}

// ============= ОБЩИЕ ФУНКЦИИ =============
function refreshData() {
    if (typeof loadUserInfo === 'function') loadUserInfo();
    if (typeof loadStatistics === 'function') loadStatistics();
    if (typeof loadTasks === 'function') loadTasks();
    if (typeof loadUnreadCount === 'function') loadUnreadCount();
}

console.log('Main module loaded');