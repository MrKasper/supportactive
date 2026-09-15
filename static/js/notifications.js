// static/js/notifications.js
// Уведомления пользователя

(function() {
    'use strict';

    if (!window.App) {
        console.error('[notifications] App не инициализирован');
        return;
    }

    var api = window.App.register('Notifications');
    var utils = window.App.utils;
    var pollTimer = null;

    // ---------- Загрузка счётчика ----------
    function loadUnreadCount() {
        fetch('/api/notifications/unread-count')
            .then(function(response) {
                if (response.status === 401) return null;
                return response.json();
            })
            .then(function(data) {
                if (!data || data.error) return;
                var count = data.unread_count || 0;
                var $badge = $('#notificationBadge');
                if (count > 0) $badge.text(count).show();
                else $badge.hide();
            })
            .catch(function(error) {
                console.error('Error loading unread count:', error);
            });
    }

    // ---------- Полная загрузка (список) ----------
    function loadAll() {
        return fetch('/api/notifications')
            .then(function(response) {
                if (response.status === 401) return null;
                return response.json();
            })
            .then(function(data) {
                if (!data || data.error) return null;

                var count = data.unread_count || 0;
                var $badge = $('#notificationBadge');
                if (count > 0) $badge.text(count).show();
                else $badge.hide();

                return data;
            })
            .catch(function(error) {
                console.error('Error loading notifications:', error);
                return null;
            });
    }

    // ---------- Показать модалку уведомлений ----------
    function show() {
        loadAll().then(function(data) {
            if (!data) return;

            var notifications = data.notifications || [];
            var unreadCount = data.unread_count || 0;

            var html = '';

            if (notifications.length > 0) {
                html += '<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">';
                html += '<div>';
                html += '<span class="badge bg-secondary me-2">Всего: ' + notifications.length + '</span>';
                if (unreadCount > 0) {
                    html += '<span class="badge bg-danger">Непрочитанных: ' + unreadCount + '</span>';
                } else {
                    html += '<span class="badge bg-success">Все прочитаны</span>';
                }
                html += '</div>';
                if (unreadCount > 0) {
                    html += '<button class="btn btn-sm btn-outline-primary" onclick="markAllNotificationsRead()">';
                    html += '<i class="bi bi-check-all"></i> Отметить все как прочитанные';
                    html += '</button>';
                }
                html += '</div>';
            }

            html += '<div class="list-group" style="max-height: 55vh; overflow-y: auto;">';

            if (notifications.length === 0) {
                html += '<div class="list-group-item text-center text-muted py-4">';
                html += '<i class="bi bi-bell-slash" style="font-size: 2rem;"></i>';
                html += '<p class="mb-0 mt-2">Нет уведомлений</p>';
                html += '</div>';
            } else {
                notifications.forEach(function(notification) {
                    var iconClass = '';
                    var bgClass = notification.is_read ? '' : 'bg-light';

                    switch (notification.notification_type) {
                        case 'new_task':       iconClass = 'bi bi-plus-circle text-primary'; break;
                        case 'task_taken':     iconClass = 'bi bi-play-circle text-warning'; break;
                        case 'task_completed': iconClass = 'bi bi-check-circle text-success'; break;
                        default:               iconClass = 'bi bi-bell text-info';
                    }

                    html += '<div class="list-group-item ' + bgClass + '" style="cursor: pointer;" onclick="markNotificationRead(' + notification.id + ')">';
                    html += '<div class="d-flex align-items-start">';
                    html += '<i class="' + iconClass + '" style="font-size: 1.5rem; margin-right: 10px;"></i>';
                    html += '<div class="flex-grow-1">';
                    html += '<strong>' + utils.escapeHtml(notification.title) + '</strong>';
                    html += '<p class="mb-0 small text-muted">' + utils.escapeHtml(notification.message) + '</p>';
                    html += '<small class="text-muted">' + utils.formatDate(notification.created_date) + '</small>';
                    html += '</div>';
                    if (!notification.is_read) {
                        html += '<span class="badge bg-primary rounded-circle" style="width: 10px; height: 10px; display: inline-block;"></span>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            }

            html += '</div>';

            Swal.fire({
                title: 'Уведомления',
                html: html,
                showConfirmButton: false,
                showCloseButton: true,
                customClass: { popup: 'swal-wide' }
            });
        });
    }

    // ---------- Отметить одно ----------
    function markRead(notificationId) {
        fetch('/api/notifications/' + notificationId + '/read', { method: 'POST' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    loadUnreadCount();
                    show();
                }
            });
    }

    // ---------- Отметить все ----------
    function markAllRead() {
        fetch('/api/notifications/read-all', { method: 'POST' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    loadUnreadCount();
                    Swal.close();
                    Swal.fire({
                        icon: 'success',
                        title: 'Все уведомления прочитаны',
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
            });
    }

    // ---------- Автополлинг (раз в 30 сек) ----------
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

    // ---------- Экспорт ----------
    api.load = loadAll;
    api.loadUnreadCount = loadUnreadCount;
    api.show = show;
    api.markRead = markRead;
    api.markAllRead = markAllRead;
    api.startPolling = startPolling;
    api.stopPolling = stopPolling;

    // Для inline onclick
    window.loadNotifications = loadAll;
    window.loadUnreadCount = loadUnreadCount;
    window.showNotifications = show;
    window.markNotificationRead = markRead;
    window.markAllNotificationsRead = markAllRead;

    console.log('[notifications] Загружено');
})();