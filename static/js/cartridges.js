// static/js/cartridges.js

// ============= ЗАГРУЗКА СТРАНИЦЫ КАРТРИДЖЕЙ =============
function loadCartridgesPage() {
    console.log('Loading cartridges page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка картриджей...</p>' +
        '</div>'
    );

    Promise.all([
        fetch('/api/cartridges').then(function(r) { return r.json(); }),
        fetch('/api/cartridges/statistics').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var cartridges = results[0];
        var stats = results[1];

        if (cartridges.error) {
            $contentBlock.html('<div class="alert alert-danger">' + cartridges.error + '</div>');
            return;
        }

        var html = '';

        // Статистика
        if (!stats.error) {
            html += '<div class="row mb-3">';
            html += '<div class="col-md-3"><div class="card bg-primary text-white"><div class="card-body text-center">';
            html += '<h3>' + stats.total + '</h3><small>Всего записей</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-success text-white"><div class="card-body text-center">';
            html += '<h3>' + stats.total_replacements + '</h3><small>Всего замен</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-info text-white"><div class="card-body text-center">';
            html += '<h3>' + stats.month_replacements + '</h3><small>Замен за месяц</small></div></div></div>';
            html += '<div class="col-md-3"><div class="card bg-warning text-white"><div class="card-body text-center">';
            html += '<h3>' + stats.year_replacements + '</h3><small>Замен за год</small></div></div></div>';
            html += '</div>';

            // Статистика по кабинетам
            if (stats.cabinet_stats && stats.cabinet_stats.length > 0) {
                html += '<div class="card mb-3"><div class="card-header bg-secondary text-white">';
                html += '<h6 class="mb-0"><i class="bi bi-door-open"></i> Статистика замен по кабинетам</h6>';
                html += '</div><div class="card-body"><div class="row">';
                stats.cabinet_stats.forEach(function(cab) {
                    html += '<div class="col-md-3 mb-2"><div class="border rounded p-2 text-center">';
                    html += '<strong>' + cab.cabinet + '</strong><br>';
                    html += '<small class="text-muted">Замен: ' + cab.replacements + '</small>';
                    html += '</div></div>';
                });
                html += '</div></div></div>';
            }
        }

        // Таблица
        html += '<div class="card">';
        html += '<div class="card-header bg-primary text-white">';
        html += '<div class="d-flex justify-content-between align-items-center">';
        html += '<h5 class="mb-0"><i class="bi bi-printer"></i> Замена картриджей</h5>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn btn-sm btn-light" onclick="loadCartridgesPage()">';
        html += '<i class="bi bi-arrow-clockwise"></i> Обновить';
        html += '</button>';
        html += '<button class="btn btn-sm btn-success" onclick="showAddCartridgeModal()">';
        html += '<i class="bi bi-plus-circle"></i> Добавить';
        html += '</button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="card-body">';
        html += '<div class="table-responsive">';
        html += '<table class="table table-striped table-hover">';
        html += '<thead><tr>';
        html += '<th>ID</th>';
        html += '<th>Кабинет</th>';
        html += '<th>ФИО</th>';
        html += '<th>Принтер</th>';
        html += '<th>Картридж</th>';
        html += '<th>Даты замены</th>';
        html += '<th>Примечание</th>';
        html += '<th>Действия</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        if (cartridges.length === 0) {
            html += '<tr><td colspan="8" class="text-center">Нет записей</td></tr>';
        } else {
            cartridges.forEach(function(cart) {
                var datesHtml = '';
                if (cart.replacement_dates && cart.replacement_dates.length > 0) {
                    datesHtml = '<ul class="list-unstyled mb-0 small">';
                    cart.replacement_dates.forEach(function(date) {
                        if (date.trim()) {
                            datesHtml += '<li>' + formatDate(date.trim()) + '</li>';
                        }
                    });
                    datesHtml += '</ul>';
                } else {
                    datesHtml = '<span class="text-muted">Не указаны</span>';
                }

                html += '<tr>';
                html += '<td>' + cart.id + '</td>';
                html += '<td>' + (cart.cabinet || '-') + '</td>';
                html += '<td>' + (cart.full_name || '-') + '</td>';
                html += '<td>' + (cart.printer || '-') + '</td>';
                html += '<td>' + (cart.cartridge || '-') + '</td>';
                html += '<td>' + datesHtml + '</td>';
                html += '<td>' + (cart.notes || '-') + '</td>';
                html += '<td>';
                html += '<div class="btn-group btn-group-sm">';
                html += '<button class="btn btn-outline-success" onclick="editCartridge(' + cart.id + ')" title="Редактировать">';
                html += '<i class="bi bi-pencil"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-danger" onclick="deleteCartridge(' + cart.id + ')" title="Удалить">';
                html += '<i class="bi bi-trash"></i>';
                html += '</button>';
                html += '<button class="btn btn-outline-warning" onclick="clearCartridgeDates(' + cart.id + ')" title="Очистить даты">';
                html += '<i class="bi bi-calendar-x"></i>';
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
        console.error('Error loading cartridges:', error);
        $contentBlock.html(
            '<div class="alert alert-danger">Ошибка загрузки картриджей: ' + error.message + '</div>'
        );
    });
}

// Показать модальное окно добавления картриджа
function showAddCartridgeModal() {
    fetch('/api/cabinets')
        .then(function(r) { return r.json(); })
        .then(function(cabinets) {
            var cabinetOptions = '';
            cabinets.forEach(function(cab) {
                cabinetOptions += '<option value="' + cab.cabinet_number + '">' + cab.cabinet_number + (cab.description ? ' - ' + cab.description : '') + '</option>';
            });

            Swal.fire({
                title: 'Добавить запись о замене картриджа',
                html:
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Кабинет *</label>' +
                    '<select id="swal-cabinet" class="form-control">' +
                    '<option value="">Выберите кабинет</option>' +
                    cabinetOptions +
                    '</select>' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">ФИО</label>' +
                    '<input id="swal-fullname" class="form-control" placeholder="Например: Иванов И.И.">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Принтер *</label>' +
                    '<input id="swal-printer" class="form-control" placeholder="Модель принтера">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Картридж *</label>' +
                    '<input id="swal-cartridge" class="form-control" placeholder="Модель картриджа">' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Даты замены</label>' +
                    '<button type="button" class="btn btn-sm btn-outline-primary mb-2 w-100" onclick="addDateField()">' +
                    '<i class="bi bi-plus"></i> Добавить дату' +
                    '</button>' +
                    '<div id="dates-container" style="max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">' +
                    '<div class="input-group mb-2">' +
                    '<input type="datetime-local" class="form-control date-input">' +
                    '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>' +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '<div class="mb-3 text-start">' +
                    '<label class="form-label">Примечание</label>' +
                    '<textarea id="swal-notes" class="form-control" rows="2" placeholder="Примечание"></textarea>' +
                    '</div>',
                showCancelButton: true,
                confirmButtonText: 'Добавить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                customClass: {
                    popup: 'swal-wide'
                },
                didOpen: function() {
                    window.addDateField = function() {
                        var container = document.getElementById('dates-container');
                        var div = document.createElement('div');
                        div.className = 'input-group mb-2';
                        div.innerHTML = '<input type="datetime-local" class="form-control date-input"><button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>';
                        container.insertBefore(div, container.firstChild);
                        container.scrollTop = 0;
                        setTimeout(function() {
                            div.querySelector('input').focus();
                        }, 100);
                    };
                    window.removeDateField = function(btn) {
                        var container = document.getElementById('dates-container');
                        if (container.children.length > 1) {
                            btn.closest('.input-group').remove();
                        }
                    };
                },
                preConfirm: function() {
                    var cabinet = document.getElementById('swal-cabinet').value;
                    var printer = document.getElementById('swal-printer').value.trim();
                    var cartridge = document.getElementById('swal-cartridge').value.trim();

                    if (!cabinet || !printer || !cartridge) {
                        Swal.showValidationMessage('Заполните обязательные поля (Кабинет, Принтер, Картридж)');
                        return false;
                    }

                    var dates = [];
                    document.querySelectorAll('.date-input').forEach(function(input) {
                        if (input.value) {
                            dates.push(input.value.replace('T', ' ') + ':00');
                        }
                    });

                    return {
                        cabinet: cabinet,
                        full_name: document.getElementById('swal-fullname').value.trim(),
                        printer: printer,
                        cartridge: cartridge,
                        replacement_dates: dates,
                        notes: document.getElementById('swal-notes').value.trim()
                    };
                }
            }).then(function(result) {
                if (result.isConfirmed) {
                    fetch('/api/cartridges', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            Swal.fire({ icon: 'success', title: 'Запись добавлена!', timer: 1500, showConfirmButton: false });
                            loadCartridgesPage();
                        } else {
                            Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                        }
                    });
                }
            });
        });
}

