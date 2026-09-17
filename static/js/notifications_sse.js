// static/js/notifications_sse.js
// Real-time уведомления через Server-Sent Events.
// Счётчик синхронизируется с сервером (не инкремент локально).

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

    // Throttle для синхронизации счётчика — не чаще 800 мс
    var SYNC_THROTTLE_MS = 800;

    // ============================================================
    // ПОДКЛЮЧЕНИЕ
    // ============================================================
    function connect() {
        if (sse) {
            try { sse.close(); } catch (e) {}
            sse = null;
        }

        if (!window.EventSource) {
            console.warn('[SSE] EventSource не поддерживается браузером');
            return;
        }

        try {
            sse = new EventSource('/api/notifications/stream');
        } catch (e) {
            console.warn('[SSE] Не удалось создать EventSource', e);
            return;
        }

        sse.onopen = function() {
            console.log('[SSE] Подключено');
            connected = true;
            retryDelay = 1000;
        };

        sse.onmessage = function(e) {
            if (!e.data) return;
            try {
                var n = JSON.parse(e.data);
                handleNewNotification(n);
            } catch (err) {
                console.warn('[SSE] Parse error', err, e.data);
            }
        };

        sse.onerror = function() {
            if (sse) {
                try { sse.close(); } catch (e) {}
                sse = null;
            }
            connected = false;
            console.warn(
                '[SSE] Переподключение через ' + retryDelay + 'ms'
            );
            setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        };
    }

    // ============================================================
    // СИНХРОНИЗАЦИЯ СЧЁТЧИКА С СЕРВЕРОМ
    // ============================================================
    function syncUnreadCount() {
        if (window.App.Notifications &&
            typeof window.App.Notifications.loadUnreadCount === 'function') {
            window.App.Notifications.loadUnreadCount();
        }
    }

    function scheduleSync() {
        var now = Date.now();
        var elapsed = now - lastSyncAt;

        // Уже запланировано — не дублируем
        if (syncTimer) return;

        // Прошло достаточно времени — синхронизируем сразу
        if (elapsed >= SYNC_THROTTLE_MS) {
            lastSyncAt = now;
            syncUnreadCount();
            return;
        }

        // Иначе — откладываем на остаток времени
        syncTimer = setTimeout(function() {
            syncTimer = null;
            lastSyncAt = Date.now();
            syncUnreadCount();
        }, SYNC_THROTTLE_MS - elapsed);
    }

    // ============================================================
    // ОБРАБОТКА НОВОГО УВЕДОМЛЕНИЯ
    // ============================================================
    function handleNewNotification(n) {
        // ⚠️ НЕ инкрементим бейдж локально — перезапрашиваем с сервера
        scheduleSync();

        // Toast
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

        // Browser Notification (если разрешено)
        if (typeof Notification !== 'undefined' &&
            Notification.permission === 'granted') {
            try {
                new Notification(n.title || 'Support Active', {
                    body: n.message || '',
                    icon: '/static/logo.png',
                    tag: 'task-' + (n.task_id || 'general'),
                });
            } catch (e) {
                // Safari может ругаться — игнорируем
            }
        }
    }

    // ============================================================
    // ОТКЛЮЧЕНИЕ
    // ============================================================
    function disconnect() {
        if (sse) {
            try { sse.close(); } catch (e) {}
            sse = null;
        }
        if (syncTimer) {
            clearTimeout(syncTimer);
            syncTimer = null;
        }
        connected = false;
    }

    function isConnected() {
        return connected;
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.connect = connect;
    mod.disconnect = disconnect;
    mod.isConnected = isConnected;

    // Для ручного вызова из консоли
    window.sseConnect = connect;
    window.sseDisconnect = disconnect;

    console.log('[notifications_sse] Загружено');
})();