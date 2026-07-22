// static/js/licenses.js

// ============= ЗАГРУЗКА СТРАНИЦЫ ЛИЦЕНЗИЙ =============
function loadLicensesPage() {
    console.log('Loading licenses page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка лицензий...</p>' +
        '</div>'
    );

    // Загружаем список кабинетов для фильтра
    var cabinetsPromise = fetch('/api/cabinets').then(function(r) { return r.json(); });
    var licensesPromise = fetch('/api/licenses').then(function(r) { return r.json(); });
    var statsPromise = fetch('/api/licenses/statistics').then(function(r) { return r.json(); });

    Promise.all([cabinetsPromise, licensesPromise, statsPromise])
    .then(function(results) {
        var cabinets = results[0];
        var licenses = results[1];
        var stats = results[2];

        if (licenses.error) {
            $contentBlock.html('<div class="alert alert-danger">' + licenses.error + '</div>');
            return;
        }

        var html = '';

        // Статистика
        if (!stats.error) {
            html += '<div class="row mb-3">';
            html += '<div class="col-md-3"><div class="card bg-primary text-white"><div class="card-body text-center">';
            html += '<h3>' + stats.total + '</h3><small>Всего лицензий</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-success text-white"><div class="card-body text-center">';
            html += '<h3>' + (stats.type_stats ? stats.type_stats.length : 0) + '</h3><small>Типов лицензий</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-info text-white"><div class="card-body text-center">';
            html += '<h3>' + (stats.software_stats ? stats.software_stats.length : 0) + '</h3><small>Наименований ПО</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-warning text-white"><div class="card-body text-center">';
            html += '<h3>' + (stats.cabinet_stats ? stats.cabinet_stats.length : 0) + '</h3><small>Кабинетов с ПО</small></div></div></div>';
            html += '</div>';
        }

        // Фильтр по кабинетам и таблица
        html += '<div class="card">';
        html += '<div class="card-header bg-primary text-white">';
        html += '<div class="d-flex justify-content-between align-items-center">';
        html += '<h5 class="mb-0"><i class="bi bi-key"></i> Лицензии</h5>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn btn-sm btn-light" onclick="loadLicensesPage()">';
        html += '<i class="bi bi-arrow-clockwise"></i> Обновить';
        html += '</button>';
        html += '<button class="btn btn-sm btn-success" onclick="showAddLicenseModal()">';
        html += '<i class="bi bi-plus-circle"></i> Добавить';
        html += '</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="card-body">';

        // Фильтр по кабинетам
        html += '<div class="row mb-3">';
        html += '<div class="col-md-4">';
        html += '<label class="form-label">Фильтр по кабинету</label>';
        html += '<select class="form-select" id="licenseCabinetFilter" onchange="filterLicenses()">';
        html += '<option value="">Все кабинеты</option>';
        if (cabinets && !cabinets.error) {
            cabinets.forEach(function(cab) {
                html += '<option value="' + cab.cabinet_number + '">' + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
            });
        }
        html += '</select>';
        html += '</div>';
        html += '</div>';

        // Таблица
        html += '<div class="table-responsive">';
        html += '<table class="table table-striped table-hover">';
        html += '<thead><tr>';
        html += '<th>ID</th>';
        html += '<th>Кабинет</th>';
        html += '<th>Программное обеспечение</th>';
        html += '<th>Тип лицензии</th>';
        html += '<th>Примечание</th>';
        html += '<th>Действия</th>';
        html += '</tr></thead>';
        html += '<tbody id="licensesTableBody">';

        if (licenses.length === 0) {
            html += '<tr><td colspan="6" class="text-center">Нет лицензий</td></tr>';
        } else {
            licenses.forEach(function(lic) {
                html += '<tr>';
                html += '<td>' + lic.id + '</td>';
                html += '<td>' + (lic.cabinet || '-') + '</td>';
                html += '<td>' + (lic.software_name || '-') + '</td>';
                html += '<td>' + (lic.license_type || '-') + '</td>';
                html += '<td>' + (lic.notes || '-') + '</td>';
                html += '<td>';
                html += '<div class="btn-group btn-group-sm">';
                html += '<button class="btn btn-outline-success" onclick="editLicense(' + lic.id + ')" title="Редактировать">';
                html += '<i class="bi bi-pencil"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-danger" onclick="deleteLicense(' + lic.id + ')" title="Удалить">';
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

        $contentBlock.html(html);
    })
    .catch(function(error) {
        console.error('Error loading licenses:', error);
        $contentBlock.html(
            '<div class="alert alert-danger">Ошибка загрузки лицензий: ' + error.message + '</div>'
        );
    });
}

// Фильтрация лицензий по кабинету
function filterLicenses() {
    var cabinet = $('#licenseCabinetFilter').val();
    var params = new URLSearchParams();
    if (cabinet) {
        params.append('cabinet', cabinet);
    }

    fetch('/api/licenses?' + params.toString())
        .then(function(r) { return r.json(); })
        .then(function(licenses) {
            if (licenses.error) {
                showErrorMessage(licenses.error);
                return;
            }

            var tbody = $('#licensesTableBody');
            tbody.empty();

            if (licenses.length === 0) {
                tbody.append('<tr><td colspan="6" class="text-center">Нет лицензий</td></tr>');
            } else {
                licenses.forEach(function(lic) {
                    var row = '<tr>';
                    row += '<td>' + lic.id + '</td>';
                    row += '<td>' + (lic.cabinet || '-') + '</td>';
                    row += '<td>' + (lic.software_name || '-') + '</td>';
                    row += '<td>' + (lic.license_type || '-') + '</td>';
                    row += '<td>' + (lic.notes || '-') + '</td>';
                    row += '<td>';
                    row += '<div class="btn-group btn-group-sm">';
                    row += '<button class="btn btn-outline-success" onclick="editLicense(' + lic.id + ')" title="Редактировать">';
                    row += '<i class="bi bi-pencil"></i>';
                    row += '</button>';
                    row += '<button class="btn btn-outline-danger" onclick="deleteLicense(' + lic.id + ')" title="Удалить">';
                    row += '<i class="bi bi-trash"></i>';
                    row += '</button>';
                    row += '</div>';
                    row += '</td>';
                    row += '</tr>';
                    tbody.append(row);
                });
            }
        })
        .catch(function(error) {
            console.error('Error filtering licenses:', error);
        });
}

// Показать модальное окно добавления лицензии
function showAddLicenseModal() {
    fetch('/api/cabinets')
        .then(function(r) { return r.json(); })
        .then(function(cabinets) {
            var cabinetOptions = '';
            cabinets.forEach(function(cab) {
                cabinetOptions += '<option value="' + cab.cabinet_number + '">' + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
            });

            Swal.fire({
                title: 'Добавить лицензию',
                html:
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Кабинет *</label>' +
                    '<select id="swal-cabinet" class="form-select">' +
                    '<option value="">Выберите кабинет</option>' +
                    cabinetOptions +
                    '</select>' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Программное обеспечение *</label>' +
                    '<input id="swal-software" class="form-control" placeholder="Например: Microsoft Office 2021">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Тип лицензии *</label>' +
                    '<select id="swal-type" class="form-select">' +
                    '<option value="">Выберите тип</option>' +
                    '<option value="Корпоративная">Корпоративная</option>' +
                    '<option value="Персональная">Персональная</option>' +
                    '<option value="OEM">OEM</option>' +
                    '<option value="Подписка">Подписка</option>' +
                    '<option value="Бессрочная">Бессрочная</option>' +
                    '<option value="Временная">Временная</option>' +
                    '<option value="Свободная">Свободная</option>' +
                    '<option value="Пробная">Пробная</option>' +
                    '</select>' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Примечание</label>' +
                    '<textarea id="swal-notes" class="form-control" rows="2" placeholder="Примечание"></textarea>' +
                    '</div>',
                showCancelButton: true,
                confirmButtonText: 'Добавить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                preConfirm: function() {
                    var cabinet = document.getElementById('swal-cabinet').value;
                    var software = document.getElementById('swal-software').value.trim();
                    var type = document.getElementById('swal-type').value;

                    if (!cabinet || !software || !type) {
                        Swal.showValidationMessage('Заполните обязательные поля');
                        return false;
                    }

                    return {
                        cabinet: cabinet,
                        software_name: software,
                        license_type: type,
                        notes: document.getElementById('swal-notes').value.trim()
                    };
                }
            }).then(function(result) {
                if (result.isConfirmed) {
                    fetch('/api/licenses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            Swal.fire({ icon: 'success', title: 'Лицензия добавлена!', timer: 1500, showConfirmButton: false });
                            loadLicensesPage();
                        } else {
                            Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                        }
                    });
                }
            });
        });
}

