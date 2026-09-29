// static/js/tags.js
// Управление тегами + чипы для заявок и расписаний.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[tags] App не инициализирован');
        return;
    }

    var mod = window.App.register('Tags');
    var http = window.App.api;
    var utils = window.App.utils;

    if (!http || typeof http.get !== 'function') {
        console.error('[tags] App.api не загружен');
        return;
    }

    var cache = [];
    var cacheLoaded = false;

    // ============================================================
    // КЭШ
    // ============================================================
    function loadCache(force) {
        if (cacheLoaded && !force) return Promise.resolve(cache);
        return http.get('/api/tags')
            .then(function(list) {
                cache = Array.isArray(list) ? list : [];
                cacheLoaded = true;
                return cache;
            })
            .catch(function() {
                cache = [];
                return cache;
            });
    }

    function invalidateCache() {
        cache = [];
        cacheLoaded = false;
    }

    function getById(id) {
        return cache.find(function(t) { return t.id === id; });
    }

    // ============================================================
    // ЧИПЫ
    // ============================================================
    function renderChip(tag, opts) {
        opts = opts || {};
        if (!tag) return '';
        var color = tag.color || '#6366f1';
        var cls = 'tag-chip' + (opts.small ? ' tag-chip-sm' : '');
        return '<span class="' + cls + '" title="' +
            utils.escapeHtml(tag.name) + '" ' +
            'style="background:' + color + '1a; color:' + color + ';">' +
            '<span class="tag-dot" style="background:' + color + '"></span>' +
            utils.escapeHtml(tag.name) +
            '</span>';
    }

    function renderChips(tags, opts) {
        if (!tags || tags.length === 0) return '';
        return tags.map(function(t) { return renderChip(t, opts); }).join('');
    }

    // ============================================================
    // СТРАНИЦА УПРАВЛЕНИЯ ТЕГАМИ
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div></div>'
        );

        http.get('/api/tags')
            .then(function(list) {
                if (list && list.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml(list.error) + '</div>');
                    return;
                }
                cache = Array.isArray(list) ? list : [];
                cacheLoaded = true;
                renderPage();
            })
            .catch(function(err) {
                $block.html('<div class="alert alert-danger">Ошибка: ' +
                    utils.escapeHtml(err.message) + '</div>');
            });
    }

    function renderPage() {
        var html = '';

        html += '<div class="cabinets-toolbar">';
        html += '<div class="toolbar-left">';
        html += '<span class="cabinets-count">Всего тегов: <strong>' +
                cache.length + '</strong></span>';
        html += '</div>';
        html += '<div class="toolbar-right">';
        html += '<button class="btn-ghost" onclick="App.Tags.load()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn-primary" onclick="App.Tags.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Новый тег</button>';
        html += '</div></div>';

        if (cache.length === 0) {
            html += '<div class="cabinets-empty">' +
                '<i class="bi bi-tags" style="font-size:3rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">Тегов ещё нет</p>' +
                '<button class="btn-primary mt-3" onclick="App.Tags.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Создать первый</button></div>';
        } else {
            html += '<div class="tags-grid">';
            cache.forEach(function(t) { html += renderTagCard(t); });
            html += '</div>';
        }

        $('#otherPagesBlock').html(html);
    }

    function renderTagCard(t) {
        return '<div class="tag-card" data-tag-id="' + t.id + '">' +
            '<div class="tag-card-preview">' + renderChip(t) + '</div>' +
            '<div class="tag-card-desc' +
            (t.description ? '' : ' text-muted') + '">' +
            utils.escapeHtml(t.description || 'Без описания') + '</div>' +
            '<div class="tag-card-actions">' +
            '<button class="btn-icon-sm edit" onclick="App.Tags.edit(' + t.id + ')" title="Редактировать">' +
            '<i class="bi bi-pencil"></i></button>' +
            '<button class="btn-icon-sm delete" onclick="App.Tags.remove(' + t.id + ')" title="Удалить">' +
            '<i class="bi bi-trash"></i></button>' +
            '</div></div>';
    }

    // ============================================================
    // ПАЛИТРА / ФОРМА
    // ============================================================
    var COLORS = [
        '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
        '#f59e0b', '#eab308', '#10b981', '#14b8a6', '#0ea5e9',
        '#64748b', '#18181b'
    ];

    function buildForm(t) {
        t = t || {};
        var current = t.color || '#6366f1';

        var colorRows = COLORS.map(function(c) {
            return '<label class="tag-color-opt' +
                (c === current ? ' active' : '') + '" ' +
                'style="background:' + c + '" data-color="' + c + '">' +
                '<input type="radio" name="tag-color" value="' + c + '"' +
                (c === current ? ' checked' : '') + '></label>';
        }).join('');

        return '<div class="text-start">' +
            '<div class="mb-3"><label class="form-label">Название *</label>' +
            '<input id="tag-name" class="form-control" maxlength="50" value="' +
            utils.escapeHtml(t.name || '') + '"></div>' +
            '<div class="mb-3"><label class="form-label">Описание</label>' +
            '<textarea id="tag-description" class="form-control" rows="2">' +
            utils.escapeHtml(t.description || '') + '</textarea></div>' +
            '<div class="mb-3"><label class="form-label">Цвет</label>' +
            '<div class="tag-colors-grid" id="tag-colors">' +
            colorRows + '</div></div>' +
            '<div class="mb-2"><label class="form-label">Предпросмотр</label>' +
            '<div id="tag-preview" class="tag-preview-box"></div></div>' +
            '</div>';
    }

    function bindFormEvents() {
        $('#tag-name').off('input.tagPreview').on('input.tagPreview', updatePreview);
        $('#tag-colors').off('click.tagPick').on('click.tagPick',
            '.tag-color-opt', function() {
                $('#tag-colors .tag-color-opt').removeClass('active');
                $(this).addClass('active');
                updatePreview();
            });
        updatePreview();
    }

    function updatePreview() {
        var name = ($('#tag-name').val() || 'Новый тег').trim();
        var color = $('input[name="tag-color"]:checked').val() || '#6366f1';
        $('#tag-preview').html(
            '<span class="tag-chip" style="background:' + color +
            '1a; color:' + color + ';">' +
            '<span class="tag-dot" style="background:' + color + '"></span>' +
            utils.escapeHtml(name) + '</span>'
        );
    }

    function collectForm() {
        var name = ($('#tag-name').val() || '').trim();
        if (!name) {
            Swal.showValidationMessage('Введите название');
            return false;
        }
        return {
            name: name,
            color: $('input[name="tag-color"]:checked').val() || '#6366f1',
            description: ($('#tag-description').val() || '').trim()
        };
    }

    function showAdd() {
        Swal.fire({
            title: '<i class="bi bi-tag"></i> Новый тег',
            html: buildForm(null),
            width: 520,
            showCancelButton: true,
            confirmButtonText: 'Создать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#6366f1',
            didOpen: bindFormEvents,
            preConfirm: collectForm
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/tags', r.value).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Тег создан');
                    invalidateCache();
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    function edit(id) {
        http.get('/api/tags').then(function(list) {
            var t = (list || []).find(function(x) { return x.id === id; });
            if (!t) { utils.showErrorMessage('Тег не найден'); return; }

            Swal.fire({
                title: '<i class="bi bi-pencil-square"></i> Редактировать тег',
                html: buildForm(t),
                width: 520,
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#6366f1',
                didOpen: bindFormEvents,
                preConfirm: collectForm
            }).then(function(r) {
                if (!r.isConfirmed) return;
                http.put('/api/tags/' + id, r.value).then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage('Тег обновлён');
                        invalidateCache();
                        load();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
            });
        });
    }

    function remove(id) {
        Swal.fire({
            title: 'Удалить тег?',
            text: 'Тег будет отвязан от всех заявок и расписаний.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/tags/' + id).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Тег удалён');
                    invalidateCache();
                    load();
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
        });
    }

    // ============================================================
    // МОДАЛКА: ТЕГИ ЗАЯВКИ
    // ============================================================
    function openTaskTagsModal(taskId) {
        if (!taskId) return;

        Promise.all([
            http.get('/api/tags'),
            http.get('/api/tasks/' + taskId + '/tags')
        ]).then(function(results) {
            var allTags = results[0] || [];
            var taskTags = results[1] || [];
            var selectedIds = taskTags.map(function(t) { return t.id; });

            var html = '<div class="text-start">';
            if (allTags.length === 0) {
                html += '<div class="alert alert-info mb-0">' +
                    'Теги не созданы. Добавьте их в разделе «Теги».</div>';
            } else {
                html += '<div class="tag-picker">';
                allTags.forEach(function(t) {
                    var checked = selectedIds.indexOf(t.id) !== -1;
                    html += '<label class="tag-picker-item">' +
                        '<input type="checkbox" value="' + t.id + '"' +
                        (checked ? ' checked' : '') + '>' +
                        renderChip(t) + '</label>';
                });
                html += '</div>';
            }
            html += '</div>';

            Swal.fire({
                title: '<i class="bi bi-tags"></i> Теги заявки',
                html: html,
                width: 520,
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#6366f1',
                preConfirm: function() {
                    var ids = [];
                    $('.swal2-html-container input[type="checkbox"]:checked')
                        .each(function() { ids.push(parseInt(this.value, 10)); });
                    return ids;
                }
            }).then(function(r) {
                if (!r.isConfirmed) return;
                http.post('/api/tasks/' + taskId + '/tags', { tag_ids: r.value })
                    .then(function(res) {
                        if (res.success) {
                            utils.showSuccessMessage('Теги обновлены');
                            if (window.App.Tasks && window.App.Tasks.refreshData) {
                                window.App.Tasks.refreshData();
                            }
                        } else {
                            utils.showErrorMessage(res.error);
                        }
                    });
            });
        });
    }

    // ============================================================
    // ВЫБОР ТЕГОВ В ФОРМЕ СОЗДАНИЯ ЗАЯВКИ
    // ============================================================
    function initCreateTaskTagsPicker() {
        var $wrap = $('#createTaskTagsPicker');
        if ($wrap.length === 0) return;

        loadCache(true).then(function(all) {
            if (!all || all.length === 0) {
                $wrap.html('<span class="text-muted small">Теги не созданы</span>');
                return;
            }
            var html = '';
            all.forEach(function(t) {
                html += '<label class="tag-picker-item">' +
                    '<input type="checkbox" value="' + t.id + '">' +
                    renderChip(t) + '</label>';
            });
            $wrap.html(html);
        });
    }

    function getSelectedCreateTaskTags() {
        var ids = [];
        $('#createTaskTagsPicker input[type="checkbox"]:checked')
            .each(function() { ids.push(parseInt(this.value, 10)); });
        return ids;
    }

    function resetCreateTaskTags() {
        $('#createTaskTagsPicker input[type="checkbox"]').prop('checked', false);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = load;
    mod.showAdd = showAdd;
    mod.edit = edit;
    mod.remove = remove;
    mod.renderChip = renderChip;
    mod.renderChips = renderChips;
    mod.getById = getById;
    mod.loadCache = loadCache;
    mod.invalidateCache = invalidateCache;
    mod.openTaskTagsModal = openTaskTagsModal;
    mod.initCreateTaskTagsPicker = initCreateTaskTagsPicker;
    mod.getSelectedCreateTaskTags = getSelectedCreateTaskTags;
    mod.resetCreateTaskTags = resetCreateTaskTags;

    window.loadTagsPage = load;
    window.openTaskTagsModal = openTaskTagsModal;

    console.log('[tags] Загружено');
})();