// static/js/core.js
// Корневой namespace и глобальное состояние

(function() {
    'use strict';

    // Единое пространство имён
    window.App = window.App || {};
    window.App.version = '2.1';

    // ============ ГЛОБАЛЬНОЕ СОСТОЯНИЕ ============
    window.App.state = {
        currentUserId: null,
        currentUserRole: null,
        currentUserFullName: null,
        currentTaskId: null,
        currentPage: 1,
        currentPerPage: 50,
        currentTotalPages: 1,
        selectedTasks: new Set()
    };

    // ============ ОБРАТНАЯ СОВМЕСТИМОСТЬ ============
    // Многие модули всё ещё используют глобальные переменные
    // (currentUserId, currentTaskId, selectedTasks). Сохраняем их через
    // геттеры/сеттеры, чтобы не ломать существующий код.
    Object.defineProperty(window, 'currentUserId', {
        get: function() { return window.App.state.currentUserId; },
        set: function(v) { window.App.state.currentUserId = v; },
        configurable: true
    });
    Object.defineProperty(window, 'currentTaskId', {
        get: function() { return window.App.state.currentTaskId; },
        set: function(v) { window.App.state.currentTaskId = v; },
        configurable: true
    });
    Object.defineProperty(window, 'selectedTasks', {
        get: function() { return window.App.state.selectedTasks; },
        configurable: true
    });
    Object.defineProperty(window, 'currentPage', {
        get: function() { return window.App.state.currentPage; },
        set: function(v) { window.App.state.currentPage = v; },
        configurable: true
    });
    Object.defineProperty(window, 'currentPerPage', {
        get: function() { return window.App.state.currentPerPage; },
        configurable: true
    });

    // ============ РЕГИСТРАЦИЯ МОДУЛЯ ============
    /**
     * Регистрирует модуль в App и возвращает объект для экспорта.
     * @param {string} name — имя модуля ('Tasks', 'Users', ...)
     * @returns {object} — тот же объект, что и App.<name>
     */
    window.App.register = function(name) {
        window.App[name] = window.App[name] || {};
        return window.App[name];
    };

    // ============ ЭКСПОРТ ПУБЛИЧНЫХ ФУНКЦИЙ В WINDOW ============
    /**
     * Экспортирует функции из App.<module> в window для inline onclick.
     * @param {object} apiObj — объект с функциями
     */
    window.App.exposeGlobals = function(apiObj) {
        if (!apiObj || typeof apiObj !== 'object') return;
        Object.keys(apiObj).forEach(function(key) {
            if (typeof apiObj[key] === 'function') {
                window[key] = apiObj[key];
            }
        });
    };

    console.log('[core] App namespace initialized (v' + window.App.version + ')');
})();