// static/js/main.js
// Инициализация приложения, навигация, роли.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[main] App не инициализирован');
        return;
    }

    var mod = window.App.register('Main');
    var api = window.App.api || {};
    var utils = window.App.utils;
    var state = window.App.state;

    if (typeof api.get !== 'function') {
        console.error(
            '[main] App.api не загружен. Убедитесь, что api.js ' +
            'подключён в base.html ПЕРЕД модулями.'
        );
        return;
    }

    // ============================================================
    // МАППИНГ РОЛЕЙ
    // ============================================================
    var ROLE_CODE = {
        'Администратор': 'admin',
        'Техник':        'tech',
        'Пользователь':  'user',
        'Разработчик':   'dev',
    };

    // Кто видит кнопку «Создать заявку» в шапке user-card.
    // Техник НЕ МОЖЕТ создавать заявки — он исполнитель.
    // Пользователь создаёт заявки через свою кнопку над таблицей.
    var CAN_CREATE_TASK = {
        'Администратор': true,
        'Техник':        false,
        'Пользователь':  false,
        'Разработчик':   false,
    };

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    function init() {
        console.log('=== Support Active System v' + window.App.version + ' ===');

        if (typeof jQuery === 'undefined') {
            console.error('[main] jQuery не загружен');
            return;
        }

        if (window.App.Theme) window.App.Theme.init();
        if (window.App.Hotkeys) window.App.Hotkeys.init();
        if (window.App.MobileUX) window.App.MobileUX.init();

        checkAuthAndInit();

        $('#editFullName').on('input', function() {
            var fullName = $(this).val();
            var editMode = $('#editUserForm').data('edit-mode');
            if (editMode === 'create' && fullName && fullName.trim().length > 0) {
                var initials = fullName.trim().charAt(0).toUpperCase();
                var colorIndex = fullName.trim().length % utils.avatarColors.length;
                $('#editUserAvatar').css({
                    'background-image': 'none',
                    'background-color': utils.avatarColors[colorIndex],
                    'color': 'white',
                }).html('<span style="font-size:40px;">' +
                    utils.escapeHtml(initials) + '</span>');
            }
        });
    }

    // ============================================================
    // ПРОВЕРКА АВТОРИЗАЦИИ
    // ============================================================
    function checkAuthAndInit() {
        api.get('/api/current_user')
            .then(function(data) {
                if (!data || data.error) {
                    window.location.href = '/login';
                    return;
                }

                state.currentUserId = data.id;
                window.currentUserRole = data.role;
                window.currentUserFullName = data.full_name;

                console.log(
                    '[main] Пользователь:', data.full_name,
                    '| Роль:', data.role
                );

                if (data.role === 'Разработчик') {
                    window.location.href = '/dev';
                    return;
                }

                setupInterfaceByRole(data.role);
                loadInitialData();
            })
            .catch(function(error) {
                console.error('[main] Auth check failed:', error);
                if (error && (error.status === 401 || !error.status)) {
                    window.location.href = '/login';
                }
            });
    }

    // ============================================================
    // ЗАГРУЗКА НАЧАЛЬНЫХ ДАННЫХ
    // ============================================================
    function loadInitialData() {
        if (window.App.Auth && window.App.Auth.loadUserInfo) {
            window.App.Auth.loadUserInfo();
        }

        var role = window.currentUserRole;

        if (window.App.Tasks && window.App.Tasks.loadStatistics) {
            window.App.Tasks.loadStatistics();
        }

        // Для Техника данные Kanban уже загружены внутри setupInterfaceByRole
        if (role !== 'Техник') {
            if (window.App.Tasks) {
                if (window.App.Tasks.loadFilters) window.App.Tasks.loadFilters();
                if (window.App.Tasks.loadTasks) window.App.Tasks.loadTasks(1);
                if (window.App.Tasks.setupEventHandlers) {
                    window.App.Tasks.setupEventHandlers();
                }
                if (window.App.Tasks.setupContextMenu) {
                    window.App.Tasks.setupContextMenu();
                }
                if (window.App.Tasks.setupCabinetSearch) {
                    window.App.Tasks.setupCabinetSearch();
                }
            }
        }

        if (window.App.Notifications && window.App.Notifications.loadUnreadCount) {
            window.App.Notifications.loadUnreadCount();
        }

        if (window.App.NotificationsSSE && window.ENABLE_SSE !== false) {
            if (window.App.NotificationsSSE.connect) {
                window.App.NotificationsSSE.connect();
            }
        } else if (window.App.Notifications &&
                   window.App.Notifications.startPolling) {
            window.App.Notifications.startPolling();
        }

        if (window.App.WebPush) {
            if (window.App.WebPush.initButton) window.App.WebPush.initButton();
            if (window.App.WebPush.maybeOffer) window.App.WebPush.maybeOffer();
        }

        if (window.App.MobileUX && window.App.MobileUX.updateFABVisibility) {
            window.App.MobileUX.updateFABVisibility();
        }

        console.log('[main] Приложение инициализировано');
    }

    // ============================================================
    // ИНТЕРФЕЙС ПО РОЛИ
    // ============================================================
    function setupInterfaceByRole(role) {
        console.log('[main] setupInterfaceByRole:', role);

        function applyRoleVisibility() {
            var code = ROLE_CODE[role] || role;
            $('.sidebar .nav-link[data-role]').each(function() {
                var allowed = ($(this).attr('data-role') || '').split(',');
                var show = allowed.indexOf(code) !== -1;
                $(this).toggle(show);
            });
        }

        function removeKanbanToolbar() {
            $('#tasksToolbar').remove();
            $('#kanbanFiltersPanel').remove();
        }

        // ---------- Кнопка «Создать заявку» в шапке ----------
        // Видна только тем, кому разрешено создавать (по факту — только Админу)
        if (CAN_CREATE_TASK[role]) {
            $('#headerCreateTaskBtn').show();
        } else {
            $('#headerCreateTaskBtn').hide();
        }

        if (role === 'Техник') {
            applyRoleVisibility();

            $('#tasksBlock').hide();
            $('#kanbanBlock').show();

            if (window.App.TasksKanban && window.App.TasksKanban.init) {
                window.App.TasksKanban.init();
            }

            // Техник не создаёт заявки — скрываем все кнопки создания
            $('#tasksBlock .btn-danger').hide();
            $('#tasksBlock .btn-success').hide();
            $('#filterUserBlock').hide();

            $('#statMyCompleted').closest('.col-3').hide();
            $('.user-card .col-md-6 .col-3')
                .removeClass('col-3').addClass('col-4');

        } else if (role === 'Пользователь') {
            applyRoleVisibility();
            removeKanbanToolbar();

            $('#kanbanBlock').hide();
            $('#tasksBlock').show();
            $('.user-card .col-md-6').hide();
            $('.filters-section').hide();

            // У Пользователя — своя кнопка над таблицей
            if ($('#userCreateTaskBtn').length === 0) {
                $('.table-container').before(
                    '<div id="userCreateTaskBtn" class="mb-3">' +
                    '<button class="btn btn-success" ' +
                    'onclick="showCreateTaskModal()">' +
                    '<i class="bi bi-plus-circle"></i> Создать заявку' +
                    '</button></div>'
                );
            }
            $('#userCreateTaskBtn').show();

        } else if (role === 'Администратор') {
            $('.sidebar .nav-link').show();
            removeKanbanToolbar();

            $('#kanbanBlock').hide();
            $('#tasksBlock').show();
            $('#userCreateTaskBtn').hide();

        } else if (role === 'Разработчик') {
            applyRoleVisibility();
            removeKanbanToolbar();

            $('#kanbanBlock').hide();
            $('#tasksBlock').hide();
            $('.filters-section .btn-success').hide();
            $('#userCreateTaskBtn').hide();
            $('.user-card .col-md-6').hide();

        } else {
            applyRoleVisibility();
            removeKanbanToolbar();

            $('#kanbanBlock').hide();
            $('#tasksBlock').show();
        }
    }

    // ============================================================
    // НАВИГАЦИЯ
    // ============================================================
    function loadPage(pageName) {
        console.log('[main] loadPage:', pageName);

        if (pageName === 'dashboard') {
            window.location.href = '/dashboard';
            return;
        }
        if (pageName === 'dev-console') {
            window.location.href = '/dev';
            return;
        }
        if (pageName === 'audit') {
            window.location.href = '/audit';
            return;
        }

        $('.sidebar .nav-link').removeClass('active');
        $('.sidebar .nav-link[data-page="' + pageName + '"]').addClass('active');

        $('.mobile-bottom-nav .nav-item').removeClass('active');
        var mobileMap = { tasks: 0, users: 1, cartridges: 2, licenses: 3 };
        if (typeof mobileMap[pageName] === 'number') {
            $('.mobile-bottom-nav .nav-item')
                .eq(mobileMap[pageName]).addClass('active');
        }

        if (window.App.MobileUX && window.App.MobileUX.onPageChange) {
            setTimeout(function() {
                window.App.MobileUX.onPageChange(pageName);
            }, 100);
        }
        if (window.App.MobileUX && window.App.MobileUX.closeAllSwipeRows) {
            window.App.MobileUX.closeAllSwipeRows();
        }

        if (pageName === 'tasks') {
            var role = window.currentUserRole;

            if (role === 'Техник') {
                $('#tasksBlock').hide();
                $('#kanbanBlock').show();
                $('#otherPagesBlock').hide();

                if ($('#tasksToolbar').length === 0 &&
                    window.App.TasksKanban &&
                    window.App.TasksKanban.init) {
                    window.App.TasksKanban.init();
                } else if (window.App.TasksKanban &&
                           window.App.TasksKanban.load) {
                    window.App.TasksKanban.load();
                }
            } else {
                $('#kanbanBlock').hide();
                $('#tasksBlock').show();
                $('#otherPagesBlock').hide();
                if (window.App.Tasks && window.App.Tasks.loadTasks) {
                    window.App.Tasks.loadTasks(1);
                }
            }
            return;
        }

        $('#tasksBlock').hide();
        $('#kanbanBlock').hide();
        $('#otherPagesBlock').show();

        var moduleMap = {
            'users': window.App.Users,
            'cartridges': window.App.Cartridges,
            'licenses': window.App.Licenses,
            'contacts': window.App.Contacts,
            'directory': window.App.Directory,
            'cabinets-manage': window.App.CabinetsManage,
            'report': window.App.Reports,
        };

        var module = moduleMap[pageName];
        if (module && typeof module.load === 'function') {
            module.load();
        } else {
            $('#otherPagesBlock').html(
                '<div class="text-center py-5">' +
                '<div class="alert alert-warning">Страница не найдена</div>' +
                '</div>'
            );
        }
    }

    // ============================================================
    // ОБНОВЛЕНИЕ
    // ============================================================
    function refreshData() {
        if (window.App.Auth && window.App.Auth.loadUserInfo) {
            window.App.Auth.loadUserInfo();
        }
        if (window.App.Tasks && window.App.Tasks.loadStatistics) {
            window.App.Tasks.loadStatistics();
        }

        var role = window.currentUserRole;
        if (role === 'Техник' &&
            window.App.TasksKanban &&
            window.App.TasksKanban.load) {
            window.App.TasksKanban.load();
        } else if (window.App.Tasks && window.App.Tasks.loadTasks) {
            window.App.Tasks.loadTasks(state.currentPage || 1);
        }

        if (window.App.Notifications && window.App.Notifications.loadUnreadCount) {
            window.App.Notifications.loadUnreadCount();
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.init = init;
    mod.loadPage = loadPage;
    mod.refreshData = refreshData;
    mod.setupInterfaceByRole = setupInterfaceByRole;

    window.loadPage = loadPage;
    window.refreshData = refreshData;

    $(document).ready(function() {
        init();
    });

    console.log('[main] Загружено');
})();