// static/js/task_details.js
// Модалка заявки: Детали / Комментарии / Вложения / История

(function() {
    'use strict';

    if (!window.App) {
        console.error('[task_details] App не инициализирован');
        return;
    }

    var api = window.App.register('TaskDetails');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============= ОТКРЫТИЕ МОДАЛКИ =============
    function viewTask(taskId) {
        state.currentTaskId = taskId;

        // Заполняем шапку сразу (номер), остальное заполнит displayTaskDetails
        $('#taskModalNumber').text('#' + taskId);
        $('#taskModalTitle').text('Загрузка...');
        $('#taskModalMetaDate').text('—');
        $('#taskModalMetaStatus')
            .attr('class', 'status-badge status-new')
            .text('Загрузка...');

        $('#taskDetails').html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border" style="color:var(--m-accent)"></div>' +
            '<p class="mt-2 text-muted">Загрузка...</p></div>'
        );

        $('#viewTaskModal').modal('show');

        fetch('/api/task/' + taskId)
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(task) {
                if (task.error) {
                    utils.showErrorMessage(task.error);
                    $('#viewTaskModal').modal('hide');
                    return;
                }
                try {
                    displayTaskDetails(task);
                } catch (err) {
                    console.error('[task_details] render error:', err);
                    utils.showErrorMessage('Ошибка отрисовки заявки: ' + err.message);
                    $('#viewTaskModal').modal('hide');
                }
            })
            .catch(function(err) {
                console.error('[task_details] viewTask error:', err);
                utils.showErrorMessage('Не удалось загрузить заявку');
                $('#viewTaskModal').modal('hide');
            });
    }

    // ============= ОТРИСОВКА ДЕТАЛЕЙ =============
    function displayTaskDetails(task) {
        task = task || {};

        var tid = (state.currentTaskId) ? state.currentTaskId : (task.id || 0);

        var history = Array.isArray(task.history) ? task.history : [];
        var commentsCount = task.comments_count || 0;
        var attachCount = task.attachments_count || 0;
        var histCount = history.length;

        var statusClass = utils.getStatusClass(task.status);
        var canClose = task.status !== 'Выполнено' && task.status !== 'Отменено';
        var canTake = false;
        var canDelete = (window.currentUserRole === 'Администратор');

        if (task.status === 'Новое') {
            if (window.currentUserRole === 'Администратор') {
                canTake = true;
            } else if (window.currentUserRole === 'Техник') {
                var currentName = window.currentUserFullName || '';
                if (!task.executor || task.executor === currentName) canTake = true;
            }
        }
        if (window.currentUserRole === 'Пользователь') {
            canClose = false;
            canTake = false;
            canDelete = false;
        }

        // ---------- Шапка модалки ----------
        $('#taskModalNumber').text('#' + tid);
        $('#taskModalTitle').text(task.description || 'Без описания');

        var dateStr = task.created_date ? utils.formatDate(task.created_date) : '—';
        $('#taskModalMetaDate').text('📅 ' + dateStr);

        $('#taskModalMetaStatus')
            .attr('class', 'status-badge ' + statusClass)
            .text(task.status || 'Новое');

        // ---------- Рендер контента ----------
        var html = '';

        // --- Табы ---
        html += '<ul class="nav nav-tabs task-tabs" role="tablist">';
        html += '<li class="nav-item"><a class="nav-link active" data-tab="details" ' +
                'onclick="switchTaskTab(\'details\')">' +
                '<i class="bi bi-info-circle"></i> Детали</a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="comments" ' +
                'onclick="switchTaskTab(\'comments\')">' +
                '<i class="bi bi-chat-dots"></i> Комментарии' +
                ' <span class="badge" id="commentsBadge"' +
                (commentsCount > 0 ? '' : ' style="display:none"') + '>' +
                commentsCount + '</span></a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="attachments" ' +
                'onclick="switchTaskTab(\'attachments\')">' +
                '<i class="bi bi-paperclip"></i> Вложения' +
                ' <span class="badge" id="attachmentsBadge"' +
                (attachCount > 0 ? '' : ' style="display:none"') + '>' +
                attachCount + '</span></a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="history" ' +
                'onclick="switchTaskTab(\'history\')">' +
                '<i class="bi bi-clock-history"></i> История' +
                (histCount > 0 ? ' <span class="badge">' + histCount + '</span>' : '') +
                '</a></li>';
        html += '</ul>';

        // --- Детали ---
        html += '<div class="task-tab-pane active" data-tab-content="details">';

        var deadlineHtml = utils.formatDate(task.deadline);
        if (task.status !== 'Выполнено' && task.status !== 'Отменено' && task.deadline) {
            var dl = new Date(task.deadline.replace(' ', 'T'));
            var now = new Date();
            if (dl < now) {
                deadlineHtml = '<span style="color:var(--m-danger);font-weight:600">' +
                    utils.formatDate(task.deadline) + ' (Просрочена)</span>';
            } else if ((dl - now) / 3600000 < 24) {
                deadlineHtml = '<span style="color:var(--m-warning);font-weight:600">' +
                    utils.formatDate(task.deadline) + ' (Скоро истекает)</span>';
            }
        }

        var priorityColor = '#71717a';
        if (task.priority === 'Высокий') priorityColor = 'var(--m-danger)';
        else if (task.priority === 'Средний') priorityColor = '#b45309';
        else if (task.priority === 'Низкий') priorityColor = '#047857';

        html += '<div class="m-detail-grid">';
        html += '<div class="m-detail-item">' +
                '<div class="label">Дата создания</div>' +
                '<div class="value">' + utils.escapeHtml(dateStr) + '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Срок</div>' +
                '<div class="value">' + deadlineHtml + '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">От кого</div>' +
                '<div class="value">' + utils.escapeHtml(task.from_user || '—') +
                '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Кабинет</div>' +
                '<div class="value">' + utils.escapeHtml(task.cabinet || '—') +
                '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Тип работы</div>' +
                '<div class="value">' + utils.escapeHtml(task.work_type || '—') +
                '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Приоритет</div>' +
                '<div class="value" style="color:' + priorityColor + '">' +
                utils.escapeHtml(task.priority || 'Средний') + '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Исполнитель</div>' +
                '<div class="value">' +
                utils.escapeHtml(task.executor || 'Не назначен') +
                '</div></div>';
        html += '<div class="m-detail-item">' +
                '<div class="label">Помощник</div>' +
                '<div class="value">' +
                utils.escapeHtml(task.assistant || 'Не назначен') +
                '</div></div>';
        html += '</div>';

        html += '<div class="m-desc-block">' +
                '<h3>Описание</h3>' +
                '<p>' + utils.escapeHtml(task.description || '—') + '</p></div>';

        if (task.completed_date) {
            html += '<div class="m-desc-block" ' +
                    'style="background:var(--m-success-soft);border-color:transparent">' +
                    '<h3 style="color:#047857">Выполнено</h3>' +
                    '<p style="color:#047857">' +
                    utils.escapeHtml(utils.formatDate(task.completed_date)) +
                    '</p></div>';
        }

        html += '</div>'; // end details

        // --- Комментарии ---
        html += '<div class="task-tab-pane" data-tab-content="comments">';
        html += '<div id="commentsList"><div class="text-center py-4">' +
                '<div class="spinner-border spinner-border-sm" ' +
                'style="color:var(--m-accent)"></div></div></div>';
        html += '<div class="m-comment-form comment-form">';
        html += '<label class="form-label">Новый комментарий</label>';
        html += '<textarea class="form-control" id="newCommentText" rows="3" ' +
                'placeholder="Введите комментарий..."></textarea>';
        html += '<div class="m-form-footer">';
        if (window.currentUserRole === 'Администратор' ||
            window.currentUserRole === 'Техник') {
            html += '<label class="m-switch">' +
                    '<input type="checkbox" id="commentInternal">' +
                    '<span>Внутренний (виден только техникам и админам)</span>' +
                    '</label>';
        } else {
            html += '<div></div>';
        }
        html += '<button type="button" class="m-btn m-btn-primary" ' +
                'id="submitCommentBtn" onclick="submitComment(this)">' +
                '<i class="bi bi-send"></i> Отправить</button>';
        html += '</div></div>';
        html += '</div>'; // end comments

        // --- Вложения ---
        html += '<div class="task-tab-pane" data-tab-content="attachments">';
        html += '<div class="m-drop-zone attachments-drop-zone" id="dropZone">' +
                '<i class="bi bi-cloud-arrow-up"></i>' +
                '<p>Перетащите файлы сюда</p>' +
                '<small>или нажмите для выбора. Изображения, PDF, документы. ' +
                'Макс. 10 МБ.</small>' +
                '</div>';
        html += '<input type="file" id="attachFileInput" multiple style="display:none;">';
        html += '<div class="m-upload-progress upload-progress" id="uploadProgress">' +
                '<div class="m-upload-progress-bar upload-progress-bar" ' +
                'id="uploadProgressBar"></div></div>';
        html += '<div id="attachmentsList" class="mt-3"></div>';
        html += '</div>'; // end attachments

        // --- История ---
        html += '<div class="task-tab-pane" data-tab-content="history">';
        if (history.length > 0) {
            html += '<div class="m-history-filters">' +
                    '<button class="m-history-filter active">Все</button>' +
                    '<button class="m-history-filter">Изменения статуса</button>' +
                    '<button class="m-history-filter">Изменения исполнителя</button>' +
                    '</div>';
            html += '<div class="m-timeline">';
            history.forEach(function(h, idx) {
                var cls = (h.field_name === 'Статус' && idx === 0) ? 'success' : '';
                html += '<div class="m-tl-item ' + cls + '">' +
                        '<div class="m-tl-dot"></div>' +
                        '<div class="m-tl-head">' +
                        '<span class="m-tl-author">' +
                        utils.escapeHtml(h.user_name || '—') + '</span>' +
                        '<span class="m-tl-time">' +
                        utils.formatDate(h.created_at) + '</span>' +
                        '</div>' +
                        '<div class="m-tl-text">' +
                        '<strong>' + utils.escapeHtml(h.field_name || '') +
                        ':</strong> ' +
                        utils.escapeHtml(h.old_value || '—') + ' → ' +
                        utils.escapeHtml(h.new_value || '—') +
                        '</div></div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-state">' +
                    '<i class="bi bi-clock-history"></i>' +
                    '<p>Изменений пока не было</p></div>';
        }
        html += '</div>'; // end history

        $('#taskDetails').html(html);

        // Кнопки футера
        $('#btnCloseTask').toggle(canClose);
        $('#btnTakeTask').toggle(canTake);
        $('#btnDeleteTask').toggle(canDelete);

        // Загрузка вкладок
        if (tid) {
            try {
                if (window.App.Comments) window.App.Comments.load(tid);
            } catch (e) {
                console.error('[task_details] loadComments:', e);
            }

            try {
                if (window.App.Attachments) window.App.Attachments.load(tid);
            } catch (e) {
                console.error('[task_details] loadAttachments:', e);
            }
        } else {
            console.error('[task_details] Не удалось определить ID заявки');
        }
    }

    // ============= ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК =============
    function switchTaskTab(name) {
        $('#viewTaskModal .task-tabs .nav-link').removeClass('active');
        $('#viewTaskModal .task-tabs .nav-link[data-tab="' + name + '"]')
            .addClass('active');
        $('#viewTaskModal .task-tab-pane').removeClass('active');
        $('#viewTaskModal .task-tab-pane[data-tab-content="' + name + '"]')
            .addClass('active');
    }

    // ============= ЗАКРЫТИЕ ЗАЯВКИ =============
    function closeCurrentTask() {
        if (!state.currentTaskId) return;
        Swal.fire({
            title: 'Закрыть заявку?',
            text: 'Заявка №' + state.currentTaskId,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Нет'
        }).then(function(result) {
            if (result.isConfirmed) executeCloseTask(state.currentTaskId);
        });
    }

    function executeCloseTask(taskId) {
        fetch('/api/close_task/' + taskId, { method: 'POST' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    $('#viewTaskModal').modal('hide');
                    Swal.fire({
                        icon: 'success',
                        title: 'Заявка закрыта!',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    if (window.App.Tasks) window.App.Tasks.refreshData();
                } else {
                    utils.showErrorMessage(data.error);
                }
            });
    }

    // ============= УДАЛЕНИЕ ЗАЯВКИ =============
    function deleteCurrentTask() {
        if (!state.currentTaskId) return;

        Swal.fire({
            icon: 'warning',
            title: 'Удалить заявку?',
            html:
                '<p>Заявка <strong>№' + state.currentTaskId +
                '</strong> будет удалена безвозвратно.</p>' +
                '<p class="text-danger small mb-0">' +
                '<i class="bi bi-exclamation-triangle"></i> ' +
                'Вместе с заявкой удалятся все её комментарии, ' +
                'вложения и история.' +
                '</p>',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            focusCancel: true
        }).then(function(result) {
            if (!result.isConfirmed) return;
            executeDeleteTask(state.currentTaskId);
        });
    }

    function executeDeleteTask(taskId) {
        Swal.fire({
            title: 'Удаление...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); }
        });

        fetch('/api/delete_task/' + taskId, { method: 'DELETE' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                Swal.close();
                if (data.success) {
                    $('#viewTaskModal').modal('hide');
                    Swal.fire({
                        icon: 'success',
                        title: 'Заявка удалена',
                        text: 'Заявка №' + taskId,
                        timer: 1800,
                        showConfirmButton: false
                    });
                    if (window.App.Tasks) window.App.Tasks.refreshData();
                } else {
                    utils.showErrorMessage(data.error || 'Не удалось удалить заявку');
                }
            })
            .catch(function(err) {
                Swal.close();
                console.error('[task_details] delete error:', err);
                utils.showErrorMessage('Не удалось удалить заявку');
            });
    }

    // ============= ВЗЯТИЕ В РАБОТУ =============
    function takeTask() {
        if (!state.currentTaskId) return;

        Swal.fire({
            title: 'Взять заявку в работу?',
            text: 'Заявка №' + state.currentTaskId +
                  ' будет переведена в статус "В работе"',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да, взять в работу',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd'
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/task/' + state.currentTaskId + '/take',
                  { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        $('#viewTaskModal').modal('hide');
                        Swal.fire({
                            icon: 'success',
                            title: 'Заявка взята в работу!',
                            timer: 1500,
                            showConfirmButton: false
                        });
                        if (window.App.Tasks) window.App.Tasks.refreshData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function() {
                    utils.showErrorMessage('Не удалось взять заявку в работу');
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.view = viewTask;
    api.switchTab = switchTaskTab;
    api.closeCurrent = closeCurrentTask;
    api.deleteCurrent = deleteCurrentTask;
    api.take = takeTask;

    window.viewTask = viewTask;
    window.switchTaskTab = switchTaskTab;
    window.closeCurrentTask = closeCurrentTask;
    window.deleteCurrentTask = deleteCurrentTask;
    window.takeTask = takeTask;

    console.log('[task_details] Загружено (редизайн)');
})();