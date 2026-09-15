// static/js/cabinets_manage.js
// Модуль «Управление кабинетами» (только Администратор и Техник)

var cabinetsManageCache = [];

function loadCabinetsManagePage() {
    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка кабинетов...</p>' +
        '</div>'
    );

    fetch('/api/directory/cabinets')
        .then(function(r) { return r.json(); })
        .then(function(cabinets) {
            if (cabinets.error) {
                $contentBlock.html('<div class="alert alert-danger">' + cabinets.error + '</div>');
                return;
            }

            cabinetsManageCache = cabinets || [];

            var html = '';
            html += '<div class="card">';
            html += '<div class="card-header bg-primary text-white">';
            html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
            html += '<h5 class="mb-0"><i class="bi bi-door-closed"></i> Управление кабинетами</h5>';
            html += '<div class="d-flex gap-2">';
            html += '<span class="badge bg-light text-dark align-self-center">Всего: ' + cabinetsManageCache.length + '</span>';
            html += '<button class="btn btn-sm btn-light" onclick="loadCabinetsManagePage()">';
            html += '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
            html += '<button class="btn btn-sm btn-success" onclick="showAddCabinetModal()">';
            html += '<i class="bi bi-plus-circle"></i> Добавить кабинет</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '<div class="card-body">';

            // Поиск
            html += '<div class="row mb-3">';
            html += '<div class="col-md-6 col-lg-4">';
            html += '<div class="input-group">';
            html += '<span class="input-group-text"><i class="bi bi-search"></i></span>';
            html += '<input type="text" class="form-control" id="cabinetSearchInput" placeholder="Поиск по номеру, этажу, ответственному..." oninput="filterCabinetsTable()">';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            // Таблица
            html += '<div class="table-responsive">';
            html += '<table class="table table-striped table-hover align-middle">';
            html += '<thead><tr>';
            html += '<th>ID</th>';
            html += '<th>Номер</th>';
            html += '<th>Этаж</th>';
            html += '<th>Корпус</th>';
            html += '<th>Описание</th>';
            html += '<th>Ответственный</th>';
            html += '<th>Телефон</th>';
            html += '<th>Статус</th>';
            html += '<th>Действия</th>';
            html += '</tr></thead>';
            html += '<tbody id="cabinetsTableBody"></tbody>';
            html += '</table>';
            html += '</div>';

            html += '</div>';
            html += '</div>';

            $contentBlock.html(html);
            renderCabinetsRows(cabinetsManageCache);
        })
        .catch(function(error) {
            $contentBlock.html('<div class="alert alert-danger">Ошибка загрузки: ' + error.message + '</div>');
        });
}

function renderCabinetsRows(cabinets) {
    var tbody = $('#cabinetsTableBody');
    tbody.empty();

    if (!cabinets || cabinets.length === 0) {
        tbody.append('<tr><td colspan="9" class="text-center py-4 text-muted">Кабинеты не найдены</td></tr>');
        return;
    }

    cabinets.forEach(function(cab) {
        var statusBadge = cab.is_active
            ? '<span class="badge bg-success">Активен</span>'
            : '<span class="badge bg-danger">Неактивен</span>';

        var row = '<tr>';
        row += '<td>' + cab.id + '</td>';
        row += '<td><strong>' + (cab.cabinet_number || '-') + '</strong></td>';
        row += '<td>' + (cab.floor || '-') + '</td>';
        row += '<td>' + (cab.building || '-') + '</td>';
        row += '<td>' + (cab.description || '-') + '</td>';
        row += '<td>' + (cab.responsible_person || '-') + '</td>';
        row += '<td>' + (cab.phone || '-') + '</td>';
        row += '<td>' + statusBadge + '</td>';
        row += '<td>';
        row += '<div class="btn-group btn-group-sm">';
        row += '<button class="btn btn-outline-success" onclick="editCabinet(' + cab.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
        row += '<button class="btn btn-outline-danger" onclick="deleteCabinet(' + cab.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        row += '</div>';
        row += '</td>';
        row += '</tr>';

        tbody.append(row);
    });
}

function filterCabinetsTable() {
    var q = ($('#cabinetSearchInput').val() || '').toLowerCase().trim();
    if (!q) {
        renderCabinetsRows(cabinetsManageCache);
        return;
    }
    var filtered = cabinetsManageCache.filter(function(c) {
        return (c.cabinet_number || '').toLowerCase().indexOf(q) !== -1
            || (c.floor || '').toLowerCase().indexOf(q) !== -1
            || (c.building || '').toLowerCase().indexOf(q) !== -1
            || (c.description || '').toLowerCase().indexOf(q) !== -1
            || (c.responsible_person || '').toLowerCase().indexOf(q) !== -1
            || (c.phone || '').toLowerCase().indexOf(q) !== -1;
    });
    renderCabinetsRows(filtered);
}

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
    var cab = cabinetsManageCache.find(function(c) { return c.id === cabinetId; });
    if (!cab) {
        showErrorMessage('Кабинет не найден');
        return;
    }
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
            // Обновляем кеш кабинетов для выпадающих списков (задачи)
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
    var cab = cabinetsManageCache.find(function(c) { return c.id === cabinetId; });
    var name = cab ? cab.cabinet_number : ('#' + cabinetId);

    Swal.fire({
        title: 'Удалить кабинет?',
        html: 'Кабинет <strong>' + name + '</strong> будет удалён. Это действие нельзя отменить.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/directory/cabinets/' + cabinetId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Кабинет удалён', timer: 1500, showConfirmButton: false });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadCabinetsManagePage();
                    } else {
                        showErrorMessage(data.error);
                    }
                });
        }
    });
}

console.log('Cabinets manage module loaded');