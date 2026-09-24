// static/js/dev/dev_console_files.js
// Вкладка «Папки»: просмотр файлов и папок на сервере.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    var currentPath = null;

    // ============================================================
    // КОРНИ
    // ============================================================
    DC.loadFilesRoots = function() {
        $('#files-content').html(
            '<div class="p-4 text-center">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.get('/api/dev/files/roots')
            .then(function(d) {
                if (d.error) {
                    $('#files-content').html(
                        '<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var roots = d.roots || [];
                if (roots.length === 0) {
                    $('#files-content').html(
                        '<div class="alert alert-info m-3">' +
                        'Разрешённые папки не настроены.</div>'
                    );
                    return;
                }

                var html = '<div class="list-group list-group-flush">';
                roots.forEach(function(r) {
                    html += '<a href="#" class="list-group-item list-group-item-action" ' +
                        'onclick="DevConsole.openFolder(\'' +
                        utils.escapeHtml(r.path).replace(/\\/g, '\\\\') +
                        '\'); return false;">' +
                        '<div class="d-flex justify-content-between align-items-start">' +
                        '<div><i class="bi bi-folder-fill text-warning"></i> ' +
                        '<strong>' + utils.escapeHtml(r.label) + '</strong>' +
                        '<div class="small text-muted" style="font-family:monospace">' +
                        utils.escapeHtml(r.path) + '</div></div>' +
                        '<div class="text-end small">' +
                        '<div>' + r.file_count + ' файл(ов)</div>' +
                        '<div class="text-muted">' + r.size_human + '</div>' +
                        '</div></div></a>';
                });
                html += '</div>';
                $('#files-content').html(html);
            })
            .catch(function(err) {
                $('#files-content').html(
                    '<div class="alert alert-danger m-3">' +
                    utils.escapeHtml(err.message) + '</div>'
                );
            });
    };

    // ============================================================
    // ПРОСМОТР ПАПКИ
    // ============================================================
    DC.openFolder = function(path) {
        if (!path) {
            DC.loadFilesRoots();
            return;
        }

        currentPath = path;
        $('#files-content').html(
            '<div class="p-4 text-center">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.get('/api/dev/files/list?path=' + encodeURIComponent(path))
            .then(function(d) {
                if (d.error) {
                    $('#files-content').html(
                        '<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                renderFolder(d);
            })
            .catch(function(err) {
                $('#files-content').html(
                    '<div class="alert alert-danger m-3">' +
                    utils.escapeHtml(err.message) + '</div>'
                );
            });
    };

    function renderFolder(d) {
        var entries = d.entries || [];
        var html = '';

        // Хлебные крошки
        html += '<div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2 px-2">';
        html += '<div class="d-flex gap-1 flex-wrap align-items-center">';
        if (d.parent) {
            html += '<button class="btn btn-sm btn-outline-secondary" ' +
                'onclick="DevConsole.openFolder(\'' +
                d.parent.replace(/\\/g, '\\\\') + '\')">' +
                '<i class="bi bi-arrow-up"></i> Наверх</button>';
        }
        html += '<button class="btn btn-sm btn-outline-primary" ' +
            'onclick="DevConsole.loadFilesRoots()">' +
            '<i class="bi bi-house"></i> К списку папок</button>';
        html += '<span class="badge bg-info text-dark ms-1">' +
            utils.escapeHtml(d.root_label) + '</span>';
        html += '</div>';
        html += '<div class="d-flex gap-2 align-items-center">';
        html += '<span class="small text-muted">' +
            d.total_files + ' файл(ов) · ' + d.total_size_human + '</span>';
        html += '<button class="btn btn-sm btn-outline-success" ' +
            'onclick="DevConsole.newFolder(\'' +
            d.path.replace(/\\/g, '\\\\') + '\')" ' +
            'title="Создать папку">' +
            '<i class="bi bi-folder-plus"></i></button>';
        html += '</div>';
        html += '</div>';

        // Путь
        html += '<div class="px-2 mb-2 small text-muted" ' +
            'style="font-family:monospace; word-break:break-all">' +
            utils.escapeHtml(d.path) + '</div>';

        if (entries.length === 0) {
            html += '<div class="p-4 text-center text-muted">' +
                '<i class="bi bi-folder2-open" style="font-size:2rem;opacity:.4"></i>' +
                '<p class="mt-2 mb-0">Папка пуста</p></div>';
            $('#files-content').html(html);
            return;
        }

        // Таблица
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">';
        html += '<thead><tr>';
        html += '<th style="width:36px"></th>';
        html += '<th>Имя</th>';
        html += '<th style="width:100px" class="text-end">Размер</th>';
        html += '<th style="width:160px">Изменён</th>';
        html += '<th style="width:200px" class="text-end">Действия</th>';
        html += '</tr></thead><tbody>';

        entries.forEach(function(e) {
            var safePath = e.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            var safeName = utils.escapeHtml(e.name).replace(/'/g, '&#39;');

            html += '<tr>';
            html += '<td class="text-center" style="font-size:1.2rem">' +
                (e.icon || (e.is_dir ? '📁' : '📄')) + '</td>';

            if (e.is_dir) {
                html += '<td><a href="#" class="text-decoration-none" ' +
                    'onclick="DevConsole.openFolder(\'' + safePath +
                    '\'); return false;"><strong>' +
                    utils.escapeHtml(e.name) + '</strong></a> ' +
                    '<span class="badge bg-secondary">' +
                    e.child_count + '</span></td>';
                html += '<td class="text-end text-muted">—</td>';
            } else {
                html += '<td>' + utils.escapeHtml(e.name) + '</td>';
                html += '<td class="text-end">' + e.size_human + '</td>';
            }

            html += '<td class="small text-muted">' +
                utils.formatDate(e.modified) + '</td>';

            html += '<td class="text-end">';
            if (!e.is_dir) {
                html += '<button class="btn btn-sm btn-outline-primary me-1" ' +
                    'onclick="DevConsole.previewFile(\'' + safePath + '\', ' +
                    JSON.stringify(e.name) + ', ' + JSON.stringify(e.ext) + ')" ' +
                    'title="Просмотр"><i class="bi bi-eye"></i></button>';
                html += '<a class="btn btn-sm btn-outline-success me-1" ' +
                    'href="/api/dev/files/download?path=' +
                    encodeURIComponent(e.path) + '" ' +
                    'title="Скачать"><i class="bi bi-download"></i></a>';
            }
            html += '<button class="btn btn-sm btn-outline-danger" ' +
                'onclick="DevConsole.deleteFile(\'' + safePath + '\', ' +
                JSON.stringify(e.name) + ', ' + (e.is_dir ? 'true' : 'false') + ')" ' +
                'title="Удалить"><i class="bi bi-trash"></i></button>';
            html += '</td>';

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        $('#files-content').html(html);
    }

    // ============================================================
    // ПРЕВЬЮ ФАЙЛА
    // ============================================================
    DC.previewFile = function(path, name, ext) {
        var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
        var textExts = ['txt', 'log', 'json', 'md', 'xml', 'csv', 'py',
                        'js', 'css', 'html', 'sql', 'yml', 'yaml'];
        var isImage = imageExts.indexOf(ext) !== -1;
        var isText = textExts.indexOf(ext) !== -1;

        if (isImage) {
            Swal.fire({
                title: utils.escapeHtml(name),
                imageUrl: '/api/dev/files/preview?path=' +
                    encodeURIComponent(path),
                imageAlt: name,
                width: 800,
                showCancelButton: true,
                confirmButtonText: 'Закрыть',
                cancelButtonText: '<i class="bi bi-download"></i> Скачать',
                cancelButtonColor: '#0d6efd',
                customClass: { popup: 'swal-wide' },
            }).then(function(r) {
                if (r.dismiss === Swal.DismissReason.cancel) {
                    window.location.href = '/api/dev/files/download?path=' +
                        encodeURIComponent(path);
                }
            });
            return;
        }

        if (isText) {
            Swal.fire({
                title: utils.escapeHtml(name),
                html: '<div class="text-center py-4">' +
                    '<div class="spinner-border text-primary"></div></div>',
                width: 900,
                showConfirmButton: false,
                showCloseButton: true,
                didOpen: function() {
                    api.get('/api/dev/files/read-text?path=' +
                            encodeURIComponent(path))
                        .then(function(d) {
                            if (d.error) {
                                Swal.update({
                                    html: '<div class="alert alert-danger">' +
                                        utils.escapeHtml(d.error) + '</div>',
                                });
                                return;
                            }
                            Swal.update({
                                html:
                                    '<div class="text-start small text-muted mb-2">' +
                                    d.size_human + '</div>' +
                                    '<pre class="text-start" ' +
                                    'style="max-height:60vh;overflow:auto;' +
                                    'background:#0d1117;color:#c9d1d9;' +
                                    'padding:12px;border-radius:6px;' +
                                    'font-size:.8rem;white-space:pre-wrap;' +
                                    'word-break:break-all">' +
                                    utils.escapeHtml(d.content) + '</pre>',
                            });
                        })
                        .catch(function(err) {
                            Swal.update({
                                html: '<div class="alert alert-danger">' +
                                    utils.escapeHtml(err.message) + '</div>',
                            });
                        });
                },
            });
            return;
        }

        // Для остальных — просто скачиваем
        window.location.href = '/api/dev/files/download?path=' +
            encodeURIComponent(path);
    };

    // ============================================================
    // УДАЛЕНИЕ
    // ============================================================
    DC.deleteFile = function(path, name, isDir) {
        Swal.fire({
            title: isDir ? 'Удалить папку?' : 'Удалить файл?',
            html:
                '<p>Будет удалено: <strong>' + utils.escapeHtml(name) +
                '</strong></p>' +
                (isDir
                    ? '<p class="text-danger small">' +
                      '<i class="bi bi-exclamation-triangle"></i> ' +
                      'Вся папка с содержимым будет удалена безвозвратно.</p>'
                    : '') +
                '<p class="small text-muted mb-0">' +
                'Для подтверждения введите имя:</p>' +
                '<input type="text" id="dev-files-confirm" ' +
                'class="form-control" placeholder="' +
                utils.escapeHtml(name) + '" autocomplete="off">',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            didOpen: function() {
                setTimeout(function() {
                    var el = document.getElementById('dev-files-confirm');
                    if (el) el.focus();
                }, 100);
            },
            preConfirm: function() {
                var v = (document.getElementById('dev-files-confirm')
                    .value || '').trim();
                if (v !== name) {
                    Swal.showValidationMessage('Введите точно: ' + name);
                    return false;
                }
                return true;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;

            Swal.fire({
                title: 'Удаление...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.post('/api/dev/files/delete', {
                path: path,
                confirm: name,
                recursive: isDir,
            }).then(function(res) {
                Swal.close();
                if (res.success) {
                    utils.showSuccessMessage(res.message || 'Удалено');
                    DC.openFolder(currentPath);
                } else {
                    utils.showErrorMessage(res.error || 'Ошибка');
                }
            }).catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    };

    // ============================================================
    // СОЗДАНИЕ ПАПКИ
    // ============================================================
    DC.newFolder = function(parentPath) {
        Swal.fire({
            title: 'Новая папка',
            input: 'text',
            inputPlaceholder: 'имя_папки',
            showCancelButton: true,
            confirmButtonText: 'Создать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function(v) {
                var name = (v || '').trim();
                if (!name) {
                    Swal.showValidationMessage('Введите имя');
                    return false;
                }
                if (/[\\/]/.test(name) || name.indexOf('..') !== -1) {
                    Swal.showValidationMessage('Недопустимое имя');
                    return false;
                }
                return name;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/dev/files/mkdir', {
                parent: parentPath,
                name: r.value,
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Папка создана');
                    DC.openFolder(currentPath);
                } else {
                    utils.showErrorMessage(res.error || 'Ошибка');
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    };

    console.log('[dev_console_files] Загружено');
})();