// static/js/hotkeys.js
// Горячие клавиши + расширенная командная палитра.
//
// Палитра (Ctrl+K) содержит:
//   • Команды (навигация + действия) — статичные
//   • Живой поиск по заявкам (/api/tasks?search=)
//   • Живой поиск по пользователям (/api/users/search?q=)
//   • Живой поиск по кабинетам (/api/cabinets/search?q=)

(function() {
    'use strict';

    if (!window.App) {
        console.error('[hotkeys] App не инициализирован');
        return;
    }

    var api = window.App.register('Hotkeys');
    var utils = window.App.utils;

    // ============================================================
    // СОСТОЯНИЕ
    // ============================================================
    var commands = [];          // статичные команды
    var dynamicItems = [];      // результаты поиска
    var flatItems = [];         // плоский массив команд + результатов
    var selectedIndex = 0;
    var pendingG = false;
    var pendingGTimer = null;

    var searchTimer = null;
    var searchSeq = 0;          // для игнора устаревших ответов

    // ============================================================
    // ПРАВА
    // ============================================================
    function canCreateTask() {
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Пользователь';
    }

    // ============================================================
    // КОМАНДЫ
    // ============================================================
    function registerCommand(cmd) {
        commands.push(cmd);
    }

    function buildCommands() {
        commands = [];

        // --- Навигация ---
        registerCommand({
            id: 'nav.tasks', kind: 'command',
            title: 'Заявки', subtitle: 'Перейти к заявкам',
            icon: 'bi-list-check', keys: ['G', 'T'],
            action: function() { window.loadPage('tasks'); }
        });
        registerCommand({
            id: 'nav.calendar', kind: 'command',
            title: 'Календарь заявок', subtitle: 'Заявки по дням',
            icon: 'bi-calendar3',
            action: function() { window.loadPage('tasks-calendar'); }
        });
        registerCommand({
            id: 'nav.cabinets', kind: 'command',
            title: 'Кабинеты', subtitle: 'Управление оборудованием',
            icon: 'bi-door-closed',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('cabinets-manage'); }
        });
        registerCommand({
            id: 'nav.cartridges', kind: 'command',
            title: 'Картриджи', subtitle: 'Перейти к картриджам',
            icon: 'bi-printer', keys: ['G', 'C'],
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('cartridges'); }
        });
        registerCommand({
            id: 'nav.licenses', kind: 'command',
            title: 'Лицензии', subtitle: 'Перейти к лицензиям',
            icon: 'bi-key', keys: ['G', 'L'],
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('licenses'); }
        });
        registerCommand({
            id: 'nav.contacts', kind: 'command',
            title: 'Внешние контакты',
            subtitle: 'Поставщики, сервис, партнёры',
            icon: 'bi-person-lines-fill',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('contacts'); }
        });
        registerCommand({
            id: 'nav.directory', kind: 'command',
            title: 'Справочник', subtitle: 'Кабинеты и типы проблем',
            icon: 'bi-book',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('directory'); }
        });
        registerCommand({
            id: 'nav.tags', kind: 'command',
            title: 'Теги', subtitle: 'Управление тегами',
            icon: 'bi-tags',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('tags'); }
        });
        registerCommand({
            id: 'nav.schedules', kind: 'command',
            title: 'Расписания', subtitle: 'Повторяющиеся заявки',
            icon: 'bi-clock-history',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('schedules'); }
        });
        registerCommand({
            id: 'nav.maintenance', kind: 'command',
            title: 'Календарь ТО', subtitle: 'Плановое обслуживание',
            icon: 'bi-calendar-check',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('maintenance'); }
        });
        registerCommand({
            id: 'nav.inventory', kind: 'command',
            title: 'Инвентаризация', subtitle: 'Сессии и позиции',
            icon: 'bi-clipboard-check',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('inventory'); }
        });
        registerCommand({
            id: 'nav.users', kind: 'command',
            title: 'Пользователи',
            subtitle: 'Перейти к пользователям',
            icon: 'bi-people', keys: ['G', 'U'],
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('users'); }
        });
        registerCommand({
            id: 'nav.reports', kind: 'command',
            title: 'Конструктор отчётов',
            subtitle: 'Построить отчёт',
            icon: 'bi-file-text', keys: ['G', 'R'],
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('report'); }
        });
        registerCommand({
            id: 'nav.dashboard', kind: 'command',
            title: 'Дашборд', subtitle: 'Аналитика и KPI',
            icon: 'bi-graph-up',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.location.href = '/dashboard'; }
        });
        registerCommand({
            id: 'nav.audit', kind: 'command',
            title: 'Журнал аудита', subtitle: 'История действий',
            icon: 'bi-journal-text',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.location.href = '/audit'; }
        });

        // --- Действия ---
        registerCommand({
            id: 'action.newTask', kind: 'command',
            title: 'Создать заявку',
            subtitle: 'Открыть форму новой заявки',
            icon: 'bi-plus-circle', keys: ['N'],
            when: function() { return canCreateTask(); },
            action: function() {
                if (typeof showCreateTaskModal === 'function') {
                    showCreateTaskModal();
                }
            }
        });
        registerCommand({
            id: 'action.search', kind: 'command',
            title: 'Поиск заявок',
            subtitle: 'Фокус на поле поиска',
            icon: 'bi-search', keys: ['F'],
            action: function() { focusSearch(); }
        });
        registerCommand({
            id: 'action.refresh', kind: 'command',
            title: 'Обновить данные',
            subtitle: 'Перезагрузить текущий список',
            icon: 'bi-arrow-clockwise', keys: ['R'],
            action: function() {
                if (typeof refreshData === 'function') refreshData();
            }
        });
        registerCommand({
            id: 'action.notifications', kind: 'command',
            title: 'Уведомления',
            subtitle: 'Показать список уведомлений',
            icon: 'bi-bell', keys: ['B'],
            action: function() {
                if (typeof showNotifications === 'function') showNotifications();
            }
        });
        registerCommand({
            id: 'action.theme', kind: 'command',
            title: 'Сменить тему',
            subtitle: 'Светлая / тёмная / авто',
            icon: 'bi-circle-half', keys: ['T'],
            action: function() {
                if (window.App.Theme) window.App.Theme.toggle();
            }
        });
        registerCommand({
            id: 'action.profile', kind: 'command',
            title: 'Мой профиль',
            subtitle: 'Открыть карточку профиля',
            icon: 'bi-person-circle',
            action: function() {
                if (typeof showUserCard === 'function') showUserCard();
            }
        });
        registerCommand({
            id: 'action.logout', kind: 'command',
            title: 'Выйти из системы',
            subtitle: 'Завершить сессию',
            icon: 'bi-box-arrow-right',
            action: function() {
                if (typeof changeUser === 'function') changeUser();
            }
        });

        // --- Помощь ---
        registerCommand({
            id: 'help', kind: 'command',
            title: 'Горячие клавиши',
            subtitle: 'Справка по сочетаниям клавиш',
            icon: 'bi-question-circle', keys: ['?'],
            action: showHelp
        });
    }

    // ============================================================
    // ЖИВОЙ ПОИСК
    // ============================================================
    function scheduleSearch(query) {
        clearTimeout(searchTimer);
        if (!query || query.length < 2) {
            dynamicItems = [];
            return;
        }
        searchTimer = setTimeout(function() {
            runSearch(query);
        }, 250);
    }

    function runSearch(query) {
        var seq = ++searchSeq;
        var q = query;

        var tasksPromise = api.get('/api/tasks?search=' +
            encodeURIComponent(q) + '&per_page=6&page=1')
            .catch(function() { return { items: [] }; });

        var usersPromise = api.get('/api/users/search?q=' +
            encodeURIComponent(q))
            .catch(function() { return []; });

        var cabinetsPromise = api.get('/api/cabinets/search?q=' +
            encodeURIComponent(q))
            .catch(function() { return []; });

        Promise.all([tasksPromise, usersPromise, cabinetsPromise])
            .then(function(results) {
                if (seq !== searchSeq) return;  // устарело

                var items = [];

                var tasks = (results[0] && results[0].items) || [];
                tasks.slice(0, 6).forEach(function(t) {
                    items.push({
                        kind: 'task',
                        id: t.id,
                        title: '#' + t.id + ' ' +
                            utils.truncateText(t.description || '—', 60),
                        subtitle: (t.cabinet || '—') + ' · ' +
                            (t.executor || 'не назначен'),
                        icon: 'bi-clipboard-check',
                        action: function() { viewTask(t.id); },
                    });
                });

                var users = results[1] || [];
                users.slice(0, 5).forEach(function(u) {
                    items.push({
                        kind: 'user',
                        id: u.id,
                        title: u.full_name || u.login,
                        subtitle: (u.role || '') +
                            (u.login ? ' · ' + u.login : ''),
                        icon: 'bi-person-circle',
                        action: function() {
                            if (window.currentUserRole === 'Администратор' &&
                                typeof showUserCardById === 'function') {
                                showUserCardById(u.id);
                            } else {
                                // Просто перейти на страницу пользователей
                                if (typeof loadPage === 'function') {
                                    loadPage('users');
                                }
                            }
                        },
                    });
                });

                var cabinets = results[2] || [];
                cabinets.slice(0, 5).forEach(function(c) {
                    items.push({
                        kind: 'cabinet',
                        id: c.id,
                        title: c.cabinet_number || ('Кабинет #' + c.id),
                        subtitle: [c.description, c.floor, c.building]
                            .filter(Boolean).join(' · '),
                        icon: 'bi-door-closed',
                        action: function() {
                            if (typeof openCabinetDetails === 'function') {
                                openCabinetDetails(c.id);
                            }
                        },
                    });
                });

                dynamicItems = items;
                filterCommands();
            })
            .catch(function() {
                if (seq === searchSeq) {
                    dynamicItems = [];
                    filterCommands();
                }
            });
    }

    // ============================================================
    // ПАЛИТРА
    // ============================================================
    function openPalette() {
        buildCommands();
        selectedIndex = 0;
        dynamicItems = [];
        flatItems = [];

        var overlay = document.getElementById('hkOverlay');
        var input = document.getElementById('hkInput');
        if (!overlay) return;

        input.value = '';
        overlay.classList.add('hk-open');
        filterCommands();
        setTimeout(function() { input.focus(); }, 30);
    }

    function closePalette() {
        var overlay = document.getElementById('hkOverlay');
        if (overlay) overlay.classList.remove('hk-open');
    }

    function filterCommands() {
        var query = ($('#hkInput').val() || '').toLowerCase().trim();

        var filteredCommands = commands.filter(function(cmd) {
            if (cmd.when && !cmd.when()) return false;
            if (!query) return true;
            return cmd.title.toLowerCase().indexOf(query) !== -1
                || (cmd.subtitle || '').toLowerCase().indexOf(query) !== -1
                || cmd.id.toLowerCase().indexOf(query) !== -1;
        });

        flatItems = filteredCommands.concat(dynamicItems);
        selectedIndex = 0;
        renderResults();

        // Запускаем живой поиск (если ввод не похож на команду)
        scheduleSearch(query);
    }

    function renderResults() {
        var $results = $('#hkResults');
        if (!$results.length) return;

        if (flatItems.length === 0) {
            $results.html('<div class="hk-empty-search">' +
                '<i class="bi bi-search" style="font-size:2rem;display:block;opacity:.4;margin-bottom:8px;"></i>' +
                'Ничего не найдено</div>');
            return;
        }

        var html = '';
        var lastKind = null;

        flatItems.forEach(function(item, idx) {
            var kind = item.kind;
            if (kind !== lastKind) {
                var groupTitle = '';
                if (kind === 'command') groupTitle = 'Команды';
                else if (kind === 'task') groupTitle = 'Заявки';
                else if (kind === 'user') groupTitle = 'Пользователи';
                else if (kind === 'cabinet') groupTitle = 'Кабинеты';
                if (groupTitle) {
                    html += '<div class="hk-group-title">' + groupTitle + '</div>';
                }
                lastKind = kind;
            }

            var itemCls = 'hk-item hk-item-' + kind +
                (idx === selectedIndex ? ' hk-active' : '');
            html += '<div class="' + itemCls + '" ' +
                'data-index="' + idx + '" data-cmd-id="' + (item.id || '') + '">';
            html += '<div class="hk-item-icon"><i class="bi ' +
                (item.icon || 'bi-dot') + '"></i></div>';
            html += '<div class="hk-item-body">';
            html += '<div class="hk-item-title">' +
                utils.escapeHtml(item.title) + '</div>';
            if (item.subtitle) {
                html += '<div class="hk-item-subtitle">' +
                    utils.escapeHtml(item.subtitle) + '</div>';
            }
            html += '</div>';

            if (item.keys && item.keys.length) {
                html += '<div class="hk-item-kbd">' +
                    item.keys.map(function(k) {
                        return '<kbd>' + k + '</kbd>';
                    }).join('') +
                    '</div>';
            } else if (kind === 'task') {
                html += '<div class="hk-item-hint">#' + item.id + '</div>';
            }

            html += '</div>';
        });

        $results.html(html);

        $results.find('.hk-item').each(function() {
            var el = this;
            $(el).on('click', function() {
                var idx = parseInt($(el).attr('data-index'), 10);
                executeCommand(idx);
            });
            $(el).on('mouseenter', function() {
                selectedIndex = parseInt($(el).attr('data-index'), 10);
                updateActive();
            });
        });
    }

    function updateActive() {
        $('#hkResults .hk-item').each(function(idx) {
            $(this).toggleClass('hk-active', idx === selectedIndex);
        });
        var active = document.querySelector('#hkResults .hk-item.hk-active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function executeCommand(index) {
        var item = flatItems[index];
        if (!item) return;

        closePalette();
        setTimeout(function() {
            try {
                item.action();
            } catch (e) {
                console.error('[hotkeys] Ошибка команды', item.id, e);
            }
        }, 50);
    }

    // ============================================================
    // СПРАВКА
    // ============================================================
    function showHelp() {
        var html =
            '<div class="hk-help-grid">' +
            '<div class="hk-help-section-title">Навигация</div>' +
            helpRow('Заявки', ['G', 'T']) +
            helpRow('Календарь заявок', []) +
            helpRow('Пользователи', ['G', 'U']) +
            helpRow('Картриджи', ['G', 'C']) +
            helpRow('Лицензии', ['G', 'L']) +
            helpRow('Отчёты', ['G', 'R']) +
            '<div class="hk-help-section-title">Действия</div>' +
            helpRow('Создать заявку', ['N']) +
            helpRow('Поиск', ['F']) +
            helpRow('Обновить', ['R']) +
            helpRow('Уведомления', ['B']) +
            helpRow('Сменить тему', ['T']) +
            helpRow('Профиль', []) +
            helpRow('Выйти', ['Ctrl', 'Q']) +
            '<div class="hk-help-section-title">Общие</div>' +
            helpRow('Командная палитра', ['Ctrl', 'K']) +
            helpRow('Закрыть / Отмена', ['Esc']) +
            helpRow('Эта справка', ['?']) +
            '</div>';

        Swal.fire({
            title: '<i class="bi bi-keyboard"></i> Горячие клавиши',
            html: html,
            confirmButtonText: 'Понятно',
            customClass: { popup: 'swal-wide' }
        });
    }

    function helpRow(label, keys) {
        var keysHtml = (keys || []).map(function(k) {
            return '<kbd>' + k + '</kbd>';
        }).join('');
        return '<div class="hk-help-row">' +
            '<span class="hk-help-label">' + utils.escapeHtml(label) + '</span>' +
            '<span class="hk-help-keys">' + keysHtml + '</span>' +
            '</div>';
    }

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function focusSearch() {
        var $input = $('#taskSearchInput');
        if ($input.length && $input.is(':visible')) {
            $input.focus().select();
        } else {
            window.loadPage('tasks');
            setTimeout(function() { $('#taskSearchInput').focus(); }, 200);
        }
    }

    function isTypingTarget(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isModalOpen() {
        return document.querySelector('.modal-backdrop.open') !== null
            || document.querySelector('.swal2-container') !== null;
    }

    function isPaletteOpen() {
        var overlay = document.getElementById('hkOverlay');
        return overlay && overlay.classList.contains('hk-open');
    }

    // ============================================================
    // ОБРАБОТЧИК КЛАВИШ
    // ============================================================
    function onKeyDown(e) {
        // Ctrl/Cmd+K — открыть/закрыть палитру
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (isPaletteOpen()) closePalette();
            else openPalette();
            return;
        }

        // Внутри открытой палитры
        if (isPaletteOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePalette();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedIndex < flatItems.length - 1) {
                    selectedIndex++;
                    updateActive();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedIndex > 0) {
                    selectedIndex--;
                    updateActive();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                executeCommand(selectedIndex);
            }
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
            e.preventDefault();
            if (typeof changeUser === 'function') changeUser();
            return;
        }

        if (isTypingTarget(e.target)) {
            if (e.key === 'Escape') e.target.blur();
            return;
        }

        if (isModalOpen()) return;

        var key = e.key;
        var lower = key.toLowerCase();

        // Комбинация G + ...
        if (pendingG) {
            pendingG = false;
            if (pendingGTimer) clearTimeout(pendingGTimer);
            handleGCombo(lower);
            e.preventDefault();
            return;
        }

        if (lower === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            pendingG = true;
            pendingGTimer = setTimeout(function() { pendingG = false; }, 1000);
            e.preventDefault();
            return;
        }

        if (e.ctrlKey || e.metaKey || e.altKey) return;

        switch (lower) {
            case 'n':
                if (canCreateTask()) {
                    e.preventDefault();
                    if (typeof showCreateTaskModal === 'function') {
                        showCreateTaskModal();
                    }
                }
                break;
            case 'f':
                e.preventDefault();
                focusSearch();
                break;
            case 'r':
                e.preventDefault();
                if (typeof refreshData === 'function') refreshData();
                break;
            case 'b':
                e.preventDefault();
                if (typeof showNotifications === 'function') showNotifications();
                break;
            case 't':
                e.preventDefault();
                if (window.App.Theme) window.App.Theme.toggle();
                break;
            case '?':
                e.preventDefault();
                showHelp();
                break;
        }
    }

    function handleGCombo(second) {
        switch (second) {
            case 't': window.loadPage('tasks'); break;
            case 'k': window.loadPage('tasks-calendar'); break;
            case 'u':
                if (window.currentUserRole === 'Администратор') {
                    window.loadPage('users');
                }
                break;
            case 'c':
                if (window.currentUserRole !== 'Пользователь') {
                    window.loadPage('cartridges');
                }
                break;
            case 'l':
                if (window.currentUserRole !== 'Пользователь') {
                    window.loadPage('licenses');
                }
                break;
            case 'r':
                if (window.currentUserRole === 'Администратор') {
                    window.loadPage('report');
                }
                break;
        }
    }

    // ============================================================
    // HTML ПАЛИТРЫ
    // ============================================================
    function buildPaletteHtml() {
        if (document.getElementById('hkOverlay')) return;

        var html =
            '<div class="hk-overlay" id="hkOverlay">' +
            '<div class="hk-palette" role="dialog" aria-label="Командная палитра">' +
            '<input type="text" id="hkInput" class="hk-palette-input" ' +
            'placeholder="Команда, заявка, пользователь, кабинет..." ' +
            'autocomplete="off">' +
            '<div class="hk-palette-results" id="hkResults"></div>' +
            '<div class="hk-palette-footer">' +
            '<div class="hk-kbd-hint"><kbd>↑</kbd><kbd>↓</kbd> навигация</div>' +
            '<div class="hk-kbd-hint"><kbd>Enter</kbd> открыть</div>' +
            '<div class="hk-kbd-hint"><kbd>Esc</kbd> закрыть</div>' +
            '</div>' +
            '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var input = document.getElementById('hkInput');
        input.addEventListener('input', function() {
            filterCommands();
        });

        document.getElementById('hkOverlay').addEventListener('click', function(e) {
            if (e.target === this) closePalette();
        });
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    function init() {
        buildPaletteHtml();
        buildCommands();
        document.addEventListener('keydown', onKeyDown);
        console.log('[hotkeys] Горячие клавиши и палитра активированы.');
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.init = init;
    api.openPalette = openPalette;
    api.closePalette = closePalette;
    api.showHelp = showHelp;
    api.registerCommand = registerCommand;
    api.canCreateTask = canCreateTask;

    window.openCommandPalette = openPalette;
    window.showHotkeysHelp = showHelp;

    console.log('[hotkeys] Загружено');
})();