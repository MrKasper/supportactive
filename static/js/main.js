// static/js/main.js
// Инициализация приложения, навигация, роли

(function() {
    'use strict';

    if (!window.App) {
        console.error('[main] App не инициализирован');
        return;
    }

    // ⚠️ НЕ называем переменную 'api' — она забивает App.api.
    var mod = window.App.register('Main');
    var api = window.App.api || {};
    var utils = window.App.utils;
    var state = window.App.state;

    // Проверка: api.js должен быть загружен до main.js
    if (typeof api.get !== 'function') {
        console.error(
            '[main] App.api не загружен. Убедитесь, что api.js ' +
            'подключён в base.html ПЕРЕД модулями.'
        );
        return;
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    function init() {
        console.log('=== Support Active System v' + window.App.version + ' ===');

        if (typeof jQuery === 'undefined') {
            console.error('[main] jQuery не загружен');
            return;
        }

        // 1. Тема
        if (window.App.Theme) window.App.Theme.init();

        // 2. Горячие клавиши
        if (window.App.Hotkeys) window.App.Hotkeys.init();

        // 3. Мобильный UX
        if (window.App.MobileUX) window.App.MobileUX.init();

        // 4. Авторизация + данные
        checkAuthAndInit();

        // 5. Динамическая аватарка
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

                setupInterfaceByRole(data.role);
                loadInitialData();
            })
            .catch(function(error) {
                console.error('[main] Auth check failed:', error);
                // НЕ редиректим, если ошибка сетевая — иначе цикл
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

        if (window.App.Tasks) {
            if (window.App.Tasks.loadStatistics) window.App.Tasks.loadStatistics();
            if (window.App.Tasks.loadFilters) window.App.Tasks.loadFilters();
            if (window.App.Tasks.loadTasks) window.App.Tasks.loadTasks(1);
            if (window.App.Tasks.setupEventHandlers) window.App.Tasks.setupEventHandlers();
            if (window.App.Tasks.setupContextMenu) window.App.Tasks.setupContextMenu();
            if (window.App.Tasks.setupCabinetSearch) window.App.Tasks.setupCabinetSearch();
        }

        if (window.App.Notifications && window.App.Notifications.loadUnreadCount) {
            window.App.Notifications.loadUnreadCount();
        }

        if (window.App.NotificationsSSE && window.ENABLE_SSE !== false) {
            if (window.App.NotificationsSSE.connect) {
                window.App.NotificationsSSE.connect();
            }
        } else if (window.App.Notifications && window.App.Notifications.startPolling) {
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

        if (role === 'Техник') {
            $('.sidebar .nav-link[data-page="users"]').hide();
            $('.sidebar .nav-link[data-page="directory"]').hide();
            $('.sidebar .nav-link[data-page="report"]').hide();
            $('.sidebar .nav-link[data-page="audit"]').hide();
            $('.sidebar .nav-link[data-page="dashboard"]').hide();

            $('#tasksBlock .btn-danger').hide();
            $('#tasksBlock .btn-success').hide();
            $('#filterUserBlock').hide();

            $('#statMyCompleted').closest('.col-3').hide();
            $('.user-card .col-md-6 .col-3').removeClass('col-3').addClass('col-4');

        } else if (role === 'Пользователь') {
            $('.sidebar .nav-link[data-page="users"]').hide();
            $('.sidebar .nav-link[data-page="cartridges"]').hide();
            $('.sidebar .nav-link[data-page="licenses"]').hide();
            $('.sidebar .nav-link[data-page="contacts"]').hide();
            $('.sidebar .nav-link[data-page="directory"]').hide();
            $('.sidebar .nav-link[data-page="cabinets-manage"]').hide();
            $('.sidebar .nav-link[data-page="report"]').hide();
            $('.sidebar .nav-link[data-page="audit"]').hide();
            $('.sidebar .nav-link[data-page="dashboard"]').hide();

            $('.user-card .col-md-6').hide();
            $('.filters-section').hide();

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
            $('#userCreateTaskBtn').hide();
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
            $('#tasksBlock').show();
            $('#otherPagesBlock').hide();
            if (window.App.Tasks && window.App.Tasks.loadTasks) {
                window.App.Tasks.loadTasks(1);
            }
            return;
        }

        $('#tasksBlock').hide();
        $('#otherPagesBlock').show();

        var moduleMap = {
            'users': window.App.Users,
            'cartridges': window.App.Cartridges,
            'licenses': window.App.Licenses,
            'contacts': window.App.Contacts,
            'directory': window.App.Directory,
            'cabinets-manage': window.App.CabinetsManage,
            'report': window.App.Reports,
            'audit': window.App.Audit,
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
        if (window.App.Tasks) {
            if (window.App.Tasks.loadStatistics) window.App.Tasks.loadStatistics();
            if (window.App.Tasks.loadTasks) {
                window.App.Tasks.loadTasks(state.currentPage || 1);
            }
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

    // ============================================================
    // ЗАПУСК
    // ============================================================
    $(document).ready(function() {
        init();
    });

    console.log('[main] Загружено');
})();