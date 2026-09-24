// static/js/users.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[users] App не инициализирован');
        return;
    }

    var api = window.App.register('Users');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============= СПИСОК =============
    function loadUsersPage() {
        var $contentBlock = $('#otherPagesBlock');
        $contentBlock.html('<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Загрузка пользователей...</p></div>');

        fetch('/api/users')
            .then(function(response) {
                if (response.status === 401) { window.location.href = '/login'; return null; }
                return response.json();
            })
            .then(function(users) {
                if (!users) return;
                if (users.error) {
                    $contentBlock.html('<div class="alert alert-danger">' +
                        '<i class="bi bi-exclamation-circle"></i> ' + utils.escapeHtml(users.error) + '</div>');
                    return;
                }

                var html = '<div class="card">';
                html += '<div class="card-header bg-primary text-white">';
                html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
                html += '<h5 class="mb-0"><i class="bi bi-people"></i> Пользователи системы</h5>';
                html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
                html += '<span class="badge bg-light text-dark fs-6">Всего: ' + users.length + '</span>';
                html += '<button class="btn btn-sm btn-light" onclick="showImportUsersModal()">' +
                        '<i class="bi bi-upload"></i> Импорт из БД</button>';
                html += '<button class="btn btn-sm btn-light" onclick="showAddUserModal()">' +
                        '<i class="bi bi-person-plus"></i> Добавить</button>';
                html += '</div></div></div>';
                html += '<div class="card-body"><div class="table-responsive">';
                html += '<table class="table table-striped table-hover">';
                html += '<thead><tr>';
                html += '<th>ФИО</th><th>Логин</th><th>Роль</th>';
                html += '<th>Email</th><th>Телефон</th><th>Отдел</th>';
                html += '<th>Статус</th><th>Действия</th>';
                html += '</tr></thead><tbody>';

                users.forEach(function(user) {
                    var statusBadge = user.is_active
                        ? '<span class="badge bg-success">Активен</span>'
                        : '<span class="badge bg-danger">Заблокирован</span>';

                    var roleBadge;
                    switch (user.role) {
                        case 'Администратор': roleBadge = '<span class="badge bg-danger">' + user.role + '</span>'; break;
                        case 'Техник':        roleBadge = '<span class="badge bg-primary">' + user.role + '</span>'; break;
                        case 'Пользователь':  roleBadge = '<span class="badge bg-secondary">' + user.role + '</span>'; break;
                        default:              roleBadge = '<span class="badge bg-info text-dark">' + user.role + '</span>';
                    }

                    html += '<tr>';
                    html += '<td><strong>' + utils.escapeHtml(user.full_name) + '</strong></td>';
                    html += '<td>' + utils.escapeHtml(user.login || '-') + '</td>';
                    html += '<td>' + roleBadge + '</td>';
                    html += '<td>' + utils.escapeHtml(user.email || '-') + '</td>';
                    html += '<td>' + utils.escapeHtml(user.phone || '-') + '</td>';
                    html += '<td>' + utils.escapeHtml(user.department || '-') + '</td>';
                    html += '<td>' + statusBadge + '</td>';
                    html += '<td><div class="btn-group btn-group-sm">';
                    html += '<button class="btn btn-outline-primary" onclick="showUserCardById(' + user.id + ')" title="Просмотр"><i class="bi bi-eye"></i></button>';
                    html += '<button class="btn btn-outline-success" onclick="editUserById(' + user.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
                    html += '<button class="btn btn-outline-info" onclick="printUserCredentials(' + user.id + ')" title="Печать учётных данных"><i class="bi bi-printer"></i></button>';
                    html += '<button class="btn btn-outline-warning" onclick="toggleUserStatus(' + user.id + ')" title="Блок/разблок"><i class="bi bi-' + (user.is_active ? 'lock' : 'unlock') + '"></i></button>';
                    html += '<button class="btn btn-outline-danger" onclick="deleteUser(' + user.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
                    html += '</div></td></tr>';
                });

                html += '</tbody></table></div></div></div>';
                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[users] load error:', error);
                $contentBlock.html('<div class="alert alert-danger">Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>');
            });
    }

    // ============= КАРТОЧКА =============
    function showUserCardById(userId) {
        fetch('/api/users/' + userId)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) { utils.showErrorMessage(data.error); return; }

                var statusText = data.is_active ? 'Активен' : 'Заблокирован';
                var statusColor = data.is_active ? 'text-success' : 'text-danger';

                var html = '<div class="text-center">' +
                    '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px">' +
                    utils.escapeHtml((data.full_name || '?').charAt(0)) + '</div>' +
                    '<h4>' + utils.escapeHtml(data.full_name) + '</h4>' +
                    '<p class="text-muted">' + utils.escapeHtml(data.role) + '</p>' +
                    '<p class="' + statusColor + '"><strong>' + statusText + '</strong></p><hr>' +
                    '<p><i class="bi bi-person"></i> Логин: <strong>' + utils.escapeHtml(data.login || '-') + '</strong></p>' +
                    '<p><i class="bi bi-building"></i> Отдел: ' + utils.escapeHtml(data.department || '-') + '</p>' +
                    '<p><i class="bi bi-envelope"></i> Email: ' + utils.escapeHtml(data.email || '-') + '</p>' +
                    '<p><i class="bi bi-phone"></i> Телефон: ' + utils.escapeHtml(data.phone || '-') + '</p>';

                if (data.statistics) {
                    html += '<hr>' +
                        '<p><i class="bi bi-list-check"></i> Всего заявок: <strong>' + (data.statistics.total_tasks || 0) + '</strong></p>' +
                        '<p><i class="bi bi-check-circle"></i> Выполнено: <strong>' + (data.statistics.completed || 0) + '</strong></p>' +
                        '<p><i class="bi bi-hourglass-split"></i> В работе: <strong>' + (data.statistics.active || 0) + '</strong></p>';
                }
                html += '</div>';

                Swal.fire({
                    title: 'Карточка пользователя',
                    html: html,
                    confirmButtonText: 'Закрыть',
                    showCancelButton: true,
                    cancelButtonText: '<i class="bi bi-pencil"></i> Редактировать',
                    cancelButtonColor: '#28a745'
                }).then(function(result) {
                    if (result.dismiss === Swal.DismissReason.cancel) {
                        editUserById(userId);
                    }
                });
            });
    }

    // ============= РЕДАКТИРОВАНИЕ =============
    function editUserById(userId) {
        Promise.all([
            fetch('/api/users/' + userId).then(function(r) { return r.json(); }),
            fetch('/api/users/' + userId + '/credentials').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var data = results[0];
                var cred = results[1];

                if (data.error) { utils.showErrorMessage(data.error); return; }

                $('#editFullName').val(data.full_name || '');
                $('#editRole').val(data.role || 'Пользователь');
                $('#editEmail').val(data.email || '');
                $('#editPhone').val(data.phone || '');
                $('#editDepartment').val(data.department || '');
                $('#editLogin').val(data.login || '');
                $('#editIsActive').prop('checked', data.is_active);

                // Подставляем поле пароля: плейсхолдер + кнопка сброса
                var passwordHtml =
                    '<div class="input-group">' +
                    '<input type="password" class="form-control" name="password" id="editPassword" ' +
                    'placeholder="•••••• (оставьте пустым, чтобы не менять)" minlength="6">' +
                    '<button class="btn btn-outline-secondary" type="button" ' +
                    'onclick="togglePasswordVisibility(\'editPassword\', \'editPasswordEye\')" title="Показать/скрыть">' +
                    '<i class="bi bi-eye" id="editPasswordEye"></i></button>' +
                    '<button class="btn btn-outline-warning" type="button" ' +
                    'onclick="resetUserPassword(' + userId + ')" title="Сгенерировать новый пароль">' +
                    '<i class="bi bi-arrow-clockwise"></i></button>' +
                    '</div>' +
                    '<small class="text-muted">Пароль хранится в виде необратимого хеша. ' +
                    'Для получения нового нажмите 🔄.</small>';

                // Ищем контейнер поля пароля и заменяем содержимое
                var $pwdField = $('#editPassword');
                if ($pwdField.length > 0) {
                    var $wrapper = $pwdField.closest('.mb-3');
                    if ($wrapper.length > 0) {
                        $wrapper.html('<label class="form-label">Пароль</label>' + passwordHtml);
                    }
                }

                $('#editUserForm').data('user-id', userId);
                $('#editUserForm').data('edit-mode', 'admin');

                $('#loginPasswordFields').show();
                $('#statusToggleField').show();

                $('#avatarFileInput').val('');
                $('#editUserForm').data('avatar-file', null);
                $('#editUserForm').data('avatar-is-file', false);
                $('#avatarInput').val(data.avatar || '');

                var avatar = data.avatar || '';
                if (avatar && avatar.indexOf('uploads/') === 0) {
                    $('#editUserAvatar').css({
                        'background-image': 'url(/' + avatar + ')',
                        'background-size': 'cover',
                        'background-position': 'center',
                        'color': 'transparent'
                    });
                } else {
                    updateAvatarPreview(avatar, data.full_name);
                }

                generateAvatarSelector(avatar, data.full_name);
                $('#editUserModal').modal('show');
            });
    }

    // ============= СБРОС ПАРОЛЯ =============
    function resetUserPassword(userId) {
        Swal.fire({
            title: 'Сгенерировать новый пароль?',
            text: 'Старый пароль станет недействительным.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да, сгенерировать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#f6c23e'
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/users/' + userId + '/reset-password', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Пароль сброшен',
                            html:
                                '<div class="text-start">' +
                                '<p><strong>Логин:</strong> ' + utils.escapeHtml(data.credentials.login) + '</p>' +
                                '<p><strong>Новый пароль:</strong> <code>' +
                                utils.escapeHtml(data.credentials.password) + '</code></p>' +
                                '<p class="text-muted small">Сообщите пароль пользователю — он больше не будет показан.</p>' +
                                '</div>',
                            showCancelButton: true,
                            confirmButtonText: 'Скопировать и закрыть',
                            cancelButtonText: 'Закрыть',
                            confirmButtonColor: '#0d6efd'
                        }).then(function(res) {
                            if (res.isConfirmed) {
                                navigator.clipboard.writeText(data.credentials.password);
                                utils.showSuccessMessage('Пароль скопирован');
                            }
                        });
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ПЕЧАТЬ УЧЁТНЫХ ДАННЫХ =============
    function printUserCredentials(userId) {
        fetch('/api/users/' + userId + '/credentials')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) { utils.showErrorMessage(data.error || 'Ошибка'); return; }
                var creds = data.credentials;

                // Пароль недоступен — предлагаем сбросить
                if (!creds.available || !creds.password) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Пароль недоступен',
                        html:
                            '<p>Пароль хранится в виде необратимого хеша и не может быть восстановлен.</p>' +
                            '<p class="text-muted small">Чтобы распечатать учётные данные, ' +
                            'сначала сбросьте пароль на новый.</p>',
                        showCancelButton: true,
                        confirmButtonText: '<i class="bi bi-arrow-clockwise"></i> Сбросить и распечатать',
                        cancelButtonText: 'Отмена',
                        confirmButtonColor: '#f6c23e'
                    }).then(function(result) {
                        if (result.isConfirmed) {
                            resetAndPrint(userId);
                        }
                    });
                    return;
                }

                doPrintCredentials(creds);
            });
    }

    function resetAndPrint(userId) {
        fetch('/api/users/' + userId + '/reset-password', { method: 'POST' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    doPrintCredentials(data.credentials);
                } else {
                    utils.showErrorMessage(data.error);
                }
            });
    }

    function doPrintCredentials(creds) {
        var w = window.open('', '_blank', 'width=500,height=400');
        w.document.write('<html><head><title>Учетные данные</title>');
        w.document.write('<style>');
        w.document.write('body{font-family:Arial,sans-serif;padding:24px;color:#222}');
        w.document.write('h3{color:#333;border-bottom:2px solid #667eea;padding-bottom:10px;margin-top:0}');
        w.document.write('.cred{margin:12px 0;font-size:15px}');
        w.document.write('.cred strong{display:inline-block;width:100px;color:#666}');
        w.document.write('.cred code{background:#f4f6fb;padding:3px 8px;border-radius:4px;font-family:monospace;font-size:14px}');
        w.document.write('.meta{color:#999;font-size:12px;margin-top:20px;border-top:1px solid #eee;padding-top:10px}');
        w.document.write('@media print{button{display:none}}');
        w.document.write('</style></head><body>');
        w.document.write('<h3>Support Active — учетные данные</h3>');
        w.document.write('<p class="cred"><strong>ФИО:</strong> ' + utils.escapeHtml(creds.full_name) + '</p>');
        w.document.write('<p class="cred"><strong>Логин:</strong> <code>' + utils.escapeHtml(creds.login) + '</code></p>');
        w.document.write('<p class="cred"><strong>Пароль:</strong> <code>' + utils.escapeHtml(creds.password) + '</code></p>');
        w.document.write('<div class="meta">Сформировано: ' + new Date().toLocaleString('ru-RU') + '</div>');
        w.document.write('<br><br><button onclick="window.print()" style="padding:10px 20px;font-size:15px;cursor:pointer;background:#667eea;color:white;border:none;border-radius:6px;">Распечатать</button>');
        w.document.write('</body></html>');
        w.document.close();
    }

    // ============= ПРОЧИЕ ДЕЙСТВИЯ =============
    function toggleUserStatus(userId) {
        Swal.fire({
            title: 'Изменить статус?',
            text: 'Заблокировать/разблокировать пользователя?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Нет'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/users/' + userId + '/toggle', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: data.message, timer: 2000, showConfirmButton: false });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadUsersPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    function deleteUser(userId) {
        Swal.fire({
            title: 'Удалить пользователя?',
            text: 'Пользователь будет помечен как удалённый.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/users/' + userId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Пользователь удален!', timer: 2000, showConfirmButton: false });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadUsersPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ФОРМА СОЗДАНИЯ =============
    function showAddUserModal() {
        $('#editFullName').val('');
        $('#editRole').val('Пользователь');
        $('#editEmail').val('');
        $('#editPhone').val('');
        $('#editDepartment').val('');
        $('#editLogin').val('');
        $('#editPassword').val('');
        $('#editIsActive').prop('checked', true);

        $('#editUserForm').data('user-id', null);
        $('#editUserForm').data('edit-mode', 'create');

        $('#loginPasswordFields').show();
        $('#statusToggleField').hide();

        $('#avatarFileInput').val('');
        $('#editUserForm').data('avatar-file', null);
        $('#editUserForm').data('avatar-is-file', false);
        $('#avatarInput').val('default.png');

        $('#editUserAvatar').css({
            'background-image': 'none',
            'background-color': '#858796',
            'color': 'white'
        }).html('<i class="bi bi-person" style="font-size: 40px;"></i>');

        generateAvatarSelectorForNewUser();
        $('#editUserModal').modal('show');
    }

    // ============= АВАТАРЫ =============
    function generateAvatarSelectorForNewUser() {
        var $selector = $('#avatarSelector');
        $selector.empty();
        utils.avatarColors.forEach(function(color, index) {
            var avatarName = 'avatar_' + index + '.png';
            $selector.append(
                '<div class="avatar-option border border-2 border-light" ' +
                'style="width:50px;height:50px;border-radius:50%;background:' + color + ';' +
                'color:white;display:flex;align-items:center;justify-content:center;' +
                'font-size:20px;font-weight:bold;cursor:pointer;" ' +
                'onclick="selectAvatarForNewUser(\'' + avatarName + '\',\'' + color + '\', this)">' +
                '<i class="bi bi-person"></i></div>'
            );
        });
    }

    function selectAvatarForNewUser(avatarName, color, el) {
        $('#avatarFileInput').val('');
        $('#editUserForm').data('avatar-file', null);
        $('#editUserForm').data('avatar-is-file', false);
        $('#avatarInput').val(avatarName);
        $('#editUserAvatar').css({
            'background-image': 'none',
            'background-color': color,
            'color': 'white'
        }).html('<i class="bi bi-person" style="font-size: 40px;"></i>');
        $('#avatarSelector .avatar-option').removeClass('border-primary').addClass('border-light');
        if (el) { el.classList.remove('border-light'); el.classList.add('border-primary'); }
    }

    function generateAvatarSelector(selectedAvatar, fullName) {
        var $selector = $('#avatarSelector');
        $selector.empty();
        var initials = (fullName && fullName.trim().length > 0)
            ? fullName.trim().charAt(0).toUpperCase() : '?';
        utils.avatarColors.forEach(function(color, index) {
            var avatarName = 'avatar_' + index + '.png';
            var isSelected = selectedAvatar === avatarName;
            $selector.append(
                '<div class="avatar-option ' +
                (isSelected ? 'border border-3 border-primary' : 'border border-2 border-light') +
                '" style="width:50px;height:50px;border-radius:50%;background:' + color + ';' +
                'color:white;display:flex;align-items:center;justify-content:center;' +
                'font-size:20px;font-weight:bold;cursor:pointer;" ' +
                'onclick="selectAvatar(\'' + avatarName + '\',\'' + color + '\',\'' + initials + '\', this)">' +
                utils.escapeHtml(initials) + '</div>'
            );
        });
    }

    function selectAvatar(avatarName, color, initials, el) {
        $('#avatarFileInput').val('');
        $('#editUserForm').data('avatar-file', null);
        $('#editUserForm').data('avatar-is-file', false);
        $('#avatarInput').val(avatarName);
        $('#editUserAvatar').css({
            'background-image': 'none',
            'background-color': color,
            'color': 'white'
        }).text(initials);
        $('#avatarSelector .avatar-option').removeClass('border-primary').addClass('border-light');
        if (el) { el.classList.remove('border-light'); el.classList.add('border-primary'); }
    }

    function updateAvatarPreview(avatar, fullName) {
        var initials = '?';
        if (fullName && fullName.trim().length > 0) {
            initials = fullName.trim().charAt(0).toUpperCase();
        }
        var colorIndex = (fullName && fullName.trim().length > 0)
            ? fullName.trim().length % utils.avatarColors.length : 0;
        $('#editUserAvatar').css({
            'background-image': 'none',
            'background-color': utils.avatarColors[colorIndex],
            'color': 'white'
        }).text(initials);
    }

    function previewAvatarFile(input) {
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function(e) {
                $('#editUserAvatar').css({
                    'background-image': 'url(' + e.target.result + ')',
                    'background-size': 'cover',
                    'background-position': 'center',
                    'color': 'transparent'
                });
                $('#editUserForm').data('avatar-file', input.files[0]);
                $('#editUserForm').data('avatar-is-file', true);
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    // ============= ПРОФИЛЬ СЕБЯ =============
    function editUserProfile() {
        fetch('/api/current_user').then(function(r) { return r.json(); }).then(function(data) {
            $('#editFullName').val(data.full_name || '');
            $('#editRole').val(data.role || 'Пользователь');
            $('#editEmail').val(data.email || '');
            $('#editPhone').val(data.phone || '');
            $('#editDepartment').val(data.department || '');
            $('#editLogin').val(data.login || '');
            $('#editPassword').val('');
            $('#avatarInput').val(data.avatar || '');

            $('#editUserForm').data('user-id', data.id);
            $('#editUserForm').data('edit-mode', 'self');

            $('#loginPasswordFields').hide();
            $('#statusToggleField').hide();

            $('#avatarFileInput').val('');
            $('#editUserForm').data('avatar-file', null);
            $('#editUserForm').data('avatar-is-file', false);

            var avatar = data.avatar || '';
            if (avatar && avatar.indexOf('uploads/') === 0) {
                $('#editUserAvatar').css({
                    'background-image': 'url(/' + avatar + ')',
                    'background-size': 'cover',
                    'background-position': 'center',
                    'color': 'transparent'
                });
            } else {
                updateAvatarPreview(avatar, data.full_name);
            }
            generateAvatarSelector(avatar, data.full_name);
            $('#editUserModal').modal('show');
        });
    }

    // ============= СОХРАНЕНИЕ =============
    function saveUserProfile() {
        var form = document.getElementById('editUserForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var userId = $('#editUserForm').data('user-id');
        var editMode = $('#editUserForm').data('edit-mode');
        var isFile = $('#editUserForm').data('avatar-is-file');
        var avatarFile = $('#editUserForm').data('avatar-file');

        Swal.fire({ title: 'Сохранение...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

        var formData = new FormData(form);
        var data = {};
        formData.forEach(function(v, k) {
            if (k !== 'avatar_file') data[k] = v;
        });
        data['is_active'] = $('#editIsActive').is(':checked') ? 1 : 0;

        if (editMode === 'create') {
            fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
                .then(function(r) { return r.json(); })
                .then(function(result) {
                    if (result.success) {
                        $('#editUserModal').modal('hide');
                        Swal.fire({ icon: 'success', title: 'Пользователь создан!', timer: 2000, showConfirmButton: false });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadUsersPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
                    }
                });
        } else {
            if (isFile && avatarFile) {
                var fileFormData = new FormData();
                fileFormData.append('avatar_file', avatarFile);
                fetch('/api/upload_avatar', { method: 'POST', body: fileFormData })
                    .then(function(r) { return r.json(); })
                    .then(function(uploadResult) {
                        if (uploadResult.success) {
                            data['avatar'] = uploadResult.avatar_path;
                            updateUserData(userId, data);
                        } else {
                            Swal.fire({ icon: 'error', title: 'Ошибка', text: uploadResult.error });
                        }
                    });
            } else {
                updateUserData(userId, data);
            }
        }
    }

    function updateUserData(userId, data) {
        fetch('/api/users/' + userId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (result.success) {
                    $('#editUserModal').modal('hide');
                    Swal.fire({ icon: 'success', title: 'Сохранено!', timer: 2000, showConfirmButton: false });
                    if (typeof loadUserInfo === 'function') loadUserInfo();
                    if ($('#otherPagesBlock').is(':visible')) loadUsersPage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
                }
            });
    }

    // ============= УТИЛИТА =============
    function togglePasswordVisibility(fieldId, iconId) {
        var $field = $('#' + fieldId);
        if ($field.length === 0) return;
        if ($field.attr('type') === 'password') {
            $field.attr('type', 'text');
            if (iconId) $('#' + iconId).removeClass('bi-eye').addClass('bi-eye-slash');
        } else {
            $field.attr('type', 'password');
            if (iconId) $('#' + iconId).removeClass('bi-eye-slash').addClass('bi-eye');
        }
    }

    // ============= ИМПОРТ =============
    function showImportUsersModal() {
        Swal.fire({
            title: 'Импорт пользователей',
            html:
                '<div class="text-start">' +
                '<p>Выберите файл БД SQLite (<code>.db</code>, <code>.sqlite</code>) с таблицей <code>users</code>.</p>' +
                '<div class="alert alert-info small mb-3">' +
                '<i class="bi bi-info-circle"></i> Поддерживаются две схемы: <b>Support Active</b> и <b>legacy</b>.' +
                '</div>' +
                '<label class="form-label">Файл базы данных</label>' +
                '<input type="file" id="importDbFile" class="form-control" accept=".db,.sqlite,.sqlite3">' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-upload"></i> Импортировать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() {
                var f = document.getElementById('importDbFile');
                if (!f.files || !f.files[0]) {
                    Swal.showValidationMessage('Выберите файл');
                    return false;
                }
                return f.files[0];
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var file = result.value;
            var formData = new FormData();
            formData.append('database_file', file);

            Swal.fire({
                title: 'Импорт...',
                html: 'Обработка файла <strong>' + utils.escapeHtml(file.name) + '</strong>...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); }
            });

            fetch('/api/users/import', { method: 'POST', body: formData, credentials: 'same-origin' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        var errorsHtml = '';
                        if (data.errors && data.errors.length > 0) {
                            errorsHtml = '<hr><div class="text-start small text-muted" style="max-height:200px;overflow-y:auto;">' +
                                '<strong>Замечания:</strong><br>' +
                                data.errors.slice(0, 10).map(utils.escapeHtml).join('<br>') +
                                (data.errors.length > 10 ? '<br>...и ещё ' + (data.errors.length - 10) : '') +
                                '</div>';
                        }

                        Swal.fire({
                            icon: 'success',
                            title: 'Импорт завершён',
                            html: '<div class="text-start">' +
                                '<p><i class="bi bi-check-circle text-success"></i> <strong>Импортировано:</strong> ' + data.imported + '</p>' +
                                '<p><i class="bi bi-slash-circle text-warning"></i> <strong>Пропущено:</strong> ' + data.skipped + '</p>' +
                                '<p><i class="bi bi-file-earmark-text text-info"></i> <strong>Всего в файле:</strong> ' + data.total + '</p>' +
                                errorsHtml + '</div>',
                            confirmButtonText: 'ОК',
                            customClass: { popup: 'swal-wide' }
                        });
                        loadUsersPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка импорта', text: data.error });
                    }
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.load = loadUsersPage;
    api.showCardById = showUserCardById;
    api.editById = editUserById;
    api.showAdd = showAddUserModal;
    api.editProfile = editUserProfile;
    api.save = saveUserProfile;
    api.printCredentials = printUserCredentials;
    api.resetPassword = resetUserPassword;
    api.toggleStatus = toggleUserStatus;
    api.remove = deleteUser;
    api.showImport = showImportUsersModal;
    api.togglePasswordVisibility = togglePasswordVisibility;

    window.loadUsersPage = loadUsersPage;
    window.showUserCardById = showUserCardById;
    window.editUserById = editUserById;
    window.showAddUserModal = showAddUserModal;
    window.editUserProfile = editUserProfile;
    window.saveUserProfile = saveUserProfile;
    window.printUserCredentials = printUserCredentials;
    window.resetUserPassword = resetUserPassword;
    window.toggleUserStatus = toggleUserStatus;
    window.deleteUser = deleteUser;
    window.showImportUsersModal = showImportUsersModal;
    window.togglePasswordVisibility = togglePasswordVisibility;

    window.selectAvatarForNewUser = selectAvatarForNewUser;
    window.selectAvatar = selectAvatar;
    window.previewAvatarFile = previewAvatarFile;

    console.log('[users] Загружено (без ID)');
})();