// Редактирование лицензии
function editLicense(licenseId) {
    Promise.all([
        fetch('/api/licenses/' + licenseId).then(function(r) { return r.json(); }),
        fetch('/api/cabinets').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var data = results[0];
        var cabinets = results[1];

        if (data.error) {
            showErrorMessage(data.error);
            return;
        }

        var cabinetOptions = '';
        cabinets.forEach(function(cab) {
            var selected = (cab.cabinet_number === data.cabinet) ? 'selected' : '';
            cabinetOptions += '<option value="' + cab.cabinet_number + '" ' + selected + '>' + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
        });

        var typeOptions = ['Корпоративная', 'Персональная', 'OEM', 'Подписка', 'Бессрочная', 'Временная', 'Свободная', 'Пробная'];
        var typeSelect = '';
        typeOptions.forEach(function(type) {
            var selected = (type === data.license_type) ? 'selected' : '';
            typeSelect += '<option value="' + type + '" ' + selected + '>' + type + '</option>';
        });

        Swal.fire({
            title: 'Редактировать лицензию',
            html:
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Кабинет *</label>' +
                '<select id="swal-cabinet" class="form-select">' +
                '<option value="">Выберите кабинет</option>' +
                cabinetOptions +
                '</select>' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Программное обеспечение *</label>' +
                '<input id="swal-software" class="form-control" value="' + (data.software_name || '') + '">' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Тип лицензии *</label>' +
                '<select id="swal-type" class="form-select">' +
                '<option value="">Выберите тип</option>' +
                typeSelect +
                '</select>' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label text-start w-100">Примечание</label>' +
                '<textarea id="swal-notes" class="form-control" rows="2">' + (data.notes || '') + '</textarea>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                var cabinet = document.getElementById('swal-cabinet').value;
                var software = document.getElementById('swal-software').value.trim();
                var type = document.getElementById('swal-type').value;

                if (!cabinet || !software || !type) {
                    Swal.showValidationMessage('Заполните обязательные поля');
                    return false;
                }

                return {
                    cabinet: cabinet,
                    software_name: software,
                    license_type: type,
                    notes: document.getElementById('swal-notes').value.trim()
                };
            }
        }).then(function(result) {
            if (result.isConfirmed) {
                fetch('/api/licenses/' + licenseId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Лицензия обновлена!', timer: 1500, showConfirmButton: false });
                        loadLicensesPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
            }
        });
    });
}

// Удаление лицензии
function deleteLicense(licenseId) {
    Swal.fire({
        title: 'Удалить лицензию?',
        text: 'Это действие нельзя отменить!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/licenses/' + licenseId, {
                method: 'DELETE'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: 'Лицензия удалена!', timer: 1500, showConfirmButton: false });
                    loadLicensesPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

console.log('Licenses module loaded');