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

    var ROLE_CODE = {
        'Администратор': 'admin',
        'Техник':        'tech',
        'Пользователь':  'user',
        'Разработчик':   'dev',
    };

    // ============================================================
    // ЗАГОЛОВКИ СТРАНИЦ (topbar)
    // ============================================================
    var PAGE_TITLES = {
        'tasks':           'Заявки',
        'cabinets-manage': 'Кабинеты',
        'cartridges':      'Картриджи',
        'licenses':        'Лицензии',
        'users':           'Пользователи',
        'contacts':        'Внешние контакты',
        'directory':       'Справочник',
        'tags':            'Теги',
        'schedules':       'Расписания',
        'maintenance':     'Календарь ТО',
        'inventory':       'Инвентаризация',
        'tasks-calendar':  'Календарь заявок',
        'report':          'Конструктор отчётов',
    };

    function setTopbarTitle(pageName) {
        var t = PAGE_TITLES[pageName] || 'Support Active';
        $('#topbarTitleText').text(t);
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

        if (window.App.Theme) window.App.Theme.init();
        if (window.App.Hotkeys) window.App.Hotkeys.init();
        if (window.App.MobileUX) window.App.MobileUX.init();

        checkAuthAndInit();
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

        if (window.App.Tasks) {
            if (window.App.Tasks.loadStatistics) window.App.Tasks.loadStatistics();
            if (window.App.Tasks.loadFilters) window.App.Tasks.loadFilters();
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

        // Применяем сохранённый режим просмотра (таблица / канбан).
        // Если сохранён kanban — TasksKanban перерисует доску.
        var mode = 'table';
        try { mode = localStorage.getItem('supportactive_view') || 'table'; } catch (e) {}
        var role = window.currentUserRole;

        if (mode === 'kanban' && role !== 'Пользователь'
            && window.App.TasksKanban
            && typeof window.App.TasksKanban.switchView === 'function') {
            window.App.TasksKanban.switchView('kanban');
        } else {
            // Таблица
            $('#adminKanbanBlock').hide();
            $('#tableView').show();
            if (window.App.Tasks && window.App.Tasks.loadTasks) {
                window.App.Tasks.loadTasks(1);
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

        // Общая часть: показываем #tasksBlock, скрываем канбан-доску и другие
        $('#otherPagesBlock').hide();
        $('#adminKanbanBlock').hide();
        $('#tableView').show();
        $('#tasksBlock').show();

        if (role === 'Техник') {
            applyRoleVisibility();

            // Техник не создаёт заявки — скрываем кнопку и FAB
            $('#createTaskBtn').hide();
            $('#muxFab').hide();
            $('.filters-section .btn-success').hide();

            // Техник не делает массовые операции — скрываем bulk-bar
            $('#bulkBar').hide();

            // У Техника нет фильтра по пользователю
            $('#filterUserBlock').hide();

            // В статистике скрываем 4-й блок «Мои» — он не имеет смысла,
            // у Техника все его показатели уже «мои»
            $('.user-stats .stat-box').eq(3).hide();

        } else if (role === 'Пользователь') {
            applyRoleVisibility();

            // Пользователь не пользуется канбаном
            $('#viewSwitcher').hide();

            // Скрываем фильтры и bulk-bar, показывает только свои заявки
            $('.filters-section').hide();
            $('#filtersPanel').hide();
            $('#bulkBar').hide();

            // Кнопка «Создать заявку» — оставляем (Пользователь может)
            $('#createTaskBtn').show();

        } else if (role === 'Администратор') {
            $('.sidebar .nav-link').show();
            $('#createTaskBtn').show();

        } else if (role === 'Разработчик') {
            applyRoleVisibility();
            $('#createTaskBtn').hide();
            $('#muxFab').hide();

        } else {
            applyRoleVisibility();
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

        // Обновляем заголовок topbar
        setTopbarTitle(pageName);

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

        // ---------- Заявки ----------
        if (pageName === 'tasks') {
            $('#otherPagesBlock').hide();
            $('#tasksBlock').show();

            // Применяем сохранённый режим
            var mode = 'table';
            try { mode = localStorage.getItem('supportactive_view') || 'table'; } catch (e) {}

            if (mode === 'kanban'
                && window.currentUserRole !== 'Пользователь'
                && window.App.TasksKanban
                && typeof window.App.TasksKanban.switchView === 'function') {
                window.App.TasksKanban.switchView('kanban');
            } else {
                $('#adminKanbanBlock').hide();
                $('#tableView').show();
                if (window.App.Tasks && window.App.Tasks.loadTasks) {
                    window.App.Tasks.loadTasks(1);
                }
            }
            return;
        }

        // ---------- Остальные разделы ----------
        $('#tasksBlock').hide();
        $('#adminKanbanBlock').hide();
        $('#otherPagesBlock').show();

        var moduleMap = {
            'users': window.App.Users,
            'cartridges': window.App.Cartridges,
            'licenses': window.App.Licenses,
            'contacts': window.App.Contacts,
            'directory': window.App.Directory,
            'cabinets-manage': window.App.CabinetsManage,
            'report': window.App.Reports,
            'tags': window.App.Tags,
            'schedules': window.App.Schedules,
            'maintenance': window.App.Maintenance,
            'inventory': window.App.Inventory,
            'tasks-calendar': window.App.TasksCalendar,
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

        // Что перезагружать — таблицу или канбан
        var mode = 'table';
        try { mode = localStorage.getItem('supportactive_view') || 'table'; } catch (e) {}

        if (mode === 'kanban'
            && window.currentUserRole !== 'Пользователь'
            && window.App.TasksKanban
            && typeof window.App.TasksKanban.switchView === 'function') {
            window.App.TasksKanban.switchView('kanban');
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
    mod.setTopbarTitle = setTopbarTitle;

    window.loadPage = loadPage;
    window.refreshData = refreshData;
    window.setTopbarTitle = setTopbarTitle;

    $(document).ready(function() {
        init();
    });

    console.log('[main] Загружено');
})();