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
        $('#taskNumber').text(taskId);
        $('#taskDetails').html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка...</p></div>'
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

        var html = '';

        // ---- Вкладки ----
        html += '<ul class="nav nav-tabs task-tabs" role="tablist">';
        html += '<li class="nav-item"><a class="nav-link active" data-tab="details" onclick="switchTaskTab(\'details\')">' +
                '<i class="bi bi-info-circle"></i> Детали</a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="comments" onclick="switchTaskTab(\'comments\')">' +
                '<i class="bi bi-chat-dots"></i> Комментарии' +
                ' <span class="badge" id="commentsBadge"' + (commentsCount > 0 ? '' : ' style="display:none"') + '>' + commentsCount + '</span></a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="attachments" onclick="switchTaskTab(\'attachments\')">' +
                '<i class="bi bi-paperclip"></i> Вложения' +
                ' <span class="badge" id="attachmentsBadge"' + (attachCount > 0 ? '' : ' style="display:none"') + '>' + attachCount + '</span></a></li>';
        html += '<li class="nav-item"><a class="nav-link" data-tab="history" onclick="switchTaskTab(\'history\')">' +
                '<i class="bi bi-clock-history"></i> История' +
                (histCount > 0 ? ' <span class="badge">' + histCount + '</span>' : '') + '</a></li>';
        html += '</ul>';

        // ---- Детали ----
        html += '<div class="task-tab-pane active" data-tab-content="details">';
        html += '<div class="row">';
        html += '<div class="col-md-6">' +
            '<p><strong>Дата создания:</strong> ' + utils.formatDate(task.created_date) + '</p>';

        if (task.status !== 'Выполнено' && task.status !== 'Отменено' && task.deadline) {
            var dl = new Date(task.deadline.replace(' ', 'T'));
            var now = new Date();
            if (dl < now) {
                html += '<p><strong>Срок:</strong> <span class="text-danger fw-bold">' +
                        utils.formatDate(task.deadline) + ' (Просрочена)</span></p>';
            } else if ((dl - now) / 3600000 < 24) {
                html += '<p><strong>Срок:</strong> <span class="text-warning fw-bold">' +
                        utils.formatDate(task.deadline) + ' (Скоро истекает)</span></p>';
            } else {
                html += '<p><strong>Срок:</strong> ' + utils.formatDate(task.deadline) + '</p>';
            }
        } else {
            html += '<p><strong>Срок:</strong> ' + utils.formatDate(task.deadline) + '</p>';
        }
        html += '<p><strong>От кого:</strong> ' + utils.escapeHtml(task.from_user || '-') + '</p>' +
                '<p><strong>Кабинет:</strong> ' + utils.escapeHtml(task.cabinet || '-') + '</p></div>';

        html += '<div class="col-md-6">' +
            '<p><strong>Статус:</strong> <span class="status-badge ' + statusClass + '">' +
            utils.escapeHtml(task.status) + '</span></p>' +
            '<p><strong>Тип работы:</strong> ' + utils.escapeHtml(task.work_type || '-') + '</p>' +
            '<p><strong>Приоритет:</strong> ' + utils.escapeHtml(task.priority || 'Средний') + '</p>' +
            '<p><strong>Исполнитель:</strong> ' + utils.escapeHtml(task.executor || '-') + '</p>' +
            '<p><strong>Помощник:</strong> ' + utils.escapeHtml(task.assistant || '-') + '</p></div>';

        html += '<div class="col-12"><hr><h6>Описание:</h6>' +
                '<div class="p-3 bg-light rounded">' +
                utils.escapeHtml(task.description || '-') + '</div></div>';

        if (task.completed_date) {
            html += '<div class="col-12 mt-3"><p class="text-success"><strong>Выполнено:</strong> ' +
                    utils.formatDate(task.completed_date) + '</p></div>';
        }
        html += '</div></div>';

        // ---- Комментарии ----
        html += '<div class="task-tab-pane" data-tab-content="comments">';
        html += '<div id="commentsList"><div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div></div>';
        html += '<hr>';
        html += '<div class="comment-form">';
        html += '<label class="form-label">Новый комментарий</label>';
        html += '<textarea class="form-control" id="newCommentText" rows="3" placeholder="Введите комментарий..."></textarea>';
        html += '<div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">';
        if (window.currentUserRole === 'Администратор' || window.currentUserRole === 'Техник') {
            html += '<div class="form-check">' +
                    '<input class="form-check-input" type="checkbox" id="commentInternal">' +
                    '<label class="form-check-label small" for="commentInternal">' +
                    'Внутренний (виден только техникам и админам)</label></div>';
        } else {
            html += '<div></div>';
        }
        html += '<button type="button" class="btn btn-primary btn-sm" id="submitCommentBtn" onclick="submitComment(this)">' +
                '<i class="bi bi-send"></i> Отправить</button>';
        html += '</div></div>';
        html += '</div>';

        // ---- Вложения ----
        html += '<div class="task-tab-pane" data-tab-content="attachments">';
        html += '<div class="attachments-drop-zone" id="dropZone">' +
                '<i class="bi bi-cloud-arrow-up"></i>' +
                '<p><strong>Перетащите файлы сюда</strong> или нажмите для выбора</p>' +
                '<small>Изображения, PDF, документы, архивы. Макс. 10 МБ на файл.</small>' +
                '</div>';
        html += '<input type="file" id="attachFileInput" multiple style="display:none;">';
        html += '<div class="upload-progress" id="uploadProgress">' +
                '<div class="upload-progress-bar" id="uploadProgressBar"></div></div>';
        html += '<div id="attachmentsList"></div>';
        html += '</div>';

        // ---- История ----
        html += '<div class="task-tab-pane" data-tab-content="history">';
        if (history.length > 0) {
            html += '<div class="table-responsive"><table class="table table-sm table-striped mb-0">';
            html += '<thead><tr><th style="width:140px">Когда</th><th>Кто</th><th>Что</th><th>Было</th><th>Стало</th></tr></thead><tbody>';
            history.forEach(function(h) {
                html += '<tr>' +
                    '<td><small>' + utils.formatDate(h.created_at) + '</small></td>' +
                    '<td><small>' + utils.escapeHtml(h.user_name || '-') + '</small></td>' +
                    '<td><strong>' + utils.escapeHtml(h.field_name || '') + '</strong></td>' +
                    '<td><small class="text-muted">' +
                    utils.escapeHtml(utils.truncateText(h.old_value || '-', 30)) + '</small></td>' +
                    '<td><small class="text-success">' +
                    utils.escapeHtml(utils.truncateText(h.new_value || '-', 30)) + '</small></td>' +
                    '</tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<div class="empty-state"><i class="bi bi-clock-history"></i>' +
                    '<p>Изменений пока не было</p></div>';
        }
        html += '</div>';

        $('#taskDetails').html(html);
        $('#btnCloseTask').toggle(canClose);
        $('#btnTakeTask').toggle(canTake);
        $('#btnDeleteTask').toggle(canDelete);

        // Подгрузка вкладок
        if (tid) {
            try { if (window.App.Comments) window.App.Comments.load(tid); }
            catch (e) { console.error('[task_details] loadComments:', e); }

            try { if (window.App.Attachments) window.App.Attachments.load(tid); }
            catch (e) { console.error('[task_details] loadAttachments:', e); }
        } else {
            console.error('[task_details] Не удалось определить ID заявки');
        }
    }

    // ============= ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК =============
    function switchTaskTab(name) {
        $('.task-tabs .nav-link').removeClass('active');
        $('.task-tabs .nav-link[data-tab="' + name + '"]').addClass('active');
        $('.task-tab-pane').removeClass('active');
        $('.task-tab-pane[data-tab-content="' + name + '"]').addClass('active');
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
                    Swal.fire({ icon: 'success', title: 'Заявка закрыта!',
                                timer: 1500, showConfirmButton: false });
                    if (window.App.Tasks) window.App.Tasks.refreshData();
                } else {
                    utils.showErrorMessage(data.error);
                }
            });
    }

    // ============= УДАЛЕНИЕ ЗАЯВКИ (только Администратор) =============
    function deleteCurrentTask() {
        if (!state.currentTaskId) return;

        // Двойное подтверждение — критичное действие
        Swal.fire({
            icon: 'warning',
            title: 'Удалить заявку?',
            html:
                '<p>Заявка <strong>№' + state.currentTaskId + '</strong> будет удалена безвозвратно.</p>' +
                '<p class="text-danger small mb-0">' +
                '<i class="bi bi-exclamation-triangle"></i> ' +
                'Вместе с заявкой удалятся все её комментарии, вложения и история.' +
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
            text: 'Заявка №' + state.currentTaskId + ' будет переведена в статус "В работе"',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да, взять в работу',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd'
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/task/' + state.currentTaskId + '/take', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        $('#viewTaskModal').modal('hide');
                        Swal.fire({ icon: 'success', title: 'Заявка взята в работу!',
                                    timer: 1500, showConfirmButton: false });
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

    console.log('[task_details] Загружено');
})();