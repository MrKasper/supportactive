// static/js/users.js

// ============= ЗАГРУЗКА СТРАНИЦЫ ПОЛЬЗОВАТЕЛЕЙ =============
function loadUsersPage() {
    console.log('Loading users page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка пользователей...</p>' +
        '</div>'
    );

    fetch('/api/users')
        .then(function(response) {
            if (response.status === 401) {
                window.location.href = '/login';
                return null;
            }
            return response.json();
        })
        .then(function(users) {
            if (!users) return;
            if (users.error) {
                $contentBlock.html(
                    '<div class="alert alert-danger">' +
                    '<i class="bi bi-exclamation-circle"></i> ' + users.error +
                    '</div>'
                );
                return;
            }

            var html = '<div class="card">';
            html += '<div class="card-header bg-primary text-white">';
            html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
            html += '<h5 class="mb-0"><i class="bi bi-people"></i> Пользователи системы</h5>';
            html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
            html += '<span class="badge bg-light text-dark fs-6">Всего: ' + users.length + '</span>';
            html += '<button class="btn btn-sm btn-light" onclick="showImportUsersModal()">';
            html += '<i class="bi bi-upload"></i> Импорт из БД';
            html += '</button>';
            html += '<button class="btn btn-sm btn-light" onclick="showAddUserModal()">';
            html += '<i class="bi bi-person-plus"></i> Добавить пользователя';
            html += '</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '<div class="card-body">';
            html += '<div class="table-responsive">';
            html += '<table class="table table-striped table-hover">';
            html += '<thead><tr>';
            html += '<th>ID</th>';
            html += '<th>ФИО</th>';
            html += '<th>Логин</th>';
            html += '<th>Роль</th>';
            html += '<th>Email</th>';
            html += '<th>Телефон</th>';
            html += '<th>Отдел</th>';
            html += '<th>Статус</th>';
            html += '<th>Действия</th>';
            html += '</tr></thead>';
            html += '<tbody>';

            users.forEach(function(user) {
                var statusBadge = user.is_active ?
                    '<span class="badge bg-success">Активен</span>' :
                    '<span class="badge bg-danger">Заблокирован</span>';

                var roleBadge = '';
                switch(user.role) {
                    case 'Администратор':
                        roleBadge = '<span class="badge bg-danger">' + user.role + '</span>';
                        break;
                    case 'Техник':
                        roleBadge = '<span class="badge bg-primary">' + user.role + '</span>';
                        break;
                    case 'Пользователь':
                        roleBadge = '<span class="badge bg-secondary">' + user.role + '</span>';
                        break;
                    default:
                        roleBadge = '<span class="badge bg-info text-dark">' + user.role + '</span>';
                }

                html += '<tr>';
                html += '<td>' + user.id + '</td>';
                html += '<td><strong>' + user.full_name + '</strong></td>';
                html += '<td>' + (user.login || '-') + '</td>';
                html += '<td>' + roleBadge + '</td>';
                html += '<td>' + (user.email || '-') + '</td>';
                html += '<td>' + (user.phone || '-') + '</td>';
                html += '<td>' + (user.department || '-') + '</td>';
                html += '<td>' + statusBadge + '</td>';
                html += '<td>';
                html += '<div class="btn-group btn-group-sm">';
                html += '<button class="btn btn-outline-primary" onclick="showUserCardById(' + user.id + ')" title="Просмотр">';
                html += '<i class="bi bi-eye"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-success" onclick="editUserById(' + user.id + ')" title="Редактировать">';
                html += '<i class="bi bi-pencil"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-info" onclick="printUserCredentials(' + user.id + ')" title="Печать логина и пароля">';
                html += '<i class="bi bi-printer"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-warning" onclick="toggleUserStatus(' + user.id + ')" title="Заблокировать/Разблокировать">';
                html += '<i class="bi bi-' + (user.is_active ? 'lock' : 'unlock') + '"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-danger" onclick="deleteUser(' + user.id + ')" title="Удалить">';
                html += '<i class="bi bi-trash"></i>';
                html += '</button>';
                html += '</div>';
                html += '</td>';
                html += '</tr>';
            });

            html += '</tbody>';
            html += '</table>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            $contentBlock.html(html);
        })
        .catch(function(error) {
            console.error('Error loading users:', error);
            $contentBlock.html(
                '<div class="alert alert-danger">' +
                '<i class="bi bi-exclamation-triangle"></i> Ошибка загрузки пользователей: ' + error.message +
                '</div>'
            );
        });
}

