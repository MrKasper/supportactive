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
                        'background': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
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
        if (typeof window.openModal === 'function') {
            window.openModal('modalProfile');
        }
        renderProfileModal();
    }

    function renderProfileModal() {
        fetch('/api/current_user')
            .then(function(r) { return r.json(); })
            .then(function(u) {
                if (!u || u.error) {
                    if (window.App.Toasts) {
                        window.App.Toasts.error('Ошибка',
                            (u && u.error) || 'Не удалось загрузить профиль');
                    }
                    return;
                }

                var fullName = u.full_name || '—';
                var initial = fullName.charAt(0).toUpperCase();
                var avatar = u.avatar || '';
                var $av = $('#profileAvatar');

                if (avatar && avatar.indexOf('uploads/') === 0) {
                    // Загруженный файл — background-image, буква скрыта
                    $av.attr('style',
                        'background-image: url(/' + avatar + ');' +
                        'background-size: cover;' +
                        'background-position: center;' +
                        'color: transparent;'
                    ).text(initial);
                } else {
                    // Цветной аватар — снимаем inline-стили,
                    // работает CSS-класс .profile-avatar (градиент + буква)
                    $av.removeAttr('style').text(initial);
                }

                $('#profileName').text(fullName);
                $('#profileRole').text(u.role || '—');
                $('#profileLogin').text(u.login || '—');
                $('#profileEmail').text(u.email || '—');
                $('#profilePhone').text(u.phone || '—');
                $('#profileDepartment').text(u.department || '—');

                // Статистика по заявкам
                fetch('/api/statistics')
                    .then(function(r) { return r.json(); })
                    .then(function(s) {
                        if (s && !s.error) {
                            $('#profileTotal').text(s.user_total || 0);
                            $('#profileCompleted').text(s.user_completed || 0);
                        }
                    })
                    .catch(function() {
                        $('#profileTotal').text('—');
                        $('#profileCompleted').text('—');
                    });
            })
            .catch(function(err) {
                console.error('[login] renderProfileModal error:', err);
            });
    }

    // ============= СИНХРОНИЗАЦИЯ САЙДБАР-ЮЗЕРА =============
    // login.js заполняет #userName / #userAvatar / #userRole в user-card.
    // В сайдбаре ID другие (#userNameSidebar и т.д.) — копируем через
    // MutationObserver, не трогая основной код.
    function syncSidebarUser() {
        var name = ($('#userName').text() || '').trim();
        var role = ($('#userRole').text() || '').trim();
        var avatarEl = document.getElementById('userAvatar');

        var $nameS = $('#userNameSidebar');
        var $roleS = $('#userRoleSidebar');
        var $avatarS = $('#userAvatarSidebar');

        if ($nameS.length && name) $nameS.text(name);
        if ($roleS.length && role) $roleS.text(role);

        if ($avatarS.length) {
            var initial = name ? name.charAt(0).toUpperCase() : '?';
            $avatarS.text(initial);

            if (avatarEl) {
                var bgImg = avatarEl.style.backgroundImage || '';
                if (bgImg && bgImg !== 'none') {
                    $avatarS.css({
                        'background-image': bgImg,
                        'background-size': 'cover',
                        'background-position': 'center',
                        'color': 'transparent'
                    });
                }
            }
        }
    }

    function observeUserCard() {
        var mainName = document.getElementById('userName');
        if (!mainName) return;

        var observer = new MutationObserver(syncSidebarUser);
        observer.observe(mainName, {
            childList: true, characterData: true, subtree: true
        });

        var role = document.getElementById('userRole');
        if (role) {
            observer.observe(role, {
                childList: true, characterData: true, subtree: true
            });
        }
        var avatar = document.getElementById('userAvatar');
        if (avatar) {
            observer.observe(avatar, {
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }

        syncSidebarUser();
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

    $(document).ready(function() {
        observeUserCard();
    });

    console.log('[login] Загружено');
})();