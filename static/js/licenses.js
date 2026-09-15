// static/js/licenses.js
// Лицензии

(function() {
    'use strict';

    if (!window.App) {
        console.error('[licenses] App не инициализирован');
        return;
    }

    var api = window.App.register('Licenses');
    var utils = window.App.utils;

    // ============= СПИСОК =============
    function loadLicensesPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка лицензий...</p>' +
            '</div>'
        );

        Promise.all([
            fetch('/api/cabinets').then(function(r) { return r.json(); }),
            fetch('/api/licenses').then(function(r) { return r.json(); }),
            fetch('/api/licenses/statistics').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var cabinets = results[0];
                var licenses = results[1];
                var stats = results[2];

                if (licenses.error) {
                    $contentBlock.html('<div class="alert alert-danger">' + utils.escapeHtml(licenses.error) + '</div>');
                    return;
                }

                var html = '';

                if (!stats.error) {
                    html += '<div class="row mb-3 g-3">';
                    html += statCard('Всего лицензий', stats.total, 'bg-primary');
                    html += statCard('Типов лицензий', (stats.type_stats ? stats.type_stats.length : 0), 'bg-success');
                    html += statCard('Наименований ПО', (stats.software_stats ? stats.software_stats.length : 0), 'bg-info');
                    html += statCard('Кабинетов с ПО', (stats.cabinet_stats ? stats.cabinet_stats.length : 0), 'bg-warning');
                    html += '</div>';
                }

                html += '<div class="card">';
                html += '<div class="card-header bg-primary text-white">';
                html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
                html += '<h5 class="mb-0"><i class="bi bi-key"></i> Лицензии</h5>';
                html += '<div class="d-flex gap-2">';
                html += '<button class="btn btn-sm btn-light" onclick="loadLicensesPage()"><i class="bi bi-arrow-clockwise"></i> Обновить</button>';
                html += '<button class="btn btn-sm btn-success" onclick="showAddLicenseModal()"><i class="bi bi-plus-circle"></i> Добавить</button>';
                html += '</div></div></div>';
                html += '<div class="card-body">';

                html += '<div class="row mb-3"><div class="col-md-4">' +
                    '<label class="form-label">Фильтр по кабинету</label>' +
                    '<select class="form-select" id="licenseCabinetFilter" onchange="filterLicenses()">' +
                    '<option value="">Все кабинеты</option>';
                if (cabinets && !cabinets.error) {
                    cabinets.forEach(function(cab) {
                        html += '<option value="' + utils.escapeHtml(cab.cabinet_number) + '">' +
                            utils.escapeHtml(cab.cabinet_number + (cab.description ? ' - ' + cab.description : '')) +
                            '</option>';
                    });
                }
                html += '</select></div></div>';

                html += '<div class="table-responsive">';
                html += '<table class="table table-striped table-hover">';
                html += '<thead><tr><th>ID</th><th>Кабинет</th><th>ПО</th><th>Тип</th><th>Примечание</th><th>Действия</th></tr></thead>';
                html += '<tbody id="licensesTableBody">';
                html += renderRows(licenses);
                html += '</tbody></table></div></div></div>';

                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[licenses] load error:', error);
                $contentBlock.html('<div class="alert alert-danger">Ошибка загрузки: ' + utils.escapeHtml(error.message) + '</div>');
            });
    }

    function statCard(label, value, bgClass) {
        return '<div class="col-6 col-md-3"><div class="card ' + bgClass + ' text-white">' +
            '<div class="card-body text-center"><h3 class="mb-0">' + (value || 0) + '</h3>' +
            '<small>' + label + '</small></div></div></div>';
    }

    function renderRows(licenses) {
        if (!licenses || licenses.length === 0) {
            return '<tr><td colspan="6" class="text-center">Нет лицензий</td></tr>';
        }
        var html = '';
        licenses.forEach(function(lic) {
            html += '<tr>';
            html += '<td>' + lic.id + '</td>';
            html += '<td>' + utils.escapeHtml(lic.cabinet || '-') + '</td>';
            html += '<td>' + utils.escapeHtml(lic.software_name || '-') + '</td>';
            html += '<td>' + utils.escapeHtml(lic.license_type || '-') + '</td>';
            html += '<td>' + utils.escapeHtml(lic.notes || '-') + '</td>';
            html += '<td><div class="btn-group btn-group-sm">';
            html += '<button class="btn btn-outline-success" onclick="editLicense(' + lic.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
            html += '<button class="btn btn-outline-danger" onclick="deleteLicense(' + lic.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
            html += '</div></td></tr>';
        });
        return html;
    }

    function filterLicenses() {
        var cabinet = $('#licenseCabinetFilter').val();
        var params = new URLSearchParams();
        if (cabinet) params.append('cabinet', cabinet);

        fetch('/api/licenses?' + params.toString())
            .then(function(r) { return r.json(); })
            .then(function(licenses) {
                if (licenses.error) { utils.showErrorMessage(licenses.error); return; }
                $('#licensesTableBody').html(renderRows(licenses));
            });
    }

    // ============= ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ =============
    function showAddLicenseModal() {
        fetch('/api/cabinets')
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    cabinetOptions += '<option value="' + utils.escapeHtml(cab.cabinet_number) + '">' +
                        utils.escapeHtml(cab.cabinet_number + (cab.description ? ' - ' + cab.description : '')) +
                        '</option>';
                });

                Swal.fire({
                    title: 'Добавить лицензию',
                    html: buildLicenseForm(cabinetOptions, null),
                    showCancelButton: true,
                    confirmButtonText: 'Добавить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    preConfirm: collectLicenseForm
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    postLicense(result.value);
                });
            });
    }

    function editLicense(licenseId) {
        Promise.all([
            fetch('/api/licenses/' + licenseId).then(function(r) { return r.json(); }),
            fetch('/api/cabinets').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var data = results[0];
                var cabinets = results[1];
                if (data.error) { utils.showErrorMessage(data.error); return; }

                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    var selected = (cab.cabinet_number === data.cabinet) ? 'selected' : '';
                    cabinetOptions += '<option value="' + utils.escapeHtml(cab.cabinet_number) + '" ' + selected + '>' +
                        utils.escapeHtml(cab.cabinet_number + (cab.description ? ' - ' + cab.description : '')) +
                        '</option>';
                });

                Swal.fire({
                    title: 'Редактировать лицензию',
                    html: buildLicenseForm(cabinetOptions, data),
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    preConfirm: collectLicenseForm
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    putLicense(licenseId, result.value);
                });
            });
    }

    function buildLicenseForm(cabinetOptions, data) {
        data = data || {};
        var typeOptions = ['Корпоративная', 'Персональная', 'OEM', 'Подписка', 'Бессрочная', 'Временная', 'Свободная', 'Пробная'];
        var typeSelect = '';
        typeOptions.forEach(function(t) {
            var selected = (t === data.license_type) ? 'selected' : '';
            typeSelect += '<option value="' + t + '" ' + selected + '>' + t + '</option>';
        });

        return '<div class="mb-3 text-start"><label class="form-label">Кабинет *</label>' +
            '<select id="swal-cabinet" class="form-select">' +
            '<option value="">Выберите кабинет</option>' + cabinetOptions + '</select></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Программное обеспечение *</label>' +
            '<input id="swal-software" class="form-control" value="' + utils.escapeHtml(data.software_name || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Тип лицензии *</label>' +
            '<select id="swal-type" class="form-select">' +
            '<option value="">Выберите тип</option>' + typeSelect + '</select></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2">' + utils.escapeHtml(data.notes || '') + '</textarea></div>';
    }

    function collectLicenseForm() {
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

    function postLicense(data) {
        fetch('/api/licenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    Swal.fire({ icon: 'success', title: 'Лицензия добавлена!', timer: 1500, showConfirmButton: false });
                    loadLicensesPage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: res.error });
                }
            });
    }

    function putLicense(id, data) {
        fetch('/api/licenses/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.success) {
                    Swal.fire({ icon: 'success', title: 'Лицензия обновлена!', timer: 1500, showConfirmButton: false });
                    loadLicensesPage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: res.error });
                }
            });
    }

    function deleteLicense(id) {
        Swal.fire({
            title: 'Удалить лицензию?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/licenses/' + id, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Удалено!', timer: 1500, showConfirmButton: false });
                        loadLicensesPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.load = loadLicensesPage;
    api.showAdd = showAddLicenseModal;
    api.edit = editLicense;
    api.remove = deleteLicense;
    api.filter = filterLicenses;

    window.loadLicensesPage = loadLicensesPage;
    window.showAddLicenseModal = showAddLicenseModal;
    window.editLicense = editLicense;
    window.deleteLicense = deleteLicense;
    window.filterLicenses = filterLicenses;

    console.log('[licenses] Загружено');
})();