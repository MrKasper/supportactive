// static/js/notifications.js

// ============= ЗАГРУЗКА УВЕДОМЛЕНИЙ =============
function loadNotifications() {
    fetch('/api/notifications')
        .then(function(response) {
            if (response.status === 401) return null;
            return response.json();
        })
        .then(function(data) {
            if (!data || data.error) return;

            var count = data.unread_count || 0;
            var badge = $('#notificationBadge');

            if (count > 0) {
                badge.text(count).show();
            } else {
                badge.hide();
            }
        })
        .catch(function(error) {
            console.error('Error loading notifications:', error);
        });
}

function loadUnreadCount() {
    fetch('/api/notifications/unread-count')
        .then(function(response) {
            if (response.status === 401) return null;
            return response.json();
        })
        .then(function(data) {
            if (!data || data.error) return;

            var count = data.unread_count || 0;
            var badge = $('#notificationBadge');

            if (count > 0) {
                badge.text(count).show();
            } else {
                badge.hide();
            }
        })
        .catch(function(error) {
            console.error('Error loading unread count:', error);
        });
}

function showNotifications() {
    fetch('/api/notifications')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                showErrorMessage(data.error);
                return;
            }

            var notifications = data.notifications || [];

            var html = '<div class="list-group">';

            if (notifications.length === 0) {
                html += '<div class="list-group-item text-center text-muted py-4">';
                html += '<i class="bi bi-bell-slash" style="font-size: 2rem;"></i>';
                html += '<p class="mb-0 mt-2">Нет уведомлений</p>';
                html += '</div>';
            } else {
                notifications.forEach(function(notification) {
                    var iconClass = '';
                    var bgClass = notification.is_read ? '' : 'bg-light';

                    switch(notification.notification_type) {
                        case 'new_task':
                            iconClass = 'bi bi-plus-circle text-primary';
                            break;
                        case 'task_taken':
                            iconClass = 'bi bi-play-circle text-warning';
                            break;
                        case 'task_completed':
                            iconClass = 'bi bi-check-circle text-success';
                            break;
                        default:
                            iconClass = 'bi bi-bell text-info';
                    }

                    html += '<div class="list-group-item ' + bgClass + '" style="cursor: pointer;" onclick="markNotificationRead(' + notification.id + ')">';
                    html += '<div class="d-flex align-items-start">';
                    html += '<i class="' + iconClass + '" style="font-size: 1.5rem; margin-right: 10px;"></i>';
                    html += '<div class="flex-grow-1">';
                    html += '<strong>' + notification.title + '</strong>';
                    html += '<p class="mb-0 small text-muted">' + notification.message + '</p>';
                    html += '<small class="text-muted">' + formatDate(notification.created_date) + '</small>';
                    html += '</div>';
                    if (!notification.is_read) {
                        html += '<span class="badge bg-primary rounded-circle" style="width: 10px; height: 10px; display: inline-block;"></span>';
                    }
                    html += '</div>';
                    html += '</div>';
                });
            }

            html += '</div>';

            if (notifications.length > 0) {
                html += '<div class="text-center mt-3">';
                html += '<button class="btn btn-sm btn-outline-primary" onclick="markAllNotificationsRead()">';
                html += '<i class="bi bi-check-all"></i> Отметить все как прочитанные';
                html += '</button>';
                html += '</div>';
            }

            Swal.fire({
                title: 'Уведомления',
                html: html,
                showConfirmButton: false,
                showCloseButton: true,
                customClass: {
                    popup: 'swal-wide'
                }
            });
        });
}

function markNotificationRead(notificationId) {
    fetch('/api/notifications/' + notificationId + '/read', {
        method: 'POST'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            loadUnreadCount();
            // Показываем обновленный список
            showNotifications();
        }
    });
}

function markAllNotificationsRead() {
    fetch('/api/notifications/read-all', {
        method: 'POST'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            loadUnreadCount();
            Swal.close();
            Swal.fire({ icon: 'success', title: 'Все уведомления прочитаны', timer: 1500, showConfirmButton: false });
        }
    });
}

// Периодическое обновление счетчика уведомлений
setInterval(function() {
    if (typeof loadUnreadCount === 'function') {
        loadUnreadCount();
    }
}, 30000); // Обновление каждые 30 секунд

console.log('Notifications module loaded');