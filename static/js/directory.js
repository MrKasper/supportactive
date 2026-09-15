// static/js/directory.js
// Справочник: кабинеты + типы проблем

(function() {
    'use strict';

    if (!window.App) {
        console.error('[directory] App не инициализирован');
        return;
    }

    var api = window.App.register('Directory');
    var utils = window.App.utils;

    // ============= СТРАНИЦА =============
    function loadDirectoryPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка справочника...</p>' +
            '</div>'
        );

        Promise.all([
            fetch('/api/directory/cabinets').then(function(r) { return r.json(); }),
            fetch('/api/directory/problem-types').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var cabinets = results[0];
                var problemTypes = results[1];

                var html = '';

                html += buildTable(
                    'Кабинеты', 'cabinet', 'bi bi-door-open',
                    ['ID', 'Номер кабинета', 'Этаж', 'Корпус', 'Описание', 'Статус'],
                    cabinets,
                    ['id', 'cabinet_number', 'floor', 'building', 'description'],
                    'cabinets'
                );

                html += buildTable(
                    'Типы проблем', 'problem-type', 'bi bi-exclamation-triangle',
                    ['ID', 'Название', 'Описание', 'Статус'],
                    problemTypes,
                    ['id', 'name', 'description'],
                    'problem-types'
                );

                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[directory] load error:', error);
                $contentBlock.html(
                    '<div class="alert alert-danger">Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>'
                );
            });
    }

    // ============= ТАБЛИЦА =============
    function buildTable(title, type, icon, headers, data, fields, apiType) {
        var html = '<div class="card mb-4">';
        html += '<div class="card-header bg-primary text-white">';
        html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
        html += '<h6 class="mb-0"><i class="' + icon + '"></i> ' + title + '</h6>';
        html += '<div class="d-flex gap-2 align-items-center">';
        html += '<span class="badge bg-light text-dark">Всего: ' + (data ? data.length : 0) + '</span>';
        html += '<button class="btn btn-sm btn-light" onclick="showAddDirectoryItem(\'' + type + '\', \'' + apiType + '\')">';
        html += '<i class="bi bi-plus-circle"></i> Добавить</button>';
        html += '</div></div></div>';

        html += '<div class="card-body"><div class="table-responsive">';
        html += '<table class="table table-striped table-hover table-sm">';
        html += '<thead><tr>';
        headers.forEach(function(h) { html += '<th>' + h + '</th>'; });
        html += '<th style="width:100px;">Действия</th>';
        html += '</tr></thead><tbody>';

        if (!data || data.length === 0) {
            html += '<tr><td colspan="' + (headers.length + 1) + '" class="text-center text-muted">Нет данных</td></tr>';
        } else {
            data.forEach(function(item) {
                html += '<tr>';
                fields.forEach(function(field) {
                    html += '<td>' + utils.escapeHtml(item[field] !== null && item[field] !== undefined ? item[field] : '-') + '</td>';
                });
                // Статус
                if (!fields.includes('is_active') && item.is_active !== undefined) {
                    html += '<td>' +
                        (item.is_active
                            ? '<span class="badge bg-success">Активен</span>'
                            : '<span class="badge bg-danger">Неактивен</span>') +
                        '</td>';
                }

                html += '<td><div class="btn-group btn-group-sm">';
                html += '<button class="btn btn-outline-success" onclick="showEditDirectoryItem(\'' +
                        type + '\', \'' + apiType + '\', ' + item.id + ')" title="Редактировать">' +
                        '<i class="bi bi-pencil"></i></button>';
                html += '<button class="btn btn-outline-danger" onclick="deleteDirectoryItem(\'' +
                        type + '\', \'' + apiType + '\', ' + item.id + ')" title="Удалить">' +
                        '<i class="bi bi-trash"></i></button>';
                html += '</div></td></tr>';
            });
        }

        html += '</tbody></table></div></div></div>';
        return html;
    }

    // ============= ДОБАВЛЕНИЕ =============
    function showAddDirectoryItem(type, apiType) {
        var title = type === 'cabinet' ? 'Добавить кабинет' : 'Добавить тип проблемы';
        var fields = type === 'cabinet'
            ? buildCabinetForm(null)
            : buildProblemTypeForm(null);

        Swal.fire({
            title: title,
            html: fields,
            showCancelButton: true,
            confirmButtonText: 'Добавить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() { return collectDirectoryForm(type); }
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/directory/' + apiType, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.value)
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Запись добавлена!', timer: 1500, showConfirmButton: false });
                        loadDirectoryPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
        });
    }

    // ============= РЕДАКТИРОВАНИЕ =============
    function showEditDirectoryItem(type, apiType, itemId) {
        fetch('/api/directory/' + apiType)
            .then(function(r) { return r.json(); })
            .then(function(items) {
                var item = items.find(function(i) { return i.id === itemId; });
                if (!item) { utils.showErrorMessage('Запись не найдена'); return; }

                var title = type === 'cabinet' ? 'Редактировать кабинет' : 'Редактировать тип проблемы';
                var fields = type === 'cabinet'
                    ? buildCabinetForm(item)
                    : buildProblemTypeForm(item);

                Swal.fire({
                    title: title,
                    html: fields,
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    preConfirm: function() { return collectDirectoryForm(type, true); }
                }).then(function(result) {
                    if (!result.isConfirmed) return;

                    fetch('/api/directory/' + apiType + '/' + itemId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.success) {
                                Swal.fire({ icon: 'success', title: 'Запись обновлена!', timer: 1500, showConfirmButton: false });
                                loadDirectoryPage();
                            } else {
                                Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                            }
                        });
                });
            });
    }

    // ============= УДАЛЕНИЕ =============
    function deleteDirectoryItem(type, apiType, itemId) {
        Swal.fire({
            title: 'Удалить запись?',
            text: 'Действие нельзя отменить!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/directory/' + apiType + '/' + itemId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Запись удалена!', timer: 1500, showConfirmButton: false });
                        loadDirectoryPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ФОРМЫ =============
    function buildCabinetForm(item) {
        item = item || {};
        return '<div class="mb-3 text-start"><label class="form-label">Номер кабинета *</label>' +
            '<input id="swal-cabinet-number" class="form-control" value="' + utils.escapeHtml(item.cabinet_number || '') + '" placeholder="Например: Кабинет 601"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Этаж</label>' +
            '<input id="swal-floor" class="form-control" value="' + utils.escapeHtml(item.floor || '') + '" placeholder="Например: 6 этаж"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Корпус</label>' +
            '<input id="swal-building" class="form-control" value="' + utils.escapeHtml(item.building || '') + '" placeholder="Например: Корпус В"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Описание</label>' +
            '<input id="swal-description" class="form-control" value="' + utils.escapeHtml(item.description || '') + '"></div>' +
            (item.id ? '<div class="mb-3 text-start"><div class="form-check form-switch">' +
                '<input class="form-check-input" type="checkbox" id="swal-active" ' + (item.is_active ? 'checked' : '') + '>' +
                '<label class="form-check-label" for="swal-active">Активен</label></div></div>' : '');
    }

    function buildProblemTypeForm(item) {
        item = item || {};
        return '<div class="mb-3 text-start"><label class="form-label">Название *</label>' +
            '<input id="swal-name" class="form-control" value="' + utils.escapeHtml(item.name || '') + '" placeholder="Например: Не включается компьютер"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Описание</label>' +
            '<textarea id="swal-description" class="form-control" rows="2">' + utils.escapeHtml(item.description || '') + '</textarea></div>' +
            (item.id ? '<div class="mb-3 text-start"><div class="form-check form-switch">' +
                '<input class="form-check-input" type="checkbox" id="swal-active" ' + (item.is_active ? 'checked' : '') + '>' +
                '<label class="form-check-label" for="swal-active">Активен</label></div></div>' : '');
    }

    function collectDirectoryForm(type, withActive) {
        var data = {};

        if (type === 'cabinet') {
            data.cabinet_number = document.getElementById('swal-cabinet-number').value.trim();
            if (!data.cabinet_number) {
                Swal.showValidationMessage('Укажите номер кабинета');
                return false;
            }
            data.floor = document.getElementById('swal-floor').value.trim();
            data.building = document.getElementById('swal-building').value.trim();
            data.description = document.getElementById('swal-description').value.trim();
        } else {
            data.name = document.getElementById('swal-name').value.trim();
            if (!data.name) {
                Swal.showValidationMessage('Укажите название типа проблемы');
                return false;
            }
            data.description = document.getElementById('swal-description').value.trim();
        }

        if (withActive) {
            var $active = document.getElementById('swal-active');
            if ($active) data.is_active = $active.checked ? 1 : 0;
        }

        return data;
    }

    // ============= ЭКСПОРТ =============
    api.load = loadDirectoryPage;
    api.showAdd = showAddDirectoryItem;
    api.showEdit = showEditDirectoryItem;
    api.remove = deleteDirectoryItem;

    window.loadDirectoryPage = loadDirectoryPage;
    window.showAddDirectoryItem = showAddDirectoryItem;
    window.showEditDirectoryItem = showEditDirectoryItem;
    window.deleteDirectoryItem = deleteDirectoryItem;

    console.log('[directory] Загружено');
})();