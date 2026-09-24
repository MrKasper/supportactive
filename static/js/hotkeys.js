// static/js/hotkeys.js
// Горячие клавиши + командная палитра

(function() {
    'use strict';

    if (!window.App) {
        console.error('[hotkeys] App не инициализирован');
        return;
    }

    var api = window.App.register('Hotkeys');
    var utils = window.App.utils;

    var commands = [];
    var selectedIndex = 0;
    var filteredCommands = [];
    var pendingG = false;
    var pendingGTimer = null;

    // ============================================================
    // КТО МОЖЕТ СОЗДАВАТЬ ЗАЯВКИ
    // ============================================================
    // Техник — исполнитель, создавать заявки не может.
    function canCreateTask() {
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Пользователь';
    }

    // ============================================================
    // РЕГИСТРАЦИЯ КОМАНД
    // ============================================================
    function registerCommand(cmd) {
        commands.push(cmd);
    }

    function buildCommands() {
        commands = [];

        // --- Навигация ---
        registerCommand({
            id: 'nav.tasks', title: 'Заявки', subtitle: 'Перейти к заявкам',
            icon: 'bi-list-check', keys: ['G', 'T'],
            action: function() { window.loadPage('tasks'); }
        });
        registerCommand({
            id: 'nav.users', title: 'Пользователи', subtitle: 'Перейти к пользователям',
            icon: 'bi-people', keys: ['G', 'U'],
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('users'); }
        });
        registerCommand({
            id: 'nav.cartridges', title: 'Картриджи', subtitle: 'Перейти к картриджам',
            icon: 'bi-printer', keys: ['G', 'C'],
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('cartridges'); }
        });
        registerCommand({
            id: 'nav.licenses', title: 'Лицензии', subtitle: 'Перейти к лицензиям',
            icon: 'bi-key', keys: ['G', 'L'],
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('licenses'); }
        });
        registerCommand({
            id: 'nav.contacts', title: 'Внешние контакты', subtitle: 'Перейти к контактам',
            icon: 'bi-person-lines-fill',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('contacts'); }
        });
        registerCommand({
            id: 'nav.directory', title: 'Справочник', subtitle: 'Кабинеты и типы проблем',
            icon: 'bi-book',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('directory'); }
        });
        registerCommand({
            id: 'nav.cabinets', title: 'Управление кабинетами', subtitle: 'Оборудование кабинетов',
            icon: 'bi-door-closed',
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { window.loadPage('cabinets-manage'); }
        });
        registerCommand({
            id: 'nav.report', title: 'Отчёт по задачам', subtitle: 'Отчёты и экспорт',
            icon: 'bi-file-text',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('report'); }
        });
        registerCommand({
            id: 'nav.audit', title: 'Журнал аудита', subtitle: 'История действий',
            icon: 'bi-journal-text',
            when: function() { return window.currentUserRole === 'Администратор'; },
            action: function() { window.loadPage('audit'); }
        });

        // --- Действия ---
        registerCommand({
            id: 'action.newTask',
            title: 'Создать заявку',
            subtitle: 'Открыть форму новой заявки',
            icon: 'bi-plus-circle',
            keys: ['N'],
            // 🆕 Только Администратор и Пользователь
            when: function() { return canCreateTask(); },
            action: function() {
                if (typeof showCreateTaskModal === 'function') {
                    showCreateTaskModal();
                }
            }
        });
        registerCommand({
            id: 'action.search', title: 'Поиск заявок', subtitle: 'Фокус на поле поиска',
            icon: 'bi-search', keys: ['F'],
            when: function() { return window.currentUserRole !== 'Пользователь'; },
            action: function() { focusSearch(); }
        });
        registerCommand({
            id: 'action.refresh', title: 'Обновить данные', subtitle: 'Перезагрузить текущий список',
            icon: 'bi-arrow-clockwise', keys: ['R'],
            action: function() {
                if (typeof refreshData === 'function') refreshData();
            }
        });
        registerCommand({
            id: 'action.notifications', title: 'Уведомления', subtitle: 'Показать список уведомлений',
            icon: 'bi-bell', keys: ['B'],
            action: function() {
                if (typeof showNotifications === 'function') showNotifications();
            }
        });
        registerCommand({
            id: 'action.theme', title: 'Сменить тему', subtitle: 'Светлая / тёмная / авто',
            icon: 'bi-circle-half',
            action: function() {
                if (window.App.Theme) window.App.Theme.toggle();
            }
        });
        registerCommand({
            id: 'action.logout', title: 'Выйти из системы', subtitle: 'Завершить сессию',
            icon: 'bi-box-arrow-right',
            action: function() {
                if (typeof changeUser === 'function') changeUser();
            }
        });

        // --- Помощь ---
        registerCommand({
            id: 'help', title: 'Горячие клавиши', subtitle: 'Справка по сочетаниям клавиш',
            icon: 'bi-question-circle', keys: ['?'],
            action: showHelp
        });
    }

    // ============================================================
    // КОМАНДНАЯ ПАЛИТРА
    // ============================================================
    function openPalette() {
        buildCommands();
        selectedIndex = 0;
        filteredCommands = [];

        var overlay = document.getElementById('hkOverlay');
        var input = document.getElementById('hkInput');
        if (!overlay) return;

        input.value = '';
        overlay.classList.add('hk-open');
        filterCommands('');
        setTimeout(function() { input.focus(); }, 30);
    }

    function closePalette() {
        var overlay = document.getElementById('hkOverlay');
        if (overlay) overlay.classList.remove('hk-open');
    }

    function filterCommands(query) {
        query = (query || '').toLowerCase().trim();

        filteredCommands = commands.filter(function(cmd) {
            if (cmd.when && !cmd.when()) return false;
            if (!query) return true;
            return cmd.title.toLowerCase().indexOf(query) !== -1
                || (cmd.subtitle || '').toLowerCase().indexOf(query) !== -1
                || cmd.id.toLowerCase().indexOf(query) !== -1;
        });

        selectedIndex = 0;
        renderResults();
    }

    function renderResults() {
        var results = document.getElementById('hkResults');
        if (!results) return;

        if (filteredCommands.length === 0) {
            results.innerHTML = '<div class="hk-empty">' +
                '<i class="bi bi-search" style="font-size:2rem;opacity:.4;display:block;margin-bottom:10px;"></i>' +
                'Ничего не найдено</div>';
            return;
        }

        var html = '';
        filteredCommands.forEach(function(cmd, idx) {
            var isActive = idx === selectedIndex ? ' hk-active' : '';
            var keysHtml = '';
            if (cmd.keys && cmd.keys.length) {
                keysHtml = '<div class="hk-item-kbd">' +
                    cmd.keys.map(function(k) { return '<kbd>' + k + '</kbd>'; }).join('') +
                    '</div>';
            }

            html += '<div class="hk-item' + isActive + '" data-index="' + idx + '" data-cmd-id="' + cmd.id + '">';
            html += '<div class="hk-item-icon"><i class="bi ' + cmd.icon + '"></i></div>';
            html += '<div class="hk-item-body">';
            html += '<div class="hk-item-title">' + utils.escapeHtml(cmd.title) + '</div>';
            if (cmd.subtitle) {
                html += '<div class="hk-item-subtitle">' + utils.escapeHtml(cmd.subtitle) + '</div>';
            }
            html += '</div>';
            html += keysHtml;
            html += '</div>';
        });

        results.innerHTML = html;

        results.querySelectorAll('.hk-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(el.getAttribute('data-index'), 10);
                executeCommand(idx);
            });
            el.addEventListener('mouseenter', function() {
                selectedIndex = parseInt(el.getAttribute('data-index'), 10);
                updateActive();
            });
        });
    }

    function updateActive() {
        var items = document.querySelectorAll('#hkResults .hk-item');
        items.forEach(function(el, idx) {
            el.classList.toggle('hk-active', idx === selectedIndex);
        });
        var active = document.querySelector('#hkResults .hk-item.hk-active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function executeCommand(index) {
        var cmd = filteredCommands[index];
        if (!cmd) return;

        closePalette();
        setTimeout(function() {
            try {
                cmd.action();
            } catch (e) {
                console.error('[hotkeys] Ошибка команды', cmd.id, e);
            }
        }, 50);
    }

    // ============================================================
    // ПОМОЩЬ
    // ============================================================
    function showHelp() {
        var html =
            '<div class="hk-help-grid">' +
            '<div class="hk-help-section-title">Навигация</div>' +
            helpRow('Заявки', ['G', 'T']) +
            helpRow('Пользователи', ['G', 'U']) +
            helpRow('Картриджи', ['G', 'C']) +
            helpRow('Лицензии', ['G', 'L']) +
            helpRow('Отчёт', ['G', 'R']) +
            '<div class="hk-help-section-title">Действия</div>' +
            helpRow('Создать заявку', ['N']) +
            helpRow('Поиск', ['F']) +
            helpRow('Обновить', ['R']) +
            helpRow('Уведомления', ['B']) +
            helpRow('Сменить тему', ['T']) +
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
        var keysHtml = keys.map(function(k) { return '<kbd>' + k + '</kbd>'; }).join('');
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
        return document.querySelector('.modal.show') !== null
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
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (isPaletteOpen()) closePalette();
            else openPalette();
            return;
        }

        if (isPaletteOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePalette();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedIndex < filteredCommands.length - 1) {
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
                // 🆕 Создавать заявки может только Администратор или Пользователь.
                // Для Техника и Разработчика — клавиша игнорируется.
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
            case 'u':
                if (window.currentUserRole === 'Администратор') window.loadPage('users');
                break;
            case 'c':
                if (window.currentUserRole !== 'Пользователь') window.loadPage('cartridges');
                break;
            case 'l':
                if (window.currentUserRole !== 'Пользователь') window.loadPage('licenses');
                break;
            case 'r':
                if (window.currentUserRole === 'Администратор') window.loadPage('report');
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
            'placeholder="Введите команду или раздел..." autocomplete="off">' +
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
            filterCommands(this.value);
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
        console.log('[hotkeys] Горячие клавиши активированы. Нажмите ? для справки.');
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