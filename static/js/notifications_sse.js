// static/js/notifications_sse.js
// Real-time уведомления через Server-Sent Events.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[notifications_sse] App не инициализирован');
        return;
    }

    var api = window.App.register('NotificationsSSE');
    var sse = null;
    var retryDelay = 1000;
    var connected = false;

    function connect() {
        if (sse) {
            try { sse.close(); } catch (e) {}
            sse = null;
        }

        if (!window.EventSource) {
            console.warn('[SSE] EventSource не поддерживается');
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
            console.warn('[SSE] Переподключение через ' + retryDelay + 'ms');
            setTimeout(connect, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30000);
        };
    }

    function handleNewNotification(n) {
        // Обновляем бейдж
        var $badge = $('#notificationBadge');
        var cur = parseInt($badge.text(), 10) || 0;
        $badge.text(cur + 1).show();

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
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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

        // Если открыта модалка уведомлений — перерисуем
        if (typeof window.loadNotifications === 'function') {
            // Не дёргаем сразу — пользователь может листать
            // Просто помечаем, что есть новые
        }
    }

    function disconnect() {
        if (sse) {
            try { sse.close(); } catch (e) {}
            sse = null;
        }
        connected = false;
    }

    function isConnected() {
        return connected;
    }

    api.connect = connect;
    api.disconnect = disconnect;
    api.isConnected = isConnected;

    console.log('[notifications_sse] Загружено');
})();