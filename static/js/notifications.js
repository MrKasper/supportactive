// static/js/notifications.js
// Уведомления пользователя с группировкой по заявке

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
                console.error('[notifications] unread error:', error);
            });
    }

    // ---------- Полная загрузка ----------
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
                console.error('[notifications] load error:', error);
                return null;
            });
    }

    // ---------- Иконка типа уведомления ----------
    function getIcon(type) {
        switch (type) {
            case 'new_task':       return { cls: 'bi bi-plus-circle text-primary',  bg: '#e3f2fd' };
            case 'task_taken':     return { cls: 'bi bi-play-circle text-warning',  bg: '#fff3e0' };
            case 'task_completed': return { cls: 'bi bi-check-circle text-success', bg: '#e8f5e9' };
            case 'new_comment':    return { cls: 'bi bi-chat-dots text-info',       bg: '#e0f7fa' };
            default:               return { cls: 'bi bi-bell text-secondary',       bg: '#eeeeee' };
        }
    }

    // ---------- Модалка ----------
    function show() {
        loadAll().then(function(data) {
            if (!data) return;

            var notifications = data.notifications || [];
            var unreadCount = data.unread_count || 0;

            var html = '';

            // Верхняя панель
            if (notifications.length > 0) {
                html += '<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom flex-wrap gap-2">';
                html += '<div class="d-flex gap-2 flex-wrap">';
                html += '<span class="badge bg-secondary">Всего: ' + notifications.length + '</span>';
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

            html += '<div class="list-group" style="max-height: 60vh; overflow-y: auto;">';

            if (notifications.length === 0) {
                html += '<div class="list-group-item text-center text-muted py-4">';
                html += '<i class="bi bi-bell-slash" style="font-size: 2rem;"></i>';
                html += '<p class="mb-0 mt-2">Нет уведомлений</p>';
                html += '</div>';
            } else {
                notifications.forEach(function(n) {
                    var iconInfo = getIcon(n.notification_type);
                    var isUnread = !n.is_read;
                    var evtCount = n.count || 1;
                    var hasMultiple = evtCount > 1;

                    var classes = 'list-group-item d-flex align-items-start';
                    if (isUnread) classes += ' bg-light';

                    html += '<div class="' + classes + '" style="cursor: pointer;" ' +
                            'onclick="markNotificationRead(' + n.id + ')">';

                    // Иконка
                    html += '<div style="flex-shrink: 0; margin-right: 12px;">';
                    html += '<div style="width: 40px; height: 40px; border-radius: 50%; ' +
                            'background: ' + iconInfo.bg + '; display: flex; align-items: center; ' +
                            'justify-content: center;">';
                    html += '<i class="' + iconInfo.cls + '" style="font-size: 1.2rem;"></i>';
                    html += '</div></div>';

                    // Основной контент
                    html += '<div class="flex-grow-1" style="min-width: 0;">';
                    html += '<div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">';
                    html += '<div style="min-width: 0; flex: 1;">';
                    html += '<strong>' + utils.escapeHtml(n.title || 'Уведомление');

                    // 🔢 Счётчик событий
                    if (hasMultiple) {
                        html += ' <span class="badge bg-primary" ' +
                                'style="font-size: 0.7em; vertical-align: middle;">' +
                                '×' + evtCount + '</span>';
                    }

                    html += '</strong>';

                    // Номер заявки как ссылка
                    if (n.task_id) {
                        html += ' <span class="text-muted small">· заявка №' + n.task_id + '</span>';
                    }
                    html += '</div>';

                    // Точка непрочитанного
                    if (isUnread) {
                        html += '<span class="badge bg-primary rounded-circle" ' +
                                'style="width: 10px; height: 10px; padding: 0;"></span>';
                    }
                    html += '</div>';

                    html += '<p class="mb-1 small" style="color: var(--text-color); ' +
                            'word-break: break-word;">' + utils.escapeHtml(n.message || '') + '</p>';
                    html += '<small class="text-muted">' + utils.formatDate(n.created_date) + '</small>';
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

    // ---------- Отметить одно прочитанным ----------
    function markRead(notificationId) {
        fetch('/api/notifications/' + notificationId + '/read', { method: 'POST' })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    loadUnreadCount();
                    show();  // перерисовать
                }
            });
    }

    // ---------- Отметить все прочитанными ----------
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

    // ---------- Автополлинг ----------
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

    window.loadNotifications = loadAll;
    window.loadUnreadCount = loadUnreadCount;
    window.showNotifications = show;
    window.markNotificationRead = markRead;
    window.markAllNotificationsRead = markAllRead;

    console.log('[notifications] Загружено (с группировкой)');
})();