// static/js/cartridges/cartridges_form.js
// Формы добавления/редактирования картриджей + CRUD.
// Дата замены — только дата, без времени.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var Form = window.CartridgesForm = window.CartridgesForm || {};

    // ============================================================
    // ФОРМА
    // ============================================================
    function buildCartridgeForm(cabinetOptions, data) {
        data = data || {};
        var datesHtml = '';

        if (data.replacement_dates && data.replacement_dates.length > 0) {
            var reversed = data.replacement_dates.slice().sort().reverse();
            reversed.forEach(function(date) {
                // Берём только 'YYYY-MM-DD' из возможного 'YYYY-MM-DD HH:MM:SS'
                var dateValue = String(date).trim().substring(0, 10);
                datesHtml += '<div class="input-group mb-2">' +
                    '<input type="date" ' +
                    'class="form-control date-input" value="' +
                    dateValue + '">' +
                    '<button type="button" ' +
                    'class="btn btn-outline-danger" ' +
                    'onclick="removeDateField(this)">' +
                    '<i class="bi bi-trash"></i></button>' +
                    '</div>';
            });
        } else {
            datesHtml =
                '<div class="input-group mb-2">' +
                '<input type="date" ' +
                'class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" ' +
                'onclick="removeDateField(this)">' +
                '<i class="bi bi-trash"></i></button>' +
                '</div>';
        }

        return '<div class="mb-3 text-start">' +
            '<label class="form-label">Кабинет *</label>' +
            '<select id="swal-cabinet" class="form-control">' +
            '<option value="">Выберите кабинет</option>' +
            cabinetOptions + '</select></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">ФИО</label>' +
            '<input id="swal-fullname" class="form-control" value="' +
            utils.escapeHtml(data.full_name || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Принтер *</label>' +
            '<input id="swal-printer" class="form-control" value="' +
            utils.escapeHtml(data.printer || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Картридж *</label>' +
            '<input id="swal-cartridge" class="form-control" value="' +
            utils.escapeHtml(data.cartridge || '') + '"></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">' +
            'Даты замены <small class="text-muted">' +
            '(необязательно — можно оставить пустым)</small>' +
            '</label>' +
            '<button type="button" ' +
            'class="btn btn-sm btn-outline-primary mb-2 w-100" ' +
            'onclick="addDateField()">' +
            '<i class="bi bi-plus"></i> Добавить дату</button>' +
            '<div id="dates-container" ' +
            'style="max-height:200px;overflow-y:auto;padding:8px;' +
            'border:1px solid #dee2e6;border-radius:5px;">' +
            datesHtml + '</div>' +
            '<small class="text-muted d-block mt-1">' +
            '💡 Указывается только дата. ' +
            'Если замена ещё не выполнена — оставьте поле пустым.' +
            '</small></div>' +

            '<div class="mb-3 text-start">' +
            '<label class="form-label">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2">' +
            utils.escapeHtml(data.notes || '') + '</textarea></div>';
    }

    function initDatesHandlers() {
        window.addDateField = function() {
            var c = document.getElementById('dates-container');
            if (!c) return;
            var div = document.createElement('div');
            div.className = 'input-group mb-2';
            div.innerHTML =
                '<input type="date" ' +
                'class="form-control date-input">' +
                '<button type="button" class="btn btn-outline-danger" ' +
                'onclick="removeDateField(this)">' +
                '<i class="bi bi-trash"></i></button>';
            c.insertBefore(div, c.firstChild);
            c.scrollTop = 0;
        };
        window.removeDateField = function(btn) {
            var c = document.getElementById('dates-container');
            if (c.children.length > 1) {
                btn.closest('.input-group').remove();
            } else {
                var input = c.querySelector('.date-input');
                if (input) input.value = '';
            }
        };
    }

    function collectCartridgeForm() {
        var cabinet = document.getElementById('swal-cabinet').value;
        var printer = document.getElementById('swal-printer').value.trim();
        var cartridge = document.getElementById('swal-cartridge').value.trim();

        if (!cabinet || !printer || !cartridge) {
            Swal.showValidationMessage(
                'Заполните обязательные поля: Кабинет, Принтер, Картридж'
            );
            return false;
        }

        // Даты — 'YYYY-MM-DD' без времени.
        var dates = [];
        document.querySelectorAll('#dates-container .date-input')
            .forEach(function(input) {
                var v = (input.value || '').trim();
                if (v) dates.push(v);
            });

        return {
            cabinet: cabinet,
            full_name: document.getElementById('swal-fullname').value.trim(),
            printer: printer,
            cartridge: cartridge,
            replacement_dates: dates,
            notes: document.getElementById('swal-notes').value.trim(),
        };
    }

    // ============================================================
    // ДОБАВЛЕНИЕ
    // ============================================================
    Form.showAddModal = function() {
        api.get('/api/cabinets')
            .then(function(cabinets) {
                var cabinetOptions = '';
                (cabinets || []).forEach(function(cab) {
                    cabinetOptions += '<option value="' +
                        utils.escapeHtml(cab.cabinet_number) + '">' +
                        utils.escapeHtml(
                            cab.cabinet_number +
                            (cab.description ? ' - ' + cab.description : '')
                        ) + '</option>';
                });

                Swal.fire({
                    title: 'Добавить запись о замене картриджа',
                    html: buildCartridgeForm(cabinetOptions, null),
                    showCancelButton: true,
                    confirmButtonText: 'Добавить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    didOpen: function() { initDatesHandlers(); },
                    preConfirm: function() { return collectCartridgeForm(); },
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    postCartridge(result.value);
                });
            });
    };

    // ============================================================
    // РЕДАКТИРОВАНИЕ
    // ============================================================
    Form.edit = function(cartridgeId) {
        Promise.all([
            api.get('/api/cartridges/' + cartridgeId),
            api.get('/api/cabinets'),
        ])
            .then(function(results) {
                var data = results[0];
                var cabinets = results[1] || [];
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }

                var cabinetOptions = '';
                cabinets.forEach(function(cab) {
                    var selected = (cab.cabinet_number === data.cabinet)
                        ? 'selected' : '';
                    cabinetOptions += '<option value="' +
                        utils.escapeHtml(cab.cabinet_number) + '" ' +
                        selected + '>' +
                        utils.escapeHtml(
                            cab.cabinet_number +
                            (cab.description ? ' - ' + cab.description : '')
                        ) + '</option>';
                });

                Swal.fire({
                    title: 'Редактировать запись',
                    html: buildCartridgeForm(cabinetOptions, data),
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    didOpen: function() { initDatesHandlers(); },
                    preConfirm: function() { return collectCartridgeForm(); },
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    putCartridge(cartridgeId, result.value);
                });
            });
    };

    // ============================================================
    // HTTP
    // ============================================================
    function postCartridge(data) {
        api.post('/api/cartridges', data)
            .then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Запись добавлена!',
                        text: data.replacement_dates.length === 0
                            ? 'Дату замены можно указать позже'
                            : '',
                        timer: 1800,
                        showConfirmButton: false,
                    });
                    reloadList();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error,
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось сохранить',
                });
            });
    }

    function putCartridge(id, data) {
        api.put('/api/cartridges/' + id, data)
            .then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Запись обновлена!',
                        timer: 1500,
                        showConfirmButton: false,
                    });
                    reloadList();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error,
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось сохранить',
                });
            });
    }

    // ============================================================
    // УДАЛЕНИЕ
    // ============================================================
    Form.remove = function(id) {
        Swal.fire({
            title: 'Удалить запись?',
            text: 'Действие нельзя отменить',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(result) {
            if (!result.isConfirmed) return;
            api.delete('/api/cartridges/' + id)
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Удалено!',
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        reloadList();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    // ============================================================
    // ОЧИСТКА ДАТ
    // ============================================================
    Form.clearDates = function(id) {
        Swal.fire({
            title: 'Очистить даты?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Отмена',
        }).then(function(result) {
            if (!result.isConfirmed) return;
            api.post('/api/cartridges/' + id + '/clear-dates')
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Даты очищены!',
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        reloadList();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    };

    function reloadList() {
        if (window.App.Cartridges && window.App.Cartridges.load) {
            window.App.Cartridges.load();
        }
    }

    // Экспорт глобально
    window.showAddCartridgeModal = Form.showAddModal;
    window.editCartridge = Form.edit;
    window.deleteCartridge = Form.remove;
    window.clearCartridgeDates = Form.clearDates;

    console.log('[cartridges_form] Загружено (дата без времени)');
})();