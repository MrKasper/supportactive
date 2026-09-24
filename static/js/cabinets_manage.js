// static/js/cabinets_manage.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinets_manage] App не инициализирован');
        return;
    }

    var api = window.App.register('CabinetsManage');
    var utils = window.App.utils;

    var cabinetsCache = [];

    // ============= СПИСОК =============
    function loadCabinetsManagePage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка кабинетов...</p>' +
            '</div>'
        );

        fetch('/api/directory/cabinets')
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                if (cabinets.error) {
                    $contentBlock.html(
                        '<div class="alert alert-danger">' +
                        utils.escapeHtml(cabinets.error) + '</div>'
                    );
                    return;
                }

                cabinetsCache = cabinets || [];

                var html = '<div class="card">';
                html += '<div class="card-header bg-primary text-white">';
                html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
                html += '<h5 class="mb-0"><i class="bi bi-door-closed"></i> Управление кабинетами</h5>';
                html += '<div class="d-flex gap-2 align-items-center">';
                html += '<span class="badge bg-light text-dark">Всего: ' + cabinetsCache.length + '</span>';
                html += '<button class="btn btn-sm btn-light" onclick="loadCabinetsManagePage()">' +
                        '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
                html += '<button class="btn btn-sm btn-success" onclick="showAddCabinetModal()">' +
                        '<i class="bi bi-plus-circle"></i> Добавить кабинет</button>';
                html += '</div></div></div>';
                html += '<div class="card-body">';

                html += '<div class="row mb-3"><div class="col-md-6 col-lg-4">' +
                        '<div class="input-group">' +
                        '<span class="input-group-text"><i class="bi bi-search"></i></span>' +
                        '<input type="text" class="form-control" id="cabinetSearchInput" ' +
                        'placeholder="Поиск по номеру, этажу..." oninput="filterCabinetsTable()">' +
                        '</div></div></div>';

                html += '<div class="table-responsive">';
                html += '<table class="table table-striped table-hover align-middle">';
                html += '<thead><tr>';
                html += '<th>Номер</th><th>Этаж</th><th>Корпус</th>';
                html += '<th>Описание</th><th>Ответственный</th><th>Телефон</th>';
                html += '<th>Статус</th><th>Действия</th>';
                html += '</tr></thead><tbody id="cabinetsTableBody"></tbody></table></div>';

                html += '</div></div>';
                $contentBlock.html(html);

                renderRows(cabinetsCache);
            })
            .catch(function(error) {
                console.error('[cabinets_manage] load error:', error);
                $contentBlock.html(
                    '<div class="alert alert-danger">Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>'
                );
            });
    }

    function renderRows(cabinets) {
        var $tbody = $('#cabinetsTableBody');
        $tbody.empty();

        if (!cabinets || cabinets.length === 0) {
            $tbody.append('<tr><td colspan="8" class="text-center py-4 text-muted">Кабинеты не найдены</td></tr>');
            return;
        }

        cabinets.forEach(function(cab) {
            var statusBadge = cab.is_active
                ? '<span class="badge bg-success">Активен</span>'
                : '<span class="badge bg-danger">Неактивен</span>';

            var row = '<tr>';
            row += '<td><strong>' + utils.escapeHtml(cab.cabinet_number || '-') + '</strong></td>';
            row += '<td>' + utils.escapeHtml(cab.floor || '-') + '</td>';
            row += '<td>' + utils.escapeHtml(cab.building || '-') + '</td>';
            row += '<td>' + utils.escapeHtml(cab.description || '-') + '</td>';
            row += '<td>' + utils.escapeHtml(cab.responsible_person || '-') + '</td>';
            row += '<td>' + utils.escapeHtml(cab.phone || '-') + '</td>';
            row += '<td>' + statusBadge + '</td>';
            row += '<td><div class="btn-group btn-group-sm">';
            row += '<button class="btn btn-primary" onclick="openCabinetDetails(' + cab.id + ')" title="Оборудование кабинета">' +
                   '<i class="bi bi-cpu"></i> Открыть</button>';
            row += '<button class="btn btn-outline-success" onclick="editCabinet(' + cab.id + ')" title="Редактировать">' +
                   '<i class="bi bi-pencil"></i></button>';
            row += '<button class="btn btn-outline-danger" onclick="deleteCabinet(' + cab.id + ')" title="Удалить">' +
                   '<i class="bi bi-trash"></i></button>';
            row += '</div></td></tr>';
            $tbody.append(row);
        });
    }

    function filterCabinetsTable() {
        var q = ($('#cabinetSearchInput').val() || '').toLowerCase().trim();
        if (!q) { renderRows(cabinetsCache); return; }

        var filtered = cabinetsCache.filter(function(c) {
            return (c.cabinet_number || '').toLowerCase().indexOf(q) !== -1
                || (c.floor || '').toLowerCase().indexOf(q) !== -1
                || (c.building || '').toLowerCase().indexOf(q) !== -1
                || (c.description || '').toLowerCase().indexOf(q) !== -1
                || (c.responsible_person || '').toLowerCase().indexOf(q) !== -1
                || (c.phone || '').toLowerCase().indexOf(q) !== -1;
        });
        renderRows(filtered);
    }

    // ============= МОДАЛКА =============
    function showAddCabinetModal() {
        $('#cabinetId').val('');
        $('#cabinetNumber').val('');
        $('#cabinetFloor').val('');
        $('#cabinetBuilding').val('');
        $('#cabinetDescription').val('');
        $('#cabinetResponsible').val('');
        $('#cabinetPhone').val('');
        $('#cabinetIsActive').prop('checked', true);
        $('#cabinetActiveField').hide();

        $('#cabinetModalTitle').html('<i class="bi bi-plus-circle"></i> Добавление кабинета');
        $('#cabinetEditModal').modal('show');
    }

    function editCabinet(cabinetId) {
        var cab = cabinetsCache.find(function(c) { return c.id === cabinetId; });
        if (!cab) { utils.showErrorMessage('Кабинет не найден'); return; }

        $('#cabinetId').val(cab.id);
        $('#cabinetNumber').val(cab.cabinet_number || '');
        $('#cabinetFloor').val(cab.floor || '');
        $('#cabinetBuilding').val(cab.building || '');
        $('#cabinetDescription').val(cab.description || '');
        $('#cabinetResponsible').val(cab.responsible_person || '');
        $('#cabinetPhone').val(cab.phone || '');
        $('#cabinetIsActive').prop('checked', cab.is_active == 1);
        $('#cabinetActiveField').show();

        $('#cabinetModalTitle').html('<i class="bi bi-pencil-square"></i> Редактирование кабинета');
        $('#cabinetEditModal').modal('show');
    }

    function saveCabinet() {
        var form = document.getElementById('cabinetForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var id = $('#cabinetId').val();
        var data = {
            cabinet_number: $('#cabinetNumber').val().trim(),
            floor: $('#cabinetFloor').val().trim(),
            building: $('#cabinetBuilding').val().trim(),
            description: $('#cabinetDescription').val().trim(),
            responsible_person: $('#cabinetResponsible').val().trim(),
            phone: $('#cabinetPhone').val().trim(),
            is_active: $('#cabinetIsActive').is(':checked') ? 1 : 0
        };

        var url = id ? ('/api/directory/cabinets/' + id) : '/api/directory/cabinets';
        var method = id ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (result.success) {
                    $('#cabinetEditModal').modal('hide');
                    Swal.fire({ icon: 'success', title: 'Сохранено!', timer: 1500, showConfirmButton: false });
                    if (typeof loadFilters === 'function') loadFilters();
                    loadCabinetsManagePage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
                }
            })
            .catch(function() {
                Swal.fire({ icon: 'error', title: 'Ошибка', text: 'Не удалось сохранить кабинет' });
            });
    }

    function deleteCabinet(cabinetId) {
        var cab = cabinetsCache.find(function(c) { return c.id === cabinetId; });
        var name = cab ? cab.cabinet_number : ('#' + cabinetId);

        Swal.fire({
            title: 'Удалить кабинет?',
            html: 'Кабинет <strong>' + utils.escapeHtml(name) + '</strong> и всё его оборудование будут удалены.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/directory/cabinets/' + cabinetId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Кабинет удалён', timer: 1500, showConfirmButton: false });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadCabinetsManagePage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.load = loadCabinetsManagePage;
    api.showAdd = showAddCabinetModal;
    api.edit = editCabinet;
    api.save = saveCabinet;
    api.remove = deleteCabinet;
    api.filter = filterCabinetsTable;

    // Глобальные алиасы для inline onclick.
    // ⚠️ window.openCabinetDetails определяется ТОЛЬКО в cabinet_core.js —
    //    не дублируйте его здесь.
    window.loadCabinetsManagePage = loadCabinetsManagePage;
    window.showAddCabinetModal = showAddCabinetModal;
    window.editCabinet = editCabinet;
    window.saveCabinet = saveCabinet;
    window.deleteCabinet = deleteCabinet;
    window.filterCabinetsTable = filterCabinetsTable;

    console.log('[cabinets_manage] Загружено (без ID)');
})();