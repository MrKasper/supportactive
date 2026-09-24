// static/js/dev/dev_console_core.js
// Ядро консоли разработчика: табы, состояние, reloadAll.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[dev_console_core] App не инициализирован');
        return;
    }

    var DC = window.DevConsole = window.DevConsole || {};

    var state = {
        currentTab: 'db',
        loaded: {
            db: false,
            data: false,
            logs: false,
            system: false,
            files: false,
            tests: false,
            slow: false,
        },
    };
    DC._state = state;

    // ============================================================
    // ТАБЫ
    // ============================================================
    DC.switchTab = function(name) {
        state.currentTab = name;

        $('.dev-tabs .nav-link').removeClass('active');
        $('.dev-tabs .nav-link[data-tab="' + name + '"]').addClass('active');

        $('.dev-tab-pane').removeClass('active');
        $('.dev-tab-pane[data-tab="' + name + '"]').addClass('active');

        if (name === 'db' && !state.loaded.db) {
            state.loaded.db = true;
            if (DC.loadDbInfo) DC.loadDbInfo();
            if (DC.loadDbSchema) DC.loadDbSchema();
        } else if (name === 'data' && !state.loaded.data) {
            state.loaded.data = true;
            if (DC.loadTablesList) DC.loadTablesList();
        } else if (name === 'logs' && !state.loaded.logs) {
            state.loaded.logs = true;
            if (DC.loadLogsList) DC.loadLogsList();
        } else if (name === 'system' && !state.loaded.system) {
            state.loaded.system = true;
            if (DC.loadSystemInfo) DC.loadSystemInfo();
        } else if (name === 'files') {
            // Всегда перечитываем — файлы меняются
            state.loaded.files = true;
            if (DC.loadFilesRoots) DC.loadFilesRoots();
        } else if (name === 'tests' && !state.loaded.tests) {
            state.loaded.tests = true;
            if (DC.loadTestsList) DC.loadTestsList();
        } else if (name === 'slow') {
            // Всегда перечитываем — лог растёт
            state.loaded.slow = true;
            if (DC.loadSlowRequests) DC.loadSlowRequests();
        }
    };

    // ============================================================
    // RELOAD ALL
    // ============================================================
    DC.reloadAll = function() {
        var $btn = $('#btn-reload-all');
        if (!$btn.length) return;

        var oldHtml = $btn.html();
        $btn.prop('disabled', true)
            .html('<span class="spinner-border spinner-border-sm"></span> Обновление...');

        state.loaded = {
            db: false,
            data: false,
            logs: false,
            system: false,
            files: false,
            tests: false,
            slow: false,
        };

        try {
            DC.switchTab(state.currentTab);
            if (state.currentTab === 'logs' && DC.loadLogsList) {
                DC.loadLogsList();
            }
        } catch (e) {
            console.error('[dev_console_core] reloadAll error:', e);
        }

        setTimeout(function() {
            $btn.prop('disabled', false).html(oldHtml);
            if (window.App.utils) {
                window.App.utils.showSuccessMessage('Данные обновлены');
            }
        }, 800);
    };

    // ============================================================
    // АВТОЗАГРУЗКА (при первом открытии вкладки "БД")
    // ============================================================
    $(document).ready(function() {
        if ($('#db-info-block').length === 0) return;
        state.loaded.db = true;
        if (DC.loadDbInfo) DC.loadDbInfo();
        if (DC.loadDbSchema) DC.loadDbSchema();
    });

    console.log('[dev_console_core] Загружено');
})();