// Показать карточку пользователя по ID
function showUserCardById(userId) {
    fetch('/api/users/' + userId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) {
                showErrorMessage(data.error);
                return;
            }

            var statusText = data.is_active ? 'Активен' : 'Заблокирован';
            var statusColor = data.is_active ? 'text-success' : 'text-danger';

            var html = '<div class="text-center">' +
                '<div class="avatar-circle mx-auto mb-3" style="width:80px;height:80px;font-size:32px">' + (data.full_name||'?').charAt(0) + '</div>' +
                '<h4>' + data.full_name + '</h4>' +
                '<p class="text-muted">' + data.role + '</p>' +
                '<p class="' + statusColor + '"><strong>' + statusText + '</strong></p>' +
                '<hr>' +
                '<p><i class="bi bi-person"></i> Логин: <strong>' + (data.login || '-') + '</strong></p>' +
                '<p><i class="bi bi-building"></i> Отдел: ' + (data.department || '-') + '</p>' +
                '<p><i class="bi bi-envelope"></i> Email: ' + (data.email || '-') + '</p>' +
                '<p><i class="bi bi-phone"></i> Телефон: ' + (data.phone || '-') + '</p>';

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

// Редактирование пользователя по ID
function editUserById(userId) {
    fetch('/api/users/' + userId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) {
                showErrorMessage(data.error);
                return;
            }

            $('#editFullName').val(data.full_name || '');
            $('#editRole').val(data.role || 'Пользователь');
            $('#editEmail').val(data.email || '');
            $('#editPhone').val(data.phone || '');
            $('#editDepartment').val(data.department || '');
            $('#editLogin').val(data.login || '');
            $('#editIsActive').prop('checked', data.is_active);

            fetch('/api/users/' + userId + '/credentials')
                .then(function(r) { return r.json(); })
                .then(function(credData) {
                    if (credData.success && credData.credentials) {
                        $('#editPassword').val(credData.credentials.password);
                    } else {
                        $('#editPassword').val('');
                    }
                })
                .catch(function() {
                    $('#editPassword').val('');
                });

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

// Показать модальное окно добавления пользователя
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

// Генерация селектора аватаров для нового пользователя
function generateAvatarSelectorForNewUser() {
    var $selector = $('#avatarSelector');
    $selector.empty();

    avatarColors.forEach(function(color, index) {
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

// Выбор аватара для нового пользователя (явная передача this)
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
    if (el) {
        el.classList.remove('border-light');
        el.classList.add('border-primary');
    }
}

// Обновление селектора аватаров при вводе имени
function updateAvatarSelectorForName(fullName) {
    var $selector = $('#avatarSelector');
    var initials = fullName.charAt(0).toUpperCase();
    var selectedAvatar = $('#avatarInput').val();

    $selector.find('.avatar-option').each(function(index) {
        $(this).text(initials);

        var avatarName = 'avatar_' + index + '.png';
        if (avatarName === selectedAvatar) {
            $(this).addClass('border-primary').removeClass('border-light');
        } else {
            $(this).addClass('border-light').removeClass('border-primary');
        }
    });
}

// Печать учетных данных пользователя
function printUserCredentials(userId) {
    fetch('/api/users/' + userId + '/credentials')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) {
                showErrorMessage(data.error);
                return;
            }

            var creds = data.credentials;

            var printWindow = window.open('', '_blank', 'width=400,height=300');
            printWindow.document.write('<html><head><title>Учетные данные</title>');
            printWindow.document.write('<style>');
            printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
            printWindow.document.write('h3 { color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px; }');
            printWindow.document.write('.cred { margin: 10px 0; font-size: 16px; }');
            printWindow.document.write('.cred strong { display: inline-block; width: 80px; }');
            printWindow.document.write('@media print { button { display: none; } }');
            printWindow.document.write('</style>');
            printWindow.document.write('</head><body>');
            printWindow.document.write('<h3>Учетные данные пользователя</h3>');
            printWindow.document.write('<p class="cred"><strong>ФИО:</strong> ' + creds.full_name + '</p>');
            printWindow.document.write('<p class="cred"><strong>Логин:</strong> ' + creds.login + '</p>');
            printWindow.document.write('<p class="cred"><strong>Пароль:</strong> ' + creds.password + '</p>');
            printWindow.document.write('<br><button onclick="window.print()">Распечатать</button>');
            printWindow.document.write('</body></html>');
            printWindow.document.close();
        });
}

// Блокировка/разблокировка пользователя
function toggleUserStatus(userId) {
    Swal.fire({
        title: 'Изменить статус?',
        text: 'Вы уверены, что хотите заблокировать/разблокировать этого пользователя?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да',
        cancelButtonText: 'Нет'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/users/' + userId + '/toggle', {
                method: 'POST'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: data.message, timer: 2000, showConfirmButton: false });
                    if (typeof loadFilters === 'function') loadFilters();
                    loadUsersPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

// Удаление пользователя
function deleteUser(userId) {
    Swal.fire({
        title: 'Удалить пользователя?',
        text: 'Это действие нельзя отменить! Все данные пользователя будут удалены.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/users/' + userId, {
                method: 'DELETE'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Пользователь удален!',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    if (typeof loadFilters === 'function') loadFilters();
                    loadUsersPage();
                } else {
                    showErrorMessage(data.error);
                }
            })
            .catch(function(error) {
                showErrorMessage('Ошибка удаления пользователя');
            });
        }
    });
}

