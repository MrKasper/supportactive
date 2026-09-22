// static/js/notifications_sse.js
// Real-time уведомления через Server-Sent Events.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[notifications_sse] App не инициализирован');
        return;
    }

    var mod = window.App.register('NotificationsSSE');
    var utils = window.App.utils;

    var sse = null;
    var retryDelay = 1000;
    var connected = false;
    var lastSyncAt = 0;
    var syncTimer = null;

    var LAST_ID_KEY = 'support_active_last_notif_id';
    var SYNC_THROTTLE_MS = 800;

    // ============================================================
    // last_id в localStorage
    // ============================================================
    function getLastId() {
        var v = localStorage.getItem(LAST_ID_KEY);
        return v ? parseInt(v, 10) || 0 : 0;
    }

    function setLastId(id) {
        if (id && id > getLastId()) {
            localStorage.setItem(LAST_ID_KEY, String(id));
        }
    }

    // ============================================================
    // ПОДКЛЮЧЕНИЕ
    // ============================================================
    function connect() {
        if (sse) {
            try { sse.close(); } catch (e) {}
            sse = null;
        }

        if (!window.EventSource) {
            console.warn('[SSE] EventSource не поддерживается');
            return;
        }

        var lastId = getLastId();
        var url = '/api/notifications/stream?last_id=' + lastId;

        try {
            sse = new EventSource(url);
        } catch (e) {
            console.warn('[SSE] EventSource error', e);
            return;
        }

        sse.onopen = function() {
            console.log('[SSE] Подключено, last_id=' + lastId);
            connected = true;
            retryDelay = 1000;
        };

        sse.onmessage = function(e) {
            if (!e.data) return;
            try {
                var n = JSON.parse(e.data);
                if (n.id) setLastId(n.id);
                handleNewNotification(n);
            } catch (err) {
                console.warn('[SSE] Parse error', err);
            }
        };

        sse.onerror = function() {
            if (sse) { try { sse.close(); } catch (e) {} sse = null; }
            connected = false;
            setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        };
    }

    // ============================================================
    // СИНХРОНИЗАЦИЯ СЧЁТЧИКА
    // ============================================================
    function syncUnreadCount() {
        if (window.App.Notifications &&
            typeof window.App.Notifications.loadUnreadCount === 'function') {
            window.App.Notifications.loadUnreadCount();
        }
    }

    function scheduleSync() {
        var now = Date.now();
        if (syncTimer) return;

        if (now - lastSyncAt >= SYNC_THROTTLE_MS) {
            lastSyncAt = now;
            syncUnreadCount();
            return;
        }
        syncTimer = setTimeout(function() {
            syncTimer = null;
            lastSyncAt = Date.now();
            syncUnreadCount();
        }, SYNC_THROTTLE_MS - (now - lastSyncAt));
    }

    // ============================================================
    // ОБРАБОТКА УВЕДОМЛЕНИЯ
    // ============================================================
    function handleNewNotification(n) {
        // Обновляем счётчик с сервера
        scheduleSync();

        // ⚠️ НЕ используем Swal.fire — он закрывает открытые модалки!
        // Используем собственный toast из toasts.js
        if (window.App.Toasts && typeof window.App.Toasts.show === 'function') {
            var title = n.title || 'Уведомление';
            var message = n.message || '';
            var url = n.task_id ? ('/?task=' + n.task_id) : '/';

            window.App.Toasts.show(title, message, 'info', {
                id: n.id,              // дедупликация
                url: url,              // клик → переход
                duration: 5000,
            });
        } else if (typeof window.showToast === 'function') {
            // Fallback, если toasts.js ещё не загружен
            window.showToast(n.title || 'Уведомление', n.message || '', 'info',
                             { id: n.id });
        }

        // Browser Notification (нативные, не конфликтуют с Swal)
        if (typeof Notification !== 'undefined' &&
            Notification.permission === 'granted') {
            try {
                new Notification(n.title || 'Support Active', {
                    body: n.message || '',
                    icon: '/static/logo.png',
                    tag: 'task-' + (n.task_id || 'general'),
                });
            } catch (e) {}
        }
    }

    // ============================================================
    // ОТКЛЮЧЕНИЕ
    // ============================================================
    function disconnect() {
        if (sse) { try { sse.close(); } catch (e) {} sse = null; }
        if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
        connected = false;
    }

    mod.connect = connect;
    mod.disconnect = disconnect;
    mod.isConnected = function() { return connected; };

    console.log('[notifications_sse] Загружено');
})();