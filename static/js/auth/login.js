// static/js/login.js
// Модуль карточки текущего пользователя и утилиты авторизации

(function() {
    'use strict';

    if (!window.App) {
        console.error('[login] App не инициализирован');
        return;
    }

    var api = window.App.register('Auth');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============= ЗАГРУЗКА ИНФО ПОЛЬЗОВАТЕЛЯ =============
    function loadUserInfo() {
        fetch('/api/current_user')
            .then(function(response) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return null;
                }
                return response.json();
            })
            .then(function(data) {
                if (!data) return;
                if (data.error) {
                    window.location.href = '/login';
                    return;
                }

                state.currentUserId = data.id;
                window.currentUserRole = data.role;
                window.currentUserFullName = data.full_name;

                var userName = data.full_name || 'Неизвестно';
                var userRole = data.role || '';
                var userAvatar = userName.charAt(0).toUpperCase();

                $('#userName').text(userName);
                $('#userRole').text(userRole);
                $('#userDepartment').text(data.department || '');
                $('#userAvatar').text(userAvatar);

                if (data.avatar && data.avatar.indexOf('uploads/') === 0) {
                    $('#userAvatar').css({
                        'background-image': 'url(/' + data.avatar + ')',
                        'background-size': 'cover',
                        'background-position': 'center',
                        'color': 'transparent'
                    });
                } else {
                    $('#userAvatar').css({
                        'background-image': 'none',
                        'background': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        'color': 'white'
                    });
                }
            })
            .catch(function(error) {
                console.error('[login] loadUserInfo error:', error);
            });
    }

    // ============= КАРТОЧКА ПОЛЬЗОВАТЕЛЯ =============
    function showUserCard() {
        fetch('/api/current_user')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var avatarHtml;
                if (data.avatar && data.avatar.indexOf('uploads/') === 0) {
                    avatarHtml = '<div class="avatar-circle mx-auto mb-3" ' +
                        'style="width:80px;height:80px;font-size:32px;' +
                        'background-image:url(/' + data.avatar + ');' +
                        'background-size:cover;background-position:center;color:transparent">' +
                        utils.escapeHtml((data.full_name || '?').charAt(0)) + '</div>';
                } else {
                    avatarHtml = '<div class="avatar-circle mx-auto mb-3" ' +
                        'style="width:80px;height:80px;font-size:32px">' +
                        utils.escapeHtml((data.full_name || '?').charAt(0)) + '</div>';
                }

                var html = '<div class="text-center">' + avatarHtml +
                    '<h4>' + utils.escapeHtml(data.full_name) + '</h4>' +
                    '<p>' + utils.escapeHtml(data.role) + '</p><hr>' +
                    '<p><i class="bi bi-building"></i> ' + utils.escapeHtml(data.department || '-') + '</p>' +
                    '<p><i class="bi bi-envelope"></i> ' + utils.escapeHtml(data.email || '-') + '</p>' +
                    '<p><i class="bi bi-phone"></i> ' + utils.escapeHtml(data.phone || '-') + '</p>' +
                    '</div>';

                Swal.fire({
                    title: 'Карточка пользователя',
                    html: html,
                    confirmButtonText: 'Закрыть',
                    showCancelButton: data.role === 'Администратор',
                    cancelButtonText: '<i class="bi bi-pencil-square"></i> Редактировать',
                    cancelButtonColor: '#28a745'
                }).then(function(result) {
                    if (result.dismiss === Swal.DismissReason.cancel &&
                        typeof editUserProfile === 'function') {
                        editUserProfile();
                    }
                });
            });
    }

    // ============= СМЕНА ПОЛЬЗОВАТЕЛЯ =============
    function changeUser() {
        Swal.fire({
            title: 'Сменить пользователя?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Отмена'
        }).then(function(result) {
            if (result.isConfirmed) window.location.href = '/logout';
        });
    }

    // ============= ПРОВЕРКА АВТОРИЗАЦИИ =============
    function checkAuth() {
        return fetch('/api/current_user')
            .then(function(response) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return null;
                }
                return response.json();
            })
            .then(function(data) {
                if (!data || data.error) {
                    window.location.href = '/login';
                    return null;
                }
                state.currentUserId = data.id;
                window.currentUserRole = data.role;
                window.currentUserFullName = data.full_name;
                return data;
            });
    }

    // ============= ЭКСПОРТ =============
    api.loadUserInfo = loadUserInfo;
    api.showUserCard = showUserCard;
    api.changeUser = changeUser;
    api.checkAuth = checkAuth;

    window.loadUserInfo = loadUserInfo;
    window.showUserCard = showUserCard;
    window.changeUser = changeUser;
    window.checkAuth = checkAuth;

    console.log('[login] Загружено');
})();