// ============= ИМПОРТ ПОЛЬЗОВАТЕЛЕЙ ИЗ ДРУГОЙ БД =============
function showImportUsersModal() {
    Swal.fire({
        title: 'Импорт пользователей',
        html:
            '<div class="text-start">' +
            '<p>Выберите файл базы данных SQLite (<code>.db</code>, <code>.sqlite</code>) ' +
            'с таблицей <code>users</code>.</p>' +
            '<div class="alert alert-info small mb-3">' +
            '<i class="bi bi-info-circle"></i> ' +
            'Поддерживаются две схемы:<br>' +
            '<b>1.</b> Новая Support Active (<code>full_name</code>, <code>role</code>...).<br>' +
            '<b>2.</b> Старая (<code>family</code>, <code>name</code>, <code>father</code>, ' +
            '<code>depart</code>, <code>groupUser</code>, <code>pass</code>, <code>number</code>...).<br>' +
            'Пользователи с уже существующими логинами пропускаются.' +
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
            var fileInput = document.getElementById('importDbFile');
            if (!fileInput.files || !fileInput.files[0]) {
                Swal.showValidationMessage('Выберите файл базы данных');
                return false;
            }
            return fileInput.files[0];
        }
    }).then(function(result) {
        if (!result.isConfirmed) return;

        var file = result.value;
        var formData = new FormData();
        formData.append('database_file', file);

        Swal.fire({
            title: 'Импорт...',
            html: 'Обработка файла <strong>' + file.name + '</strong>...<br>Пожалуйста, подождите.',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); }
        });

        fetch('/api/users/import', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                var errorsHtml = '';
                if (data.errors && data.errors.length > 0) {
                    errorsHtml = '<hr><div class="text-start small text-muted" style="max-height: 200px; overflow-y: auto;">' +
                        '<strong>Замечания:</strong><br>' +
                        data.errors.slice(0, 10).map(escapeHtml).join('<br>') +
                        (data.errors.length > 10 ? '<br>...и ещё ' + (data.errors.length - 10) : '') +
                        '</div>';
                }

                var schemaLabel = '';
                if (data.schema === 'legacy') {
                    schemaLabel = '<p class="small text-muted mb-2"><i class="bi bi-info-circle"></i> ' +
                                  'Определена <b>старая схема</b> базы данных</p>';
                } else if (data.schema === 'support_active') {
                    schemaLabel = '<p class="small text-muted mb-2"><i class="bi bi-info-circle"></i> ' +
                                  'Определена <b>новая схема</b> Support Active</p>';
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Импорт завершён',
                    html:
                        '<div class="text-start">' +
                        schemaLabel +
                        '<p><i class="bi bi-check-circle text-success"></i> ' +
                        '<strong>Импортировано:</strong> ' + data.imported + '</p>' +
                        '<p><i class="bi bi-slash-circle text-warning"></i> ' +
                        '<strong>Пропущено (дубликаты/ошибки):</strong> ' + data.skipped + '</p>' +
                        '<p><i class="bi bi-file-earmark-text text-info"></i> ' +
                        '<strong>Всего в файле:</strong> ' + data.total + '</p>' +
                        errorsHtml +
                        '</div>',
                    confirmButtonText: 'ОК',
                    customClass: { popup: 'swal-wide' }
                });
                loadUsersPage();
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка импорта',
                    html: '<div class="text-start">' + escapeHtml(data.error || 'Неизвестная ошибка') + '</div>'
                });
            }
        })
        .catch(function(err) {
            console.error('Import error:', err);
            Swal.fire({ icon: 'error', title: 'Ошибка', text: 'Не удалось выполнить импорт' });
        });
    });
}

