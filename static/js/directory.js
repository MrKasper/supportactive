// static/js/directory.js

// ============= ЗАГРУЗКА СТРАНИЦЫ СПРАВОЧНИКА =============
function loadDirectoryPage() {
    console.log('Loading directory page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка справочника...</p>' +
        '</div>'
    );

    // Загружаем данные
    Promise.all([
        fetch('/api/directory/cabinets').then(function(r) { return r.json(); }),
        fetch('/api/directory/problem-types').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var cabinets = results[0];
        var problemTypes = results[1];

        var html = '';

        // Таблица 1: Кабинеты
        html += buildDirectoryTable(
            'Кабинеты', 'cabinet', 'bi bi-door-open',
            ['ID', 'Номер кабинета', 'Этаж', 'Корпус', 'Описание', 'Статус'],
            cabinets,
            ['id', 'cabinet_number', 'floor', 'building', 'description'],
            'cabinets'
        );

        // Таблица 2: Типы проблем
        html += buildDirectoryTable(
            'Типы проблем', 'problem-type', 'bi bi-exclamation-triangle',
            ['ID', 'Название', 'Описание', 'Статус'],
            problemTypes,
            ['id', 'name', 'description'],
            'problem-types'
        );

        $contentBlock.html(html);
    })
    .catch(function(error) {
        console.error('Error loading directory:', error);
        $contentBlock.html(
            '<div class="alert alert-danger">Ошибка загрузки справочника: ' + error.message + '</div>'
        );
    });
}

// Построение таблицы справочника
function buildDirectoryTable(title, type, icon, headers, data, fields, apiType) {
    var html = '<div class="card mb-4">';
    html += '<div class="card-header bg-primary text-white">';
    html += '<div class="d-flex justify-content-between align-items-center">';
    html += '<h6 class="mb-0"><i class="' + icon + '"></i> ' + title + '</h6>';
    html += '<div class="d-flex gap-2">';
    html += '<span class="badge bg-light text-dark">Всего: ' + (data ? data.length : 0) + '</span>';
    html += '<button class="btn btn-sm btn-success" onclick="showAddDirectoryItem(\'' + type + '\', \'' + apiType + '\')">';
    html += '<i class="bi bi-plus-circle"></i> Добавить';
    html += '</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="card-body">';
    html += '<div class="table-responsive">';
    html += '<table class="table table-striped table-hover table-sm">';
    html += '<thead><tr>';

    headers.forEach(function(header) {
        html += '<th>' + header + '</th>';
    });
    html += '<th style="width: 100px;">Действия</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    if (!data || data.length === 0) {
        html += '<tr><td colspan="' + (headers.length + 1) + '" class="text-center">Нет данных</td></tr>';
    } else {
        data.forEach(function(item) {
            html += '<tr>';

            fields.forEach(function(field) {
                if (field === 'is_active') {
                    html += '<td>' + (item[field] ? '<span class="badge bg-success">Активен</span>' : '<span class="badge bg-danger">Неактивен</span>') + '</td>';
                } else {
                    html += '<td>' + (item[field] !== null && item[field] !== undefined ? item[field] : '-') + '</td>';
                }
            });

            // Статус для таблиц, где нет is_active в fields
            if (!fields.includes('is_active') && item.is_active !== undefined) {
                html += '<td>' + (item.is_active ? '<span class="badge bg-success">Активен</span>' : '<span class="badge bg-danger">Неактивен</span>') + '</td>';
            }

            html += '<td>';
            html += '<div class="btn-group btn-group-sm">';
            html += '<button class="btn btn-outline-success" onclick="showEditDirectoryItem(\'' + type + '\', \'' + apiType + '\', ' + item.id + ')" title="Редактировать">';
            html += '<i class="bi bi-pencil"></i>';
            html += '</button>';
            html += '<button class="btn btn-outline-danger" onclick="deleteDirectoryItem(\'' + type + '\', \'' + apiType + '\', ' + item.id + ')" title="Удалить">';
            html += '<i class="bi bi-trash"></i>';
            html += '</button>';
            html += '</div>';
            html += '</td>';
            html += '</tr>';
        });
    }

    html += '</tbody>';
    html += '</table>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    return html;
}

