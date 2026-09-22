// static/js/toasts.js
// Собственные toast-уведомления. Не конфликтуют с SweetAlert2.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[toasts] App не инициализирован');
        return;
    }

    var mod = window.App.register('Toasts');

    var CONTAINER_ID = 'app-toast-container';
    var DEFAULT_DURATION = 5000;
    var MAX_TOASTS = 5;             // максимум одновременно
    var SHOWN_IDS = {};             // дедупликация по id

    // ============================================================
    // КОНТЕЙНЕР
    // ============================================================
    function getContainer() {
        var el = document.getElementById(CONTAINER_ID);
        if (el) return el;
        el = document.createElement('div');
        el.id = CONTAINER_ID;
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    }

    // ============================================================
    // ИКОНКИ
    // ============================================================
    function iconFor(type) {
        switch (type) {
            case 'success': return 'bi-check-lg';
            case 'warning': return 'bi-exclamation-triangle';
            case 'error':   return 'bi-x-lg';
            case 'info':
            default:        return 'bi-info-lg';
        }
    }

    // ============================================================
    // ПОКАЗ
    // ============================================================
    function show(title, message, type, options) {
        type = type || 'info';
        options = options || {};

        // Дедупликация по id (для SSE)
        if (options.id) {
            var key = 'toast_' + options.id;
            if (SHOWN_IDS[key]) return;
            SHOWN_IDS[key] = true;
            // Чистим через 5 минут
            setTimeout(function() { delete SHOWN_IDS[key]; }, 300000);
        }

        var container = getContainer();

        // Ограничиваем количество
        var items = container.querySelectorAll('.toast-item');
        if (items.length >= MAX_TOASTS) {
            // Удаляем самый старый
            removeToast(items[0]);
        }

        var el = document.createElement('div');
        el.className = 'toast-item toast-' + type;

        var icon = iconFor(type);

        el.innerHTML =
            '<div class="toast-icon"><i class="bi ' + icon + '"></i></div>' +
            '<div class="toast-body">' +
                (title ? '<div class="toast-title"></div>' : '') +
                (message ? '<div class="toast-message"></div>' : '') +
            '</div>' +
            '<button class="toast-close" type="button" title="Закрыть">' +
                '<i class="bi bi-x"></i>' +
            '</button>';

        // Безопасная вставка текста (защита от XSS)
        if (title) {
            el.querySelector('.toast-title').textContent = title;
        }
        if (message) {
            el.querySelector('.toast-message').textContent = message;
        }

        // Клик по toast — переход по URL (для SSE)
        if (options.url) {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.toast-close')) return;
                window.location.href = options.url;
            });
        }

        // Закрытие
        var closeBtn = el.querySelector('.toast-close');
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeToast(el);
        });

        container.appendChild(el);

        // Автоскрытие
        var duration = options.duration || DEFAULT_DURATION;
        if (duration > 0) {
            setTimeout(function() { removeToast(el); }, duration);
        }

        return el;
    }

    function removeToast(el) {
        if (!el || !el.parentNode) return;
        el.classList.add('toast-hiding');
        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 200);
    }

    function clearAll() {
        var container = getContainer();
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }

    // ============================================================
    // ХЕЛПЕРЫ ПО ТИПАМ
    // ============================================================
    function info(title, message, options)    { return show(title, message, 'info', options); }
    function success(title, message, options) { return show(title, message, 'success', options); }
    function warning(title, message, options) { return show(title, message, 'warning', options); }
    function error(title, message, options)   { return show(title, message, 'error', options); }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.show = show;
    mod.info = info;
    mod.success = success;
    mod.warning = warning;
    mod.error = error;
    mod.clearAll = clearAll;
    mod.removeToast = removeToast;

    // Глобальные алиасы
    window.showToast = show;
    window.toastInfo = info;
    window.toastSuccess = success;
    window.toastWarning = warning;
    window.toastError = error;

    console.log('[toasts] Загружено');
})();