// Редактирование записи картриджа
function editCartridge(cartridgeId) {
    Promise.all([
        fetch('/api/cartridges/' + cartridgeId).then(function(r) { return r.json(); }),
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

        var datesHtml = '<button type="button" class="btn btn-sm btn-outline-primary mb-2 w-100" onclick="addDateField()">' +
            '<i class="bi bi-plus"></i> Добавить дату' +
            '</button>' +
            '<div id="dates-container" style="max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">';

        if (data.replacement_dates && data.replacement_dates.length > 0) {
            var reversedDates = data.replacement_dates.slice().reverse();
            reversedDates.forEach(function(date) {
                if (date.trim()) {
                    var dateValue = date.trim().replace(' ', 'T').substring(0, 16);
                    datesHtml += '<div class="input-group mb-2">';
                    datesHtml += '<input type="datetime-local" class="form-control date-input" value="' + dateValue + '">';
                    datesHtml += '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>';
                    datesHtml += '</div>';
                }
            });
        } else {
            datesHtml += '<div class="input-group mb-2">';
            datesHtml += '<input type="datetime-local" class="form-control date-input">';
            datesHtml += '<button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>';
            datesHtml += '</div>';
        }
        datesHtml += '</div>';

        Swal.fire({
            title: 'Редактировать запись',
            html:
                '<div class="mb-3 text-start">' +
                '<label class="form-label">Кабинет *</label>' +
                '<select id="swal-cabinet" class="form-control">' +
                '<option value="">Выберите кабинет</option>' +
                cabinetOptions +
                '</select>' +
                '</div>' +
                '<div class="mb-3 text-start">' +
                '<label class="form-label">ФИО</label>' +
                '<input id="swal-fullname" class="form-control" value="' + (data.full_name || '') + '">' +
                '</div>' +
                '<div class="mb-3 text-start">' +
                '<label class="form-label">Принтер *</label>' +
                '<input id="swal-printer" class="form-control" value="' + (data.printer || '') + '">' +
                '</div>' +
                '<div class="mb-3 text-start">' +
                '<label class="form-label">Картридж *</label>' +
                '<input id="swal-cartridge" class="form-control" value="' + (data.cartridge || '') + '">' +
                '</div>' +
                '<div class="mb-3 text-start">' +
                '<label class="form-label">Даты замены</label>' +
                datesHtml +
                '</div>' +
                '<div class="mb-3 text-start">' +
                '<label class="form-label">Примечание</label>' +
                '<textarea id="swal-notes" class="form-control" rows="2">' + (data.notes || '') + '</textarea>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: {
                popup: 'swal-wide'
            },
            didOpen: function() {
                window.addDateField = function() {
                    var container = document.getElementById('dates-container');
                    var div = document.createElement('div');
                    div.className = 'input-group mb-2';
                    div.innerHTML = '<input type="datetime-local" class="form-control date-input"><button type="button" class="btn btn-outline-danger" onclick="removeDateField(this)" title="Удалить"><i class="bi bi-trash"></i></button>';
                    container.insertBefore(div, container.firstChild);
                    container.scrollTop = 0;
                    setTimeout(function() {
                        div.querySelector('input').focus();
                    }, 100);
                };
                window.removeDateField = function(btn) {
                    var container = document.getElementById('dates-container');
                    if (container.children.length > 1) {
                        btn.closest('.input-group').remove();
                    }
                };
            },
            preConfirm: function() {
                var cabinet = document.getElementById('swal-cabinet').value;
                var printer = document.getElementById('swal-printer').value.trim();
                var cartridge = document.getElementById('swal-cartridge').value.trim();

                if (!cabinet || !printer || !cartridge) {
                    Swal.showValidationMessage('Заполните обязательные поля');
                    return false;
                }

                var dates = [];
                document.querySelectorAll('.date-input').forEach(function(input) {
                    if (input.value) {
                        dates.push(input.value.replace('T', ' ') + ':00');
                    }
                });

                return {
                    cabinet: cabinet,
                    full_name: document.getElementById('swal-fullname').value.trim(),
                    printer: printer,
                    cartridge: cartridge,
                    replacement_dates: dates,
                    notes: document.getElementById('swal-notes').value.trim()
                };
            }
        }).then(function(result) {
            if (result.isConfirmed) {
                fetch('/api/cartridges/' + cartridgeId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.value)
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Запись обновлена!', timer: 1500, showConfirmButton: false });
                        loadCartridgesPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
            }
        });
    });
}

// Удаление записи картриджа
function deleteCartridge(cartridgeId) {
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
            fetch('/api/cartridges/' + cartridgeId, {
                method: 'DELETE'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: 'Запись удалена!', timer: 1500, showConfirmButton: false });
                    loadCartridgesPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

// Очистка дат картриджа
function clearCartridgeDates(cartridgeId) {
    Swal.fire({
        title: 'Очистить даты?',
        text: 'Даты замены будут очищены для этой записи.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Да, очистить',
        cancelButtonText: 'Отмена'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/cartridges/' + cartridgeId + '/clear-dates', {
                method: 'POST'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: 'Даты очищены!', timer: 1500, showConfirmButton: false });
                    loadCartridgesPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

console.log('Cartridges module loaded');