// Показать модальное окно добавления элемента справочника
function showAddDirectoryItem(type, apiType) {
    var title = '';
    var fields = '';

    switch(type) {
        case 'cabinet':
            title = 'Добавить кабинет';
            fields =
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Номер кабинета *</label>' +
                '<input id="swal-cabinet-number" class="form-control" placeholder="Например: Кабинет 601">' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Этаж</label>' +
                '<input id="swal-floor" class="form-control" placeholder="Например: 6 этаж">' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Корпус</label>' +
                '<input id="swal-building" class="form-control" placeholder="Например: Корпус В">' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Описание</label>' +
                '<input id="swal-description" class="form-control" placeholder="Описание кабинета">' +
                '</div>';
            break;

        case 'problem-type':
            title = 'Добавить тип проблемы';
            fields =
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Название *</label>' +
                '<input id="swal-name" class="form-control" placeholder="Например: Не включается компьютер">' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Описание</label>' +
                '<textarea id="swal-description" class="form-control" rows="2" placeholder="Описание типа проблемы"></textarea>' +
                '</div>';
            break;
    }

    Swal.fire({
        title: title,
        html: fields,
        showCancelButton: true,
        confirmButtonText: 'Добавить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#28a745',
        preConfirm: function() {
            var data = {};

            switch(type) {
                case 'cabinet':
                    data.cabinet_number = document.getElementById('swal-cabinet-number').value.trim();
                    if (!data.cabinet_number) {
                        Swal.showValidationMessage('Укажите номер кабинета');
                        return false;
                    }
                    data.floor = document.getElementById('swal-floor').value.trim();
                    data.building = document.getElementById('swal-building').value.trim();
                    data.description = document.getElementById('swal-description').value.trim();
                    break;

                case 'problem-type':
                    data.name = document.getElementById('swal-name').value.trim();
                    if (!data.name) {
                        Swal.showValidationMessage('Укажите название типа проблемы');
                        return false;
                    }
                    data.description = document.getElementById('swal-description').value.trim();
                    break;
            }

            return data;
        }
    }).then(function(result) {
        if (result.isConfirmed) {
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
        }
    });
}

// Показать модальное окно редактирования элемента справочника
function showEditDirectoryItem(type, apiType, itemId) {
    fetch('/api/directory/' + apiType)
        .then(function(r) { return r.json(); })
        .then(function(items) {
            var item = items.find(function(i) { return i.id === itemId; });
            if (!item) {
                showErrorMessage('Запись не найдена');
                return;
            }

            var title = '';
            var fields = '';

            switch(type) {
                case 'cabinet':
                    title = 'Редактировать кабинет';
                    fields =
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Номер кабинета *</label>' +
                        '<input id="swal-cabinet-number" class="form-control" value="' + (item.cabinet_number || '') + '">' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Этаж</label>' +
                        '<input id="swal-floor" class="form-control" value="' + (item.floor || '') + '">' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Корпус</label>' +
                        '<input id="swal-building" class="form-control" value="' + (item.building || '') + '">' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Описание</label>' +
                        '<input id="swal-description" class="form-control" value="' + (item.description || '') + '">' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<div class="form-check form-switch">' +
                        '<input class="form-check-input" type="checkbox" id="swal-active" ' + (item.is_active ? 'checked' : '') + '>' +
                        '<label class="form-check-label" for="swal-active">Кабинет активен</label>' +
                        '</div>' +
                        '</div>';
                    break;

                case 'problem-type':
                    title = 'Редактировать тип проблемы';
                    fields =
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Название *</label>' +
                        '<input id="swal-name" class="form-control" value="' + (item.name || '') + '">' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<label class="form-label text-start w-100">Описание</label>' +
                        '<textarea id="swal-description" class="form-control" rows="2">' + (item.description || '') + '</textarea>' +
                        '</div>' +
                        '<div class="mb-3">' +
                        '<div class="form-check form-switch">' +
                        '<input class="form-check-input" type="checkbox" id="swal-active" ' + (item.is_active ? 'checked' : '') + '>' +
                        '<label class="form-check-label" for="swal-active">Тип проблемы активен</label>' +
                        '</div>' +
                        '</div>';
                    break;
            }

            Swal.fire({
                title: title,
                html: fields,
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                preConfirm: function() {
                    var data = {};

                    switch(type) {
                        case 'cabinet':
                            data.cabinet_number = document.getElementById('swal-cabinet-number').value.trim();
                            if (!data.cabinet_number) {
                                Swal.showValidationMessage('Укажите номер кабинета');
                                return false;
                            }
                            data.floor = document.getElementById('swal-floor').value.trim();
                            data.building = document.getElementById('swal-building').value.trim();
                            data.description = document.getElementById('swal-description').value.trim();
                            data.is_active = document.getElementById('swal-active').checked ? 1 : 0;
                            break;

                        case 'problem-type':
                            data.name = document.getElementById('swal-name').value.trim();
                            if (!data.name) {
                                Swal.showValidationMessage('Укажите название типа проблемы');
                                return false;
                            }
                            data.description = document.getElementById('swal-description').value.trim();
                            data.is_active = document.getElementById('swal-active').checked ? 1 : 0;
                            break;
                    }

                    return data;
                }
            }).then(function(result) {
                if (result.isConfirmed) {
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
                }
            });
        });
}

// Удаление элемента справочника
function deleteDirectoryItem(type, apiType, itemId) {
    Swal.fire({
        title: 'Удалить запись?',
        text: 'Это действие нельзя отменить!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/directory/' + apiType + '/' + itemId, {
                method: 'DELETE'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: 'Запись удалена!', timer: 1500, showConfirmButton: false });
                    loadDirectoryPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

console.log('Directory module loaded');