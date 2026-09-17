// static/js/notifications_sse.js

(function() {
    'use strict';

    if (!window.App) return;

    var mod = window.App.register('NotificationsSSE');
    var utils = window.App.utils;

    var sse = null;
    var retryDelay = 1000;
    var connected = false;
    var lastSyncAt = 0;
    var syncTimer = null;

    // ⚠️ Храним последний ID уведомления в localStorage,
    // чтобы при reconnect не пересылать старые
    var LAST_ID_KEY = 'support_active_last_notif_id';

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

        if (!window.EventSource) return;

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

    function syncUnreadCount() {
        if (window.App.Notifications &&
            typeof window.App.Notifications.loadUnreadCount === 'function') {
            window.App.Notifications.loadUnreadCount();
        }
    }

    function scheduleSync() {
        var now = Date.now();
        if (syncTimer) return;

        if (now - lastSyncAt >= 800) {
            lastSyncAt = now;
            syncUnreadCount();
            return;
        }
        syncTimer = setTimeout(function() {
            syncTimer = null;
            lastSyncAt = Date.now();
            syncUnreadCount();
        }, 800 - (now - lastSyncAt));
    }

    function handleNewNotification(n) {
        scheduleSync();

        // Проверка: не показывали ли мы это уведомление раньше
        var shownKey = 'shown_notif_' + n.id;
        if (sessionStorage.getItem(shownKey) === '1') {
            return;  // уже показывали в этой сессии
        }
        sessionStorage.setItem(shownKey, '1');

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: n.title || 'Уведомление',
                text: n.message || '',
                timer: 4000,
                showConfirmButton: false,
                timerProgressBar: true,
            });
        }

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