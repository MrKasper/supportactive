// static/js/task_attachments.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[task_attachments] App не инициализирован');
        return;
    }

    var api = window.App.register('Attachments');
    var utils = window.App.utils;
    var state = window.App.state;

    // ============================================================
    // 🔧 ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ — ОДИН РАЗ ЧЕРЕЗ ДЕЛЕГИРОВАНИЕ
    // ============================================================
    function initDropZoneHandlers() {
        // --- Клик по dropZone — открыть диалог файла ---
        $(document)
            .off('click.attachDropZone', '#dropZone')
            .on('click.attachDropZone', '#dropZone', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $('#attachFileInput').trigger('click');
            });

        // --- Изменение input (выбор файлов) ---
        $(document)
            .off('change.attachInput', '#attachFileInput')
            .on('change.attachInput', '#attachFileInput', function() {
                if (this.files && this.files.length > 0) {
                    var tid = state.currentTaskId;
                    if (tid) uploadFiles(this.files, tid);
                    this.value = '';
                }
            });

        // --- Drag-and-drop ---
        $(document)
            .off('dragover.attachDropZone dragenter.attachDropZone', '#dropZone')
            .on('dragover.attachDropZone dragenter.attachDropZone', '#dropZone', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).addClass('drag-over');
            });

        $(document)
            .off('dragleave.attachDropZone drop.attachDropZone', '#dropZone')
            .on('dragleave.attachDropZone drop.attachDropZone', '#dropZone', function(e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).removeClass('drag-over');
            });

        $(document)
            .off('drop.attachDropZoneData', '#dropZone')
            .on('drop.attachDropZoneData', '#dropZone', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var files = e.originalEvent.dataTransfer.files;
                var tid = state.currentTaskId;
                if (files && files.length > 0 && tid) {
                    uploadFiles(files, tid);
                }
            });
    }

    // Инициализация один раз при загрузке
    $(document).ready(function() {
        initDropZoneHandlers();
    });
    initDropZoneHandlers();

    // ============================================================
    // ЗАГРУЗКА СПИСКА ВЛОЖЕНИЙ
    // ============================================================
    function load(taskId) {
        if (!taskId || taskId === 'undefined' || taskId === 0) {
            $('#attachmentsList').html('<div class="alert alert-warning">Не удалось определить ID заявки</div>');
            return;
        }

        $('#attachmentsList').html(
            '<div class="text-center py-4">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        fetch('/api/tasks/' + taskId + '/attachments')
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(list) {
                if (list && list.error) {
                    utils.showErrorMessage(list.error);
                    $('#attachmentsList').html(
                        '<div class="alert alert-danger">' + utils.escapeHtml(list.error) + '</div>'
                    );
                    return;
                }
                render(list, taskId);
                updateBadge(list);
            })
            .catch(function(err) {
                console.error('[attachments] load error:', err);
                $('#attachmentsList').html(
                    '<div class="alert alert-danger">Не удалось загрузить вложения</div>'
                );
            });
    }

    // ============================================================
    // ОТРИСОВКА
    // ============================================================
    function render(list, taskId) {
        var $c = $('#attachmentsList');
        $c.empty();

        if (!Array.isArray(list) || list.length === 0) {
            $c.html(
                '<div class="empty-state">' +
                '<i class="bi bi-paperclip"></i>' +
                '<p>Вложений пока нет</p>' +
                '</div>'
            );
            return;
        }

        var grid = $('<div class="attachments-grid"></div>');
        var isAdmin = window.currentUserRole === 'Администратор';
        var currentUser = window.currentUserFullName || '';

        list.forEach(function(a) {
            var isImage = (a.mime_type || '').startsWith('image/');
            var canDelete = isAdmin || a.user_name === currentUser;
            var exists = a.file_exists !== false;

            // ---------- Превью ----------
            var previewHtml;
            if (!exists) {
                previewHtml =
                    '<div class="attachment-preview" title="Файл отсутствует на диске">' +
                    '<i class="bi bi-exclamation-triangle text-warning"></i>' +
                    '</div>';
            } else if (isImage) {
                var safeName = utils.escapeHtml(a.original_name).replace(/'/g, '&#39;');
                previewHtml =
                    '<div class="attachment-preview" onclick="previewImage(' +
                    a.id + ', \'' + safeName + '\')">' +
                    '<img src="/api/attachments/' + a.id + '/preview" ' +
                    'alt="' + utils.escapeHtml(a.original_name) + '" ' +
                    'onerror="this.parentNode.innerHTML=\'<i class=&quot;bi bi-file-earmark-image&quot;></i>\'">' +
                    '</div>';
            } else {
                previewHtml =
                    '<div class="attachment-preview">' +
                    '<i class="bi ' + fileIcon(a.original_name) + '"></i>' +
                    '</div>';
            }

            // ---------- Действия ----------
            var actions = '<div class="attachment-actions">';
            if (exists) {
                // Скачивание: Content-Disposition формирует бэкенд.
                // Не используем атрибут download= (кириллица в имени может ломать клик).
                actions +=
                    '<a class="btn btn-sm btn-primary" ' +
                    'href="/api/attachments/' + a.id + '/download" ' +
                    'title="Скачать">' +
                    '<i class="bi bi-download"></i>' +
                    '</a>';
            }
            if (canDelete) {
                actions +=
                    '<button type="button" class="btn btn-sm btn-danger" ' +
                    'onclick="event.stopPropagation(); deleteAttachment(' +
                    a.id + ', ' + taskId + ')" title="Удалить">' +
                    '<i class="bi bi-trash"></i>' +
                    '</button>';
            }
            actions += '</div>';

            // ---------- Карточка ----------
            var card = '<div class="attachment-card' + (exists ? '' : ' attachment-missing') + '">' +
                actions + previewHtml +
                '<div class="attachment-info">' +
                '<span class="attachment-name" title="' + utils.escapeHtml(a.original_name) + '">' +
                utils.escapeHtml(a.original_name) +
                '</span>' +
                '<span class="attachment-meta">' +
                utils.formatSize(a.file_size) +
                ' • ' + utils.escapeHtml(a.user_name || '') +
                '</span>' +
                '</div>' +
                '</div>';

            grid.append(card);
        });

        $c.append(grid);
    }

    // ============================================================
    // ИКОНКА ФАЙЛА
    // ============================================================
    function fileIcon(filename) {
        var ext = (filename || '').split('.').pop().toLowerCase();
        if (['pdf'].includes(ext)) return 'bi-file-earmark-pdf';
        if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word';
        if (['xls', 'xlsx', 'csv'].includes(ext)) return 'bi-file-earmark-excel';
        if (['ppt', 'pptx'].includes(ext)) return 'bi-file-earmark-ppt';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'bi-file-earmark-zip';
        if (['txt', 'log', 'md'].includes(ext)) return 'bi-file-earmark-text';
        if (['json', 'xml'].includes(ext)) return 'bi-file-earmark-code';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'bi-file-earmark-image';
        return 'bi-file-earmark';
    }

    // ============================================================
    // ЗАГРУЗКА ФАЙЛОВ (несколько за раз, последовательно)
    // ============================================================
    function uploadFiles(files, taskId) {
        var total = files.length;
        var done = 0;
        var failed = [];

        $('#uploadProgress').addClass('active');
        $('#uploadProgressBar').css('width', '0%');

        var chain = Promise.resolve();

        Array.from(files).forEach(function(file) {
            chain = chain.then(function() {
                return uploadOneFile(file, taskId)
                    .then(function(ok) { if (!ok) failed.push(file.name); })
                    .then(function() {
                        done++;
                        var pct = Math.round((done / total) * 100);
                        $('#uploadProgressBar').css('width', pct + '%');
                    });
            });
        });

        chain.then(function() {
            setTimeout(function() {
                $('#uploadProgress').removeClass('active');
                $('#uploadProgressBar').css('width', '0%');
            }, 500);

            if (failed.length === 0) {
                Swal.fire({
                    icon: 'success',
                    title: 'Файлы загружены',
                    text: 'Загружено: ' + total,
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'Частично загружено',
                    html: 'Успешно: ' + (total - failed.length) + '<br>' +
                          'Ошибки: ' + failed.map(utils.escapeHtml).join(', ')
                });
            }

            load(taskId);
        });
    }

    function uploadOneFile(file, taskId) {
        var fd = new FormData();
        fd.append('file', file);

        return fetch('/api/tasks/' + taskId + '/attachments', {
            method: 'POST',
            body: fd
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) {
                    console.warn('[attachments] Ошибка загрузки', file.name, data.error);
                    return false;
                }
                return true;
            })
            .catch(function(err) {
                console.error('[attachments] upload error', file.name, err);
                return false;
            });
    }

    // ============================================================
    // УДАЛЕНИЕ
    // ============================================================
    function remove(attachmentId, taskId) {
        Swal.fire({
            title: 'Удалить файл?',
            text: 'Это действие нельзя отменить',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/attachments/' + attachmentId, { method: 'DELETE' })
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                    if (data.success) load(taskId);
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============================================================
    // БЕЙДЖ
    // ============================================================
    function updateBadge(list) {
        var cnt = Array.isArray(list) ? list.length : 0;
        var $badge = $('#attachmentsBadge');
        if ($badge.length === 0) return;
        if (cnt > 0) $badge.text(cnt).show();
        else $badge.hide();
    }

    // ============================================================
    // ПРЕДПРОСМОТР ИЗОБРАЖЕНИЙ
    // ============================================================
    function previewImage(attachmentId, name) {
        Swal.fire({
            title: utils.escapeHtml(name),
            imageUrl: '/api/attachments/' + attachmentId + '/preview',
            imageAlt: name,
            confirmButtonText: 'Закрыть',
            showCancelButton: true,
            cancelButtonText: '<i class="bi bi-download"></i> Скачать',
            cancelButtonColor: '#0d6efd',
            customClass: { popup: 'swal-wide' }
        }).then(function(r) {
            if (r.dismiss === Swal.DismissReason.cancel) {
                window.location.href = '/api/attachments/' + attachmentId + '/download';
            }
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.load = load;
    api.remove = remove;
    api.updateBadge = updateBadge;
    api.previewImage = previewImage;
    api.fileIcon = fileIcon;

    // Совместимость с inline onclick
    window.loadAttachments = load;
    window.deleteAttachment = remove;
    window.updateAttachmentsBadge = updateBadge;
    window.previewImage = previewImage;

    console.log('[task_attachments] Загружено');
})();