// static/js/directory.js
// Справочник: кабинеты + типы проблем (карточками в 2 колонки).

(function() {
    'use strict';

    if (!window.App) {
        console.error('[directory] App не инициализирован');
        return;
    }

    var api = window.App.register('Directory');
    var utils = window.App.utils;

    var cabinetsCache = [];
    var problemTypesCache = [];

    // ============================================================
    // СТРАНИЦА
    // ============================================================
    function loadDirectoryPage() {
        var $block = $('#otherPagesBlock');

        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка справочника...</p>' +
            '</div>'
        );

        Promise.all([
            fetch('/api/directory/cabinets').then(function(r) { return r.json(); }),
            fetch('/api/directory/problem-types').then(function(r) { return r.json(); }),
        ])
            .then(function(results) {
                var cabinets = results[0];
                var problemTypes = results[1];

                if (cabinets.error || problemTypes.error) {
                    $block.html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(cabinets.error || problemTypes.error) +
                        '</div>'
                    );
                    return;
                }

                cabinetsCache = cabinets || [];
                problemTypesCache = problemTypes || [];

                render();
            })
            .catch(function(error) {
                console.error('[directory] load error:', error);
                $block.html(
                    '<div class="alert alert-danger">Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>'
                );
            });
    }

    // ============================================================
    // ОБЩИЙ РЕНДЕР
    // ============================================================
    function render() {
        var html = '';
        html += '<div class="row g-3">';
        html += '<div class="col-md-6">' + renderCabinetsCard() + '</div>';
        html += '<div class="col-md-6">' + renderProblemTypesCard() + '</div>';
        html += '</div>';

        $('#otherPagesBlock').html(html);
    }

    // ============================================================
    // КАРТОЧКА: КАБИНЕТЫ
    // ============================================================
    function renderCabinetsCard() {
        var html = '<div class="table-wrap table-container">';

        // Шапка
        html += '<div class="table-head">';
        html += '<div class="table-head-title">';
        html += '<i class="bi bi-door-closed" style="color: var(--accent);"></i>';
        html += ' Кабинеты';
        html += ' <span class="table-head-count">' + cabinetsCache.length + '</span>';
        html += '</div>';
        html += '<button class="btn-primary" ' +
                'onclick="showAddCabinetModal()">' +
                '<i class="bi bi-plus-lg"></i> Добавить</button>';
        html += '</div>';

        // Тело
        if (cabinetsCache.length === 0) {
            html += '<div class="empty-state">' +
                '<i class="bi bi-door-closed"></i>' +
                '<p>Кабинеты не добавлены</p></div>';
        } else {
            html += '<div class="table-scroll"><table class="table directory-table">';
            html += '<thead><tr>';
            html += '<th>Номер</th>';
            html += '<th>Этаж</th>';
            html += '<th>Корпус</th>';
            html += '<th>Статус</th>';
            html += '<th style="width: 80px; text-align: right;">Действия</th>';
            html += '</tr></thead><tbody>';

            cabinetsCache.forEach(function(c) {
                var statusBadge = c.is_active
                    ? '<span class="badge badge-completed">Активен</span>'
                    : '<span class="badge badge-cancelled">Неактивен</span>';

                html += '<tr>';
                html += '<td><strong>' + utils.escapeHtml(c.cabinet_number || '—') + '</strong></td>';
                html += '<td>' + utils.escapeHtml(c.floor || '—') + '</td>';
                html += '<td>' + utils.escapeHtml(c.building || '—') + '</td>';
                html += '<td>' + statusBadge + '</td>';
                html += '<td>';
                html += '<div class="row-actions">';
                html += '<button class="btn-icon-sm edit" ' +
                        'onclick="editCabinet(' + c.id + ')" title="Редактировать">' +
                        '<i class="bi bi-pencil"></i></button>';
                html += '<button class="btn-icon-sm delete" ' +
                        'onclick="deleteCabinet(' + c.id + ')" title="Удалить">' +
                        '<i class="bi bi-trash"></i></button>';
                html += '</div>';
                html += '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        }

        html += '</div>';
        return html;
    }

    // ============================================================
    // КАРТОЧКА: ТИПЫ ПРОБЛЕМ
    // ============================================================
    function renderProblemTypesCard() {
        var html = '<div class="table-wrap table-container">';

        html += '<div class="table-head">';
        html += '<div class="table-head-title">';
        html += '<i class="bi bi-exclamation-circle" style="color: var(--accent);"></i>';
        html += ' Типы проблем';
        html += ' <span class="table-head-count">' + problemTypesCache.length + '</span>';
        html += '</div>';
        html += '<button class="btn-primary" ' +
                'onclick="showAddDirectoryItem(\'problem-type\', \'problem-types\')">' +
                '<i class="bi bi-plus-lg"></i> Добавить</button>';
        html += '</div>';

        if (problemTypesCache.length === 0) {
            html += '<div class="empty-state">' +
                '<i class="bi bi-exclamation-circle"></i>' +
                '<p>Типы проблем не добавлены</p></div>';
        } else {
            html += '<div class="table-scroll"><table class="table directory-table">';
            html += '<thead><tr>';
            html += '<th>Название</th>';
            html += '<th>Описание</th>';
            html += '<th style="width: 80px; text-align: right;">Действия</th>';
            html += '</tr></thead><tbody>';

            problemTypesCache.forEach(function(t) {
                html += '<tr>';
                html += '<td><strong>' + utils.escapeHtml(t.name || '—') + '</strong></td>';
                html += '<td class="text-muted">' +
                        utils.escapeHtml(t.description || '—') + '</td>';
                html += '<td>';
                html += '<div class="row-actions">';
                html += '<button class="btn-icon-sm edit" ' +
                        'onclick="showEditDirectoryItem(\'problem-type\', \'problem-types\', ' +
                        t.id + ')" title="Редактировать">' +
                        '<i class="bi bi-pencil"></i></button>';
                html += '<button class="btn-icon-sm delete" ' +
                        'onclick="deleteDirectoryItem(\'problem-type\', \'problem-types\', ' +
                        t.id + ')" title="Удалить">' +
                        '<i class="bi bi-trash"></i></button>';
                html += '</div>';
                html += '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        }

        html += '</div>';
        return html;
    }

    // ============================================================
    // ФОРМА: КАБИНЕТ
    // ============================================================
    function buildCabinetForm(item) {
        item = item || {};
        return '<div class="mb-3 text-start">' +
            '<label class="form-label">Номер кабинета *</label>' +
            '<input id="swal-cabinet-number" class="form-control" ' +
            'value="' + utils.escapeHtml(item.cabinet_number || '') + '" ' +
            'placeholder="Например: Кабинет 601"></div>' +

            '<div class="form-row">' +
            '<div class="field"><label>Этаж</label>' +
            '<input id="swal-floor" class="form-control" ' +
            'value="' + utils.escapeHtml(item.floor || '') + '" ' +
            'placeholder="6 этаж"></div>' +
            '<div class="field"><label>Корпус</label>' +
            '<input id="swal-building" class="form-control" ' +
            'value="' + utils.escapeHtml(item.building || '') + '" ' +
            'placeholder="Корпус В"></div>' +
            '</div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Описание</label>' +
            '<input id="swal-description" class="form-control" ' +
            'value="' + utils.escapeHtml(item.description || '') + '"></div>' +

            (item.id
                ? '<div class="mb-3 text-start"><div class="form-check form-switch">' +
                  '<input class="form-check-input" type="checkbox" id="swal-active" ' +
                  (item.is_active ? 'checked' : '') + '>' +
                  '<label class="form-check-label" for="swal-active">Активен</label>' +
                  '</div></div>'
                : '');
    }

    // ============================================================
    // ФОРМА: ТИП ПРОБЛЕМЫ
    // ============================================================
    function buildProblemTypeForm(item) {
        item = item || {};
        return '<div class="mb-3 text-start">' +
            '<label class="form-label">Название *</label>' +
            '<input id="swal-name" class="form-control" ' +
            'value="' + utils.escapeHtml(item.name || '') + '" ' +
            'placeholder="Например: Не включается компьютер"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Описание</label>' +
            '<textarea id="swal-description" class="form-control" rows="3">' +
            utils.escapeHtml(item.description || '') + '</textarea></div>' +

            (item.id
                ? '<div class="mb-3 text-start"><div class="form-check form-switch">' +
                  '<input class="form-check-input" type="checkbox" id="swal-active" ' +
                  (item.is_active ? 'checked' : '') + '>' +
                  '<label class="form-check-label" for="swal-active">Активен</label>' +
                  '</div></div>'
                : '');
    }

    // ============================================================
    // СБОР ФОРМЫ
    // ============================================================
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

    // ============================================================
    // ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ / УДАЛЕНИЕ
    // ============================================================
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
            confirmButtonColor: '#6366f1',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() { return collectDirectoryForm(type); },
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/directory/' + apiType, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.value),
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success', title: 'Запись добавлена!',
                            timer: 1500, showConfirmButton: false,
                        });
                        loadDirectoryPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
        });
    }

    function showEditDirectoryItem(type, apiType, itemId) {
        var cache = (type === 'cabinet') ? cabinetsCache : problemTypesCache;
        var item = cache.find(function(i) { return i.id === itemId; });

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
            confirmButtonColor: '#6366f1',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() { return collectDirectoryForm(type, true); },
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/directory/' + apiType + '/' + itemId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.value),
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success', title: 'Запись обновлена!',
                            timer: 1500, showConfirmButton: false,
                        });
                        loadDirectoryPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
        });
    }

    function deleteDirectoryItem(type, apiType, itemId) {
        Swal.fire({
            title: 'Удалить запись?',
            text: 'Действие нельзя отменить!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(result) {
            if (!result.isConfirmed) return;

            fetch('/api/directory/' + apiType + '/' + itemId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success', title: 'Запись удалена!',
                            timer: 1500, showConfirmButton: false,
                        });
                        loadDirectoryPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // МОДАЛКА: КАБИНЕТ (совместимость с cabinets_manage.js)
    // ============================================================
    function showAddCabinetModal() {
        showAddDirectoryItem('cabinet', 'cabinets');
    }

    function editCabinet(cabinetId) {
        showEditDirectoryItem('cabinet', 'cabinets', cabinetId);
    }

    function deleteCabinet(cabinetId) {
        deleteDirectoryItem('cabinet', 'cabinets', cabinetId);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.load = loadDirectoryPage;
    api.showAdd = showAddDirectoryItem;
    api.showEdit = showEditDirectoryItem;
    api.remove = deleteDirectoryItem;

    window.loadDirectoryPage = loadDirectoryPage;
    window.showAddDirectoryItem = showAddDirectoryItem;
    window.showEditDirectoryItem = showEditDirectoryItem;
    window.deleteDirectoryItem = deleteDirectoryItem;

    // Переэкспорт (используется в справочнике)
    window.showAddCabinetModal = showAddCabinetModal;
    window.editCabinet = editCabinet;
    window.deleteCabinet = deleteCabinet;

    console.log('[directory] Загружено');
})();