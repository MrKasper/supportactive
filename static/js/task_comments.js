// static/js/task_comments.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[task_comments] App не инициализирован');
        return;
    }

    var api = window.App.register('Comments');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============= ЗАГРУЗКА =============
    function load(taskId) {
        if (!taskId || taskId === 'undefined' || taskId === 0) {
            $('#commentsList').html('<div class="alert alert-warning">Не удалось определить ID заявки</div>');
            return;
        }

        $('#commentsList').html('<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>');

        fetch('/api/tasks/' + taskId + '/comments')
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(list) {
                if (list && list.error) {
                    utils.showErrorMessage(list.error);
                    $('#commentsList').html('<div class="alert alert-danger">' + utils.escapeHtml(list.error) + '</div>');
                    return;
                }
                render(list, taskId);
                updateBadge(list);
            })
            .catch(function(err) {
                console.error('[comments] load error:', err);
                $('#commentsList').html('<div class="alert alert-danger">Не удалось загрузить комментарии</div>');
            });
    }

    // ============= ОТРИСОВКА =============
    function render(list, taskId) {
        var $c = $('#commentsList');
        $c.empty();

        if (!Array.isArray(list) || list.length === 0) {
            $c.html('<div class="empty-state"><i class="bi bi-chat-dots"></i>' +
                    '<p>Комментариев пока нет</p></div>');
            return;
        }

        var currentUser = window.currentUserFullName || '';
        var isAdmin = window.currentUserRole === 'Администратор';

        list.forEach(function(c) {
            if (c.is_internal && window.currentUserRole === 'Пользователь') return;

            var initials = (c.user_name || '?').charAt(0).toUpperCase();
            var canDelete = isAdmin || c.user_name === currentUser;
            var canEdit = c.user_name === currentUser;
            var classes = 'comment-item' + (c.is_internal ? ' comment-internal' : '');

            var html = '<div class="' + classes + '" data-comment-id="' + c.id + '">';
            html += '<div class="comment-avatar">' + utils.escapeHtml(initials) + '</div>';
            html += '<div class="comment-body">';
            html += '<div class="comment-header">';
            html += '<div>';
            html += '<span class="comment-author">' + utils.escapeHtml(c.user_name || 'Аноним') + '</span>';
            if (c.is_internal) {
                html += '<span class="comment-internal-badge">' +
                        '<i class="bi bi-lock-fill"></i> внутр.</span>';
            }
            html += '</div>';
            html += '<div class="d-flex align-items-center gap-2">';
            html += '<span class="comment-time">' + utils.formatDate(c.created_at) + '</span>';
            if (canEdit || canDelete) {
                html += '<div class="comment-actions">';
                if (canEdit) {
                    html += '<button class="btn btn-outline-secondary" onclick="editComment(' +
                            c.id + ', ' + taskId + ')" title="Редактировать">' +
                            '<i class="bi bi-pencil"></i></button>';
                }
                if (canDelete) {
                    html += '<button class="btn btn-outline-danger" onclick="deleteComment(' +
                            c.id + ', ' + taskId + ')" title="Удалить">' +
                            '<i class="bi bi-trash"></i></button>';
                }
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div class="comment-text">' + utils.escapeHtml(c.text) + '</div>';
            html += '</div></div>';
            $c.append(html);
        });
    }

    // ============= ОТПРАВКА =============
    function submit(btn) {
        var text = $('#newCommentText').val().trim();
        if (!text) {
            utils.showErrorMessage('Введите текст комментария');
            return;
        }

        var isInternal = $('#commentInternal').is(':checked') ? 1 : 0;

        var $btn = $(btn);
        $btn.prop('disabled', true);
        var oldHtml = $btn.html();
        $btn.html('<span class="spinner-border spinner-border-sm"></span>');

        fetch('/api/tasks/' + state.currentTaskId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, is_internal: isInternal })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                $btn.prop('disabled', false).html(oldHtml);

                if (data.success) {
                    $('#newCommentText').val('');
                    $('#commentInternal').prop('checked', false);
                    load(state.currentTaskId);
                } else {
                    utils.showErrorMessage(data.error);
                }
            })
            .catch(function() {
                $btn.prop('disabled', false).html(oldHtml);
                utils.showErrorMessage('Ошибка отправки');
            });
    }

    // ============= УДАЛЕНИЕ =============
    function remove(commentId, taskId) {
        Swal.fire({
            title: 'Удалить комментарий?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/comments/' + commentId, { method: 'DELETE' })
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                    if (data.success) load(taskId);
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============= РЕДАКТИРОВАНИЕ =============
    function edit(commentId, taskId) {
        var $item = $('.comment-item[data-comment-id="' + commentId + '"]');
        var $text = $item.find('.comment-text');
        var oldText = $text.text();

        $text.html(
            '<textarea class="form-control form-control-sm mb-2" id="editCommentText">' +
            utils.escapeHtml(oldText) + '</textarea>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-success" onclick="saveCommentEdit(' + commentId + ', ' + taskId + ')">' +
            '<i class="bi bi-check"></i> Сохранить</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="loadComments(' + taskId + ')">Отмена</button>' +
            '</div>'
        );
    }

    function saveEdit(commentId, taskId) {
        var newText = $('#editCommentText').val().trim();
        if (!newText) {
            utils.showErrorMessage('Комментарий не может быть пустым');
            return;
        }

        fetch('/api/comments/' + commentId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newText })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) load(taskId);
                else utils.showErrorMessage(data.error);
            });
    }

    // ============= БЕЙДЖ =============
    function updateBadge(list) {
        var cnt = Array.isArray(list) ? list.length : 0;
        var $badge = $('#commentsBadge');
        if ($badge.length === 0) return;
        if (cnt > 0) $badge.text(cnt).show();
        else $badge.hide();
    }

    // ============= ЭКСПОРТ =============
    api.load = load;
    api.submit = submit;
    api.remove = remove;
    api.edit = edit;
    api.saveEdit = saveEdit;
    api.updateBadge = updateBadge;

    // Совместимость
    window.loadComments = load;
    window.submitComment = submit;
    window.deleteComment = remove;
    window.editComment = edit;
    window.saveCommentEdit = saveEdit;
    window.updateCommentsBadge = updateBadge;

    console.log('[task_comments] Загружено');
})();