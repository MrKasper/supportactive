// static/js/login.js

// ============= ЗАГРУЗКА ИНФОРМАЦИИ О ПОЛЬЗОВАТЕЛЕ =============
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

            currentUserId = data.id;

            var userName = data.full_name || 'Неизвестно';
            var userRole = data.role || '';
            var userAvatar = userName.charAt(0).toUpperCase();

            $('#userName').text(userName);
            $('#userRole').text(userRole);
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
            console.error('Error loading user info:', error);
        });
}

function showUserCard() {
    fetch('/api/current_user').then(function(r) { return r.json(); }).then(function(data) {
        var avatarHtml = '';
        if (data.avatar && data.avatar.indexOf('uploads/') === 0) {
            avatarHtml = '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px;background-image:url(/' + data.avatar + ');background-size:cover;background-position:center;color:transparent">' + (data.full_name||'?').charAt(0) + '</div>';
        } else {
            avatarHtml = '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px">' + (data.full_name||'?').charAt(0) + '</div>';
        }

        Swal.fire({
            title: 'Карточка пользователя',
            html: '<div class="text-center">' + avatarHtml + '<h4>' + data.full_name + '</h4><p>' + data.role + '</p><hr><p><i class="bi bi-building"></i> ' + (data.department||'-') + '</p><p><i class="bi bi-envelope"></i> ' + (data.email||'-') + '</p><p><i class="bi bi-phone"></i> ' + (data.phone||'-') + '</p></div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: true,
            cancelButtonText: '<i class="bi bi-pencil-square"></i> Редактировать',
            cancelButtonColor: '#28a745'
        })
        .then(function(result) {
            if (result.dismiss === Swal.DismissReason.cancel && typeof editUserProfile === 'function') {
                editUserProfile();
            }
        });
    });
}

function changeUser() {
    Swal.fire({ title: 'Сменить пользователя?', icon: 'question', showCancelButton: true, confirmButtonText: 'Да' })
        .then(function(result) { if (result.isConfirmed) window.location.href = '/logout'; });
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
            currentUserId = data.id;
            return data;
        });
}

console.log('Login module loaded');