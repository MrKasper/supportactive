// static/js/main.js
// Инициализация приложения, навигация, роли

(function() {
    'use strict';

    if (!window.App) {
        console.error('[main] App не инициализирован');
        return;
    }

    var api = window.App.register('Main');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============= ИНИЦИАЛИЗАЦИЯ =============
    function init() {
        console.log('=== Support Active System v' + window.App.version + ' ===');

        if (typeof jQuery === 'undefined') {
            console.error('[main] jQuery не загружен');
            return;
        }

        // 1. Тема — сразу, чтобы не было мигания
        if (window.App.Theme) window.App.Theme.init();

        // 2. Горячие клавиши — до авторизации (палитра и справка доступны сразу)
        if (window.App.Hotkeys) window.App.Hotkeys.init();

        // 3. Мобильный UX (FAB, свайпы, PTR) — включается только на мобильных
        if (window.App.MobileUX) window.App.MobileUX.init();

        // 4. Проверка авторизации и загрузка данных
        checkAuthAndInit();

        // 5. Динамическая аватарка при вводе ФИО в форме создания пользователя
        $('#editFullName').on('input', function() {
            var fullName = $(this).val();
            var editMode = $('#editUserForm').data('edit-mode');

            if (editMode === 'create' && fullName && fullName.trim().length > 0) {
                var initials = fullName.trim().charAt(0).toUpperCase();
                var colorIndex = fullName.trim().length % utils.avatarColors.length;

                $('#editUserAvatar').css({
                    'background-image': 'none',
                    'background-color': utils.avatarColors[colorIndex],
                    'color': 'white'
                }).html('<span style="font-size:40px;">' + utils.escapeHtml(initials) + '</span>');

                if (typeof updateAvatarSelectorForName === 'function') {
                    updateAvatarSelectorForName(fullName.trim());
                }
            }
        });
    }

    // ============= ПРОВЕРКА АВТОРИЗАЦИИ И СТАРТ =============
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

                state.currentUserId = data.id;
                window.currentUserRole = data.role;
                window.currentUserFullName = data.full_name;

                console.log('[main] Пользователь:', data.full_name, '| Роль:', data.role);

                // Настраиваем интерфейс под роль
                setupInterfaceByRole(data.role);

                // Загружаем начальные данные
                loadInitialData();
            })
            .catch(function(error) {
                console.error('[main] Auth check failed:', error);
                window.location.href = '/login';
            });
    }

    // ============= ЗАГРУЗКА НАЧАЛЬНЫХ ДАННЫХ =============
    function loadInitialData() {
        // Информация о пользователе
        if (window.App.Auth) {
            window.App.Auth.loadUserInfo();
        }

        // Заявки
        if (window.App.Tasks) {
            window.App.Tasks.loadStatistics();
            window.App.Tasks.loadFilters();
            window.App.Tasks.loadTasks(1);
            window.App.Tasks.setupEventHandlers();
            window.App.Tasks.setupContextMenu();
            window.App.Tasks.setupCabinetSearch();
        }

        // Уведомления
        if (window.App.Notifications) {
            window.App.Notifications.loadUnreadCount();
            window.App.Notifications.startPolling();
        }

        // Web Push
        if (window.App.WebPush) {
            window.App.WebPush.initButton();
            window.App.WebPush.maybeOffer();
        }

        // Обновляем FAB (после того как интерфейс настроен по роли)
        if (window.App.MobileUX && window.App.MobileUX.updateFABVisibility) {
            window.App.MobileUX.updateFABVisibility();
        }

        console.log('[main] Приложение инициализировано');
    }

    // ============= НАСТРОЙКА ИНТЕРФЕЙСА ПО РОЛИ =============
    function setupInterfaceByRole(role) {
        console.log('[main] setupInterfaceByRole:', role);

        if (role === 'Техник') {
            // Скрываем модули
            $('.sidebar .nav-link[data-page="users"]').hide();
            $('.sidebar .nav-link[data-page="directory"]').hide();
            $('.sidebar .nav-link[data-page="report"]').hide();
            $('.sidebar .nav-link[data-page="audit"]').hide();

            // Скрываем кнопки
            $('#tasksBlock .btn-danger').hide();
            $('#tasksBlock .btn-success').hide();

            // Фильтр «Пользователь» — не имеет смысла
            $('#filterUserBlock').hide();

            // Статистика — только «мои»
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

            // Скрываем всю статистику
            $('.user-card .col-md-6').hide();

            // Скрываем фильтры
            $('.filters-section').hide();

            // Создать заявку — единственная доступная кнопка
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
            $('#userCreateTaskBtn').hide();
        }
    }

    // ============= НАВИГАЦИЯ =============
    function loadPage(pageName) {
        console.log('[main] loadPage:', pageName);

        // Подсветка пункта меню
        $('.sidebar .nav-link').removeClass('active');
        $('.sidebar .nav-link[data-page="' + pageName + '"]').addClass('active');

        // Обновление мобильной навигации
        $('.mobile-bottom-nav .nav-item').removeClass('active');
        var mobileMap = { tasks: 0, users: 1, cartridges: 2, licenses: 3 };
        if (typeof mobileMap[pageName] === 'number') {
            $('.mobile-bottom-nav .nav-item').eq(mobileMap[pageName]).addClass('active');
        }

        // Уведомляем MobileUX о смене страницы (пересчёт FAB)
        if (window.App.MobileUX && window.App.MobileUX.onPageChange) {
            setTimeout(function() { window.App.MobileUX.onPageChange(pageName); }, 100);
        }

        // Закрываем открытые свайп-строки
        if (window.App.MobileUX && window.App.MobileUX.closeAllSwipeRows) {
            window.App.MobileUX.closeAllSwipeRows();
        }

        // Заявки — отдельный блок
        if (pageName === 'tasks') {
            $('#tasksBlock').show();
            $('#otherPagesBlock').hide();
            if (window.App.Tasks) window.App.Tasks.loadTasks(1);
            return;
        }

        // Остальные страницы — в otherPagesBlock
        $('#tasksBlock').hide();
        $('#otherPagesBlock').show();

        var moduleMap = {
            'users':            window.App.Users,
            'cartridges':       window.App.Cartridges,
            'licenses':         window.App.Licenses,
            'contacts':         window.App.Contacts,
            'directory':        window.App.Directory,
            'cabinets-manage':  window.App.CabinetsManage,
            'report':           window.App.Reports,
            'audit':            window.App.Audit
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

    // ============= ОБНОВЛЕНИЕ =============
    function refreshData() {
        if (window.App.Auth) {
            window.App.Auth.loadUserInfo();
        }
        if (window.App.Tasks) {
            window.App.Tasks.loadStatistics();
            window.App.Tasks.loadTasks(state.currentPage || 1);
        }
        if (window.App.Notifications) {
            window.App.Notifications.loadUnreadCount();
        }
    }

    // ============= ПУБЛИЧНЫЙ API =============
    api.init = init;
    api.loadPage = loadPage;
    api.refreshData = refreshData;
    api.setupInterfaceByRole = setupInterfaceByRole;

    // Совместимость с inline onclick
    window.loadPage = loadPage;
    window.refreshData = refreshData;

    // ============= ЗАПУСК =============
    $(document).ready(function() {
        init();
    });

    console.log('[main] Загружено');
})();