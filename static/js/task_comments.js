// static/js/task_comments.js
// Комментарии + @mentions (автокомплит и подсветка)

(function() {
    'use strict';

    if (!window.App) {
        console.error('[task_comments] App не инициализирован');
        return;
    }

    var api = window.App.register('Comments');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============================================================
    // АВТОКОМПЛИТ @ (состояние)
    // ============================================================
    var mentionBox = null;
    var mentionStart = -1;
    var mentionTimer = null;

    // ============================================================
    // ПОДСВЕТКА УПОМИНАНИЙ
    // ============================================================
    var MENTION_HL_RE = /@([^\s@,;:!?()\[\]{}<>]{2,40}(?:\s+[^\s@,;:!?()\[\]{}<>]{2,40}){0,2})/g;

    function highlightMentions(escapedText) {
        if (!escapedText) return '';
        return escapedText.replace(MENTION_HL_RE,
            '<span class="mention">@$1</span>');
    }

    // ============================================================
    // ЗАГРУЗКА
    // ============================================================
    function load(taskId) {
        if (!taskId || taskId === 'undefined' || taskId === 0) {
            $('#commentsList').html(
                '<div class="alert alert-warning">' +
                'Не удалось определить ID заявки</div>'
            );
            return;
        }

        $('#commentsList').html(
            '<div class="text-center py-4">' +
            '<div class="spinner-border spinner-border-sm" ' +
            'style="color:var(--m-accent)"></div></div>'
        );

        fetch('/api/tasks/' + taskId + '/comments')
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(list) {
                if (list && list.error) {
                    utils.showErrorMessage(list.error);
                    $('#commentsList').html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(list.error) + '</div>'
                    );
                    return;
                }
                render(list, taskId);
                updateBadge(list);
            })
            .catch(function(err) {
                console.error('[comments] load error:', err);
                $('#commentsList').html(
                    '<div class="alert alert-danger">' +
                    'Не удалось загрузить комментарии</div>'
                );
            });
    }

    // ============================================================
    // ОТРИСОВКА
    // ============================================================
    function render(list, taskId) {
        var $c = $('#commentsList');
        $c.empty();

        if (!Array.isArray(list) || list.length === 0) {
            $c.html('<div class="empty-state">' +
                    '<i class="bi bi-chat-dots"></i>' +
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
            var classes = 'comment' + (c.is_internal ? ' comment-internal' : '');

            var safeText = utils.escapeHtml(c.text);
            var textHtml = highlightMentions(safeText);

            var html = '<div class="' + classes + '" data-comment-id="' +
                       c.id + '">';
            html += '<div class="comment-avatar">' +
                    utils.escapeHtml(initials) + '</div>';
            html += '<div class="comment-body">';
            html += '<div class="comment-head">';
            html += '<div>';
            html += '<span class="comment-author">' +
                    utils.escapeHtml(c.user_name || 'Аноним') + '</span>';
            if (c.is_internal) {
                html += '<span class="comment-internal-badge">' +
                        '<i class="bi bi-lock-fill"></i> внутр.</span>';
            }
            html += '</div>';
            html += '<div class="d-flex align-items-center gap-2">';
            html += '<span class="comment-time">' +
                    utils.formatDate(c.created_at) + '</span>';
            if (canEdit || canDelete) {
                html += '<div class="comment-actions">';
                if (canEdit) {
                    html += '<button class="btn btn-outline-secondary" ' +
                            'onclick="editComment(' + c.id + ', ' +
                            taskId + ')" title="Редактировать">' +
                            '<i class="bi bi-pencil"></i></button>';
                }
                if (canDelete) {
                    html += '<button class="btn btn-outline-danger" ' +
                            'onclick="deleteComment(' + c.id + ', ' +
                            taskId + ')" title="Удалить">' +
                            '<i class="bi bi-trash"></i></button>';
                }
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div class="comment-text">' + textHtml + '</div>';
            html += '</div></div>';
            $c.append(html);
        });
    }

    // ============================================================
    // ОТПРАВКА
    // ============================================================
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
                    hideMentionBox();
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

    // ============================================================
    // УДАЛЕНИЕ / РЕДАКТИРОВАНИЕ
    // ============================================================
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

    function edit(commentId, taskId) {
        var $item = $('.comment[data-comment-id="' + commentId + '"]');
        var $text = $item.find('.comment-text');
        var oldText = $text.text();

        $text.html(
            '<textarea class="form-control form-control-sm mb-2" ' +
            'id="editCommentText">' +
            utils.escapeHtml(oldText) + '</textarea>' +
            '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-success" ' +
            'onclick="saveCommentEdit(' + commentId + ', ' + taskId + ')">' +
            '<i class="bi bi-check"></i> Сохранить</button>' +
            '<button class="btn btn-sm btn-secondary" ' +
            'onclick="loadComments(' + taskId + ')">Отмена</button>' +
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

    // ============================================================
    // БЕЙДЖ
    // ============================================================
    function updateBadge(list) {
        var cnt = Array.isArray(list) ? list.length : 0;
        var $badge = $('#commentsBadge');
        if ($badge.length === 0) return;
        if (cnt > 0) $badge.text(cnt).show();
        else $badge.hide();
    }

    // ============================================================
    // @MENTIONS — АВТОКОМПЛИТ
    // ============================================================
    function initMentionAutocomplete() {
        $(document)
            .off('input.mentions', '#newCommentText')
            .on('input.mentions', '#newCommentText', onCommentInput);

        $(document)
            .off('keydown.mentions', '#newCommentText')
            .on('keydown.mentions', '#newCommentText', onCommentKeydown);

        $(document)
            .off('click.mentions')
            .on('click.mentions', function(e) {
                if (!$(e.target).closest('.mention-box').length &&
                    !$(e.target).is('#newCommentText')) {
                    hideMentionBox();
                }
            });
    }

    function onCommentInput() {
        var el = this;
        var val = el.value;
        var pos = el.selectionStart;

        var before = val.slice(0, pos);
        var at = before.lastIndexOf('@');

        if (at === -1) { hideMentionBox(); return; }
        if (at > 0) {
            var prev = before[at - 1];
            if (!/[\s(\[{]/.test(prev)) { hideMentionBox(); return; }
        }

        var query = before.slice(at + 1);
        if (query.length < 2 || query.length > 60) {
            hideMentionBox();
            return;
        }
        if (/[,;:!?()\[\]{}<>]/.test(query)) {
            hideMentionBox();
            return;
        }

        mentionStart = at;

        clearTimeout(mentionTimer);
        mentionTimer = setTimeout(function() {
            fetchUsersForMention(query, at);
        }, 180);
    }

    function onCommentKeydown(e) {
        if (!mentionBox) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionBox();
            return;
        }

        var $items = mentionBox.find('.mention-item');
        var $active = $items.filter('.mention-item-active');
        var idx = $items.index($active);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            idx = (idx + 1) % $items.length;
            $items.removeClass('mention-item-active');
            $items.eq(idx).addClass('mention-item-active')
                .scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            idx = idx <= 0 ? $items.length - 1 : idx - 1;
            $items.removeClass('mention-item-active');
            $items.eq(idx).addClass('mention-item-active')
                .scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            var $target = $active.length ? $active : $items.first();
            if ($target.length) applyMention($target.data('name'));
        }
    }

    function fetchUsersForMention(query, at) {
        fetch('/api/users/search?q=' + encodeURIComponent(query))
            .then(function(r) { return r.json(); })
            .then(function(users) {
                if (!Array.isArray(users) || users.length === 0) {
                    hideMentionBox();
                    return;
                }
                showMentionBox(users, at);
            })
            .catch(function() { hideMentionBox(); });
    }

    function showMentionBox(users, at) {
        hideMentionBox();

        var $textarea = $('#newCommentText');
        if (!$textarea.length) return;

        var html = users.map(function(u, i) {
            var cls = 'mention-item' +
                (i === 0 ? ' mention-item-active' : '');
            return '<div class="' + cls + '" ' +
                   'data-name="' + utils.escapeHtml(u.full_name) + '">' +
                   '<i class="bi bi-person-circle me-1"></i>' +
                   '<strong>' + utils.escapeHtml(u.full_name) + '</strong>' +
                   (u.login
                       ? ' <small class="text-muted">@' +
                         utils.escapeHtml(u.login) + '</small>'
                       : '') +
                   '</div>';
        }).join('');

        mentionBox = $('<div class="mention-box">' + html + '</div>');

        var $wrapper = $textarea.closest('.comment-form');
        if ($wrapper.length === 0) {
            $wrapper = $textarea.parent();
        }
        $wrapper.css('position', 'relative');
        mentionBox.appendTo($wrapper);

        mentionBox.on('click', '.mention-item', function() {
            applyMention($(this).data('name'));
        });

        mentionBox.on('mouseenter', '.mention-item', function() {
            mentionBox.find('.mention-item')
                .removeClass('mention-item-active');
            $(this).addClass('mention-item-active');
        });
    }

    function applyMention(fullName) {
        var $textarea = $('#newCommentText');
        if (!$textarea.length || mentionStart < 0) return;

        var val = $textarea.val();
        var pos = $textarea[0].selectionStart;
        var before = val.slice(0, mentionStart);
        var after = val.slice(pos);
        var insert = '@' + fullName + ' ';

        $textarea.val(before + insert + after);
        var newPos = before.length + insert.length;
        $textarea[0].setSelectionRange(newPos, newPos);
        $textarea.focus();
        hideMentionBox();
    }

    function hideMentionBox() {
        if (mentionBox) { mentionBox.remove(); mentionBox = null; }
        mentionStart = -1;
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    $(document).ready(function() {
        initMentionAutocomplete();
    });

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.load = load;
    api.submit = submit;
    api.remove = remove;
    api.edit = edit;
    api.saveEdit = saveEdit;
    api.updateBadge = updateBadge;
    api.highlightMentions = highlightMentions;

    window.loadComments = load;
    window.submitComment = submit;
    window.deleteComment = remove;
    window.editComment = edit;
    window.saveCommentEdit = saveEdit;
    window.updateCommentsBadge = updateBadge;

    console.log('[task_comments] Загружено (v3: редизайн)');
})();