// ============= РЕДАКТИРОВАНИЕ ПРОФИЛЯ =============

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

function editUserProfile() {
    fetch('/api/current_user').then(function(r) { return r.json(); }).then(function(data) {
        $('#editFullName').val(data.full_name||'');
        $('#editRole').val(data.role||'Пользователь');
        $('#editEmail').val(data.email||'');
        $('#editPhone').val(data.phone||'');
        $('#editDepartment').val(data.department||'');
        $('#editLogin').val(data.login || '');
        $('#editPassword').val('');
        $('#avatarInput').val(data.avatar||'');

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

function updateAvatarPreview(avatar, fullName) {
    var initials = '?';
    if (fullName && fullName.trim().length > 0) {
        initials = fullName.trim().charAt(0).toUpperCase();
    }
    var colorIndex = 0;
    if (fullName && fullName.trim().length > 0) {
        colorIndex = fullName.trim().length % avatarColors.length;
    }
    $('#editUserAvatar').css({
        'background-image': 'none',
        'background-color': avatarColors[colorIndex],
        'color': 'white'
    }).text(initials);
}

function generateAvatarSelector(selectedAvatar, fullName) {
    var $selector = $('#avatarSelector');
    $selector.empty();
    var initials = '?';
    if (fullName && fullName.trim().length > 0) {
        initials = fullName.trim().charAt(0).toUpperCase();
    }
    avatarColors.forEach(function(color, index) {
        var avatarName = 'avatar_' + index + '.png';
        var isSelected = selectedAvatar === avatarName;
        $selector.append(
            '<div class="avatar-option ' +
            (isSelected ? 'border border-3 border-primary' : 'border border-2 border-light') +
            '" style="width:50px;height:50px;border-radius:50%;background:' + color + ';' +
            'color:white;display:flex;align-items:center;justify-content:center;' +
            'font-size:20px;font-weight:bold;cursor:pointer;" ' +
            'onclick="selectAvatar(\'' + avatarName + '\',\'' + color + '\',\'' + initials + '\', this)">' +
            initials + '</div>'
        );
    });
}

// Явная передача элемента (this) вместо event.currentTarget
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
    if (el) {
        el.classList.remove('border-light');
        el.classList.add('border-primary');
    }
}

function changeAvatar() {
    document.getElementById('avatarFileInput').click();
}

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
        if (k !== 'avatar_file') {
            data[k] = v;
        }
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

            fetch('/api/upload_avatar', {
                method: 'POST',
                body: fileFormData
            })
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
            if ($('#otherPagesBlock').is(':visible')) {
                loadUsersPage();
            }
        } else {
            Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
        }
    });
}

console.log('Users module loaded');