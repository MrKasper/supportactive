// static/js/notifications.js
// Уведомления пользователя с группировкой по заявке.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[notifications] App не инициализирован');
        return;
    }

    var mod = window.App.register('Notifications');
    var api = window.App.api;
    var utils = window.App.utils;
    var pollTimer = null;

    // ============================================================
    // ЗАГРУЗКА СЧЁТЧИКА
    // ============================================================
    function loadUnreadCount() {
        api.get('/api/notifications/unread-count')
            .then(function(data) {
                if (!data || data.error) return;
                var count = data.unread_count || 0;
                var $badge = $('#notificationBadge');
                if (count > 0) $badge.text(count).show();
                else $badge.hide();
            })
            .catch(function(error) {
                console.error('[notifications] unread error:', error);
            });
    }

    // ============================================================
    // ПОЛНАЯ ЗАГРУЗКА
    // ============================================================
    function loadAll() {
        return api.get('/api/notifications')
            .then(function(data) {
                if (!data || data.error) return null;
                var count = data.unread_count || 0;
                var $badge = $('#notificationBadge');
                if (count > 0) $badge.text(count).show();
                else $badge.hide();
                return data;
            })
            .catch(function(error) {
                console.error('[notifications] load error:', error);
                return null;
            });
    }

    // ============================================================
    // ИКОНКА ПО ТИПУ
    // ============================================================
    function getIcon(type) {
        switch (type) {
            case 'new_task':
                return { cls: 'bi bi-plus-circle text-primary', bg: '#e3f2fd' };
            case 'task_taken':
                return { cls: 'bi bi-play-circle text-warning', bg: '#fff3e0' };
            case 'task_completed':
                return { cls: 'bi bi-check-circle text-success', bg: '#e8f5e9' };
            case 'new_comment':
                return { cls: 'bi bi-chat-dots text-info', bg: '#e0f7fa' };
            case 'mention':
                return { cls: 'bi bi-at text-primary', bg: '#ede7f6' };
            default:
                return { cls: 'bi bi-bell text-secondary', bg: '#eeeeee' };
        }
    }

    // ============================================================
    // МОДАЛКА УВЕДОМЛЕНИЙ (новая — используем #modalNotifications)
    // ============================================================
    function show() {
        if (typeof window.openModal === 'function') {
            window.openModal('modalNotifications');
        }
        renderList();
    }

    function renderList() {
        var $body = $('#modalNotificationsBody');
        if (!$body.length) return;

        $body.html('<div class="text-center py-4">' +
            '<div class="spinner-border spinner-border-sm"></div></div>');

        fetch('/api/notifications')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var list = (data && data.notifications) || [];
                var unread = (data && data.unread_count) || 0;

                var $cnt = $('#notificationsCount');
                if ($cnt.length) {
                    if (unread > 0) $cnt.text(unread + ' новых').show();
                    else $cnt.hide();
                }

                if (list.length === 0) {
                    $body.html('<div class="text-center py-4 text-muted">' +
                        '<i class="bi bi-bell-slash" style="font-size:2rem;opacity:.4"></i>' +
                        '<p class="mt-2 mb-0">Нет уведомлений</p></div>');
                    return;
                }

                var ICONS = {
                    new_task:       { icon: 'bi-plus-circle',  color: 'var(--accent)', bg: 'var(--accent-soft)' },
                    task_taken:     { icon: 'bi-play-circle',  color: '#b45309',        bg: 'var(--warning-soft)' },
                    task_completed: { icon: 'bi-check-circle', color: '#047857',        bg: 'var(--success-soft)' },
                    new_comment:    { icon: 'bi-chat-dots',    color: '#0c7489',        bg: 'rgba(23,162,184,.15)' },
                    mention:        { icon: 'bi-at',           color: 'var(--accent)',  bg: 'var(--accent-soft)' }
                };

                var html = '';
                list.forEach(function(n) {
                    var ic = ICONS[n.notification_type] || {
                        icon: 'bi-bell',
                        color: 'var(--text-muted)',
                        bg: 'var(--surface-2)'
                    };
                    var isUnread = !n.is_read;
                    var cnt = n.count || 1;

                    html += '<div class="notification-item' +
                        (isUnread ? ' unread' : '') + '" ' +
                        'onclick="onNotificationClick(' + n.id + ', ' +
                        (n.task_id || 0) + ')">';
                    html += '<div class="notif-icon" style="background:' + ic.bg +
                        ';color:' + ic.color + '"><i class="bi ' + ic.icon + '"></i></div>';
                    html += '<div class="notif-body">';
                    html += '<div class="notif-title">' +
                        utils.escapeHtml(n.title || 'Уведомление');
                    if (cnt > 1) {
                        html += ' <span class="badge badge-new" ' +
                            'style="font-size:9px;">×' + cnt + '</span>';
                    }
                    html += '</div>';
                    html += '<div class="notif-text">' +
                        utils.escapeHtml(n.message || '') + '</div>';
                    html += '<div class="notif-time">' +
                        utils.formatDate(n.created_date) + '</div>';
                    html += '</div>';
                    if (isUnread) html += '<div class="notif-dot"></div>';
                    html += '</div>';
                });
                $body.html(html);
            })
            .catch(function() {
                $body.html('<div class="text-center py-4 text-danger">' +
                    'Ошибка загрузки</div>');
            });
    }

    // ============================================================
    // ОТМЕТИТЬ ПРОЧИТАННЫМ
    // ============================================================
    function markRead(notificationId) {
        api.post('/api/notifications/' + notificationId + '/read', {})
            .then(function(data) {
                if (data.success) {
                    loadUnreadCount();
                    renderList();  // перерисовать модалку
                }
            })
            .catch(function(err) {
                console.warn('[notifications] markRead error:', err);
            });
    }

    // ============================================================
    // ОТМЕТИТЬ ВСЕ ПРОЧИТАННЫМИ
    // ============================================================
    function markAllRead() {
        api.post('/api/notifications/read-all', {})
            .then(function(data) {
                if (data.success) {
                    loadUnreadCount();
                    if (typeof window.closeModal === 'function') {
                        window.closeModal('modalNotifications');
                    }
                    if (window.App.Toasts) {
                        window.App.Toasts.success(
                            'Все уведомления прочитаны', '', { duration: 2000 }
                        );
                    }
                }
            })
            .catch(function(err) {
                console.warn('[notifications] markAllRead error:', err);
            });
    }

    // ============================================================
    // АВТОПОЛЛИНГ
    // ============================================================
    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(loadUnreadCount, 30000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = loadAll;
    mod.loadUnreadCount = loadUnreadCount;
    mod.show = show;
    mod.markRead = markRead;
    mod.markAllRead = markAllRead;
    mod.startPolling = startPolling;
    mod.stopPolling = stopPolling;

    window.loadNotifications = loadAll;
    window.loadUnreadCount = loadUnreadCount;
    window.showNotifications = show;
    window.markNotificationRead = markRead;
    window.markAllNotificationsRead = markAllRead;

    // Обработчик клика по уведомлению (переехало из redesign.js)
    window.onNotificationClick = function(id, taskId) {
        fetch('/api/notifications/' + id + '/read', { method: 'POST' })
            .then(function() {
                if (window.App && window.App.Notifications) {
                    window.App.Notifications.loadUnreadCount();
                }
                if (typeof window.closeModal === 'function') {
                    window.closeModal('modalNotifications');
                }
                if (taskId && typeof window.viewTask === 'function') {
                    setTimeout(function() { window.viewTask(taskId); }, 200);
                }
            });
    };

    console.log('[notifications] Загружено');
})();