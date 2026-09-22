// static/js/cabinet_device_modals.js
// CRUD-модалки для устройств кабинета: сеть, ПК, принтеры.
// Экспортирует глобальные функции showAddNetwork / editNetwork / ...

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_device_modals] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    function Cabinet() { return window.App.Cabinet; }

    // ============================================================
    // СЕТЕВОЕ ОБОРУДОВАНИЕ
    // ============================================================
    function showAddNetwork() { editNetwork(null); }

    function editNetwork(deviceId) {
        var d = deviceId
            ? Cabinet().data.network_devices.find(function(x) {
                return x.id === deviceId;
            })
            : {};
        var data = d || {};

        Swal.fire({
            title: deviceId
                ? 'Редактировать устройство'
                : 'Добавить сетевое устройство',
            html: '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Тип *</label>' +
                '<select id="eq-net-type" class="form-select">' +
                ['Свитч','Маршрутизатор','Коммутатор','Точка доступа',
                 'Модем','Прочее']
                    .map(function(t) {
                        return '<option value="' + t + '"' +
                            (t === data.device_type ? ' selected' : '') +
                            '>' + t + '</option>';
                    }).join('') +
                '</select></div>' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-net-model" class="form-control" value="' +
                utils.escapeHtml(data.model || '') + '"></div>' +
                '<div class="mb-2">' +
                '<label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-net-inv" class="form-control" value="' +
                utils.escapeHtml(data.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-net-ip" class="form-control" value="' +
                utils.escapeHtml(data.ip_address || '') + '" ' +
                'placeholder="192.168.1.1"></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-net-notes" class="form-control" rows="2">' +
                utils.escapeHtml(data.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                var model = Cabinet().getTrimmed('eq-net-model');
                if (!model) {
                    Swal.showValidationMessage('Введите модель');
                    return false;
                }
                return {
                    device_type: Cabinet().getVal('eq-net-type'),
                    model: model,
                    inventory_number: Cabinet().getTrimmed('eq-net-inv'),
                    ip_address: Cabinet().getTrimmed('eq-net-ip'),
                    notes: Cabinet().getTrimmed('eq-net-notes'),
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = deviceId
                ? '/api/network/' + deviceId
                : '/api/cabinets/' + Cabinet().currentId + '/network';
            var method = deviceId ? 'put' : 'post';

            api[method](url, r.value)
                .then(function() {
                    utils.showSuccessMessage('Сохранено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // КОМПЬЮТЕРЫ
    // ============================================================
    function showAddComputer() { editComputer(null); }

    function editComputer(pcId) {
        var p = pcId
            ? Cabinet().data.computers.find(function(x) { return x.id === pcId; })
            : {};
        var data = p || {};

        var ram = (data.ram && data.ram.length > 0)
            ? data.ram.slice()
            : [{ size: '', type: 'DDR4' }];
        var storage = (data.storage && data.storage.length > 0)
            ? data.storage.slice()
            : [{ capacity: '', type: 'SSD' }];
        var software = (data.software || []).slice();
        var available = Cabinet().software || [];

        function ramRowHtml(r) {
            var numVal = (r.size || '').replace(/\s*(GB|TB|MB)\s*$/i, '');
            return '<div class="eq-ram-row">' +
                '<input class="form-control form-control-sm eq-ram-size" ' +
                'value="' + utils.escapeHtml(numVal) + '" placeholder="8" ' +
                'type="number" min="1" max="999">' +
                '<span class="eq-unit-label">GB</span>' +
                '<select class="form-select form-select-sm eq-ram-type">' +
                ['DDR3','DDR4','DDR5','LPDDR4','LPDDR5'].map(function(t) {
                    return '<option value="' + t + '"' +
                        (t === r.type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') +
                '<button type="button" ' +
                'class="btn btn-sm btn-outline-danger" ' +
                'onclick="this.closest(\'.eq-ram-row\').remove()">' +
                '<i class="bi bi-x"></i></button></div>';
        }

        function storageRowHtml(s) {
            var val = (s.capacity || '').trim();
            var suffix = 'GB';
            if (/\s*TB/i.test(val)) {
                suffix = 'TB';
                val = val.replace(/\s*TB/i, '');
            } else {
                val = val.replace(/\s*GB/i, '');
            }

            return '<div class="eq-storage-row">' +
                '<input class="form-control form-control-sm eq-storage-cap" ' +
                'value="' + utils.escapeHtml(val) + '" placeholder="512" ' +
                'type="number" min="1" max="9999">' +
                '<select class="form-select form-select-sm eq-storage-unit">' +
                '<option value="GB"' + (suffix === 'GB' ? ' selected' : '') +
                '>GB</option>' +
                '<option value="TB"' + (suffix === 'TB' ? ' selected' : '') +
                '>TB</option></select>' +
                '<select class="form-select form-select-sm eq-storage-type">' +
                ['SSD','HDD','NVMe','SSD M.2','eMMC'].map(function(t) {
                    return '<option value="' + t + '"' +
                        (t === s.type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') +
                '<button type="button" ' +
                'class="btn btn-sm btn-outline-danger" ' +
                'onclick="this.closest(\'.eq-storage-row\').remove()">' +
                '<i class="bi bi-x"></i></button></div>';
        }

        function selectedSoftwareList() {
            if (software.length === 0) {
                return '<div class="text-muted small p-2">' +
                    '— ничего не выбрано —</div>';
            }
            return software.map(function(s, i) {
                return '<div class="d-flex justify-content-between ' +
                    'align-items-center mb-1 eq-software-item">' +
                    '<span><i class="bi bi-window"></i> ' +
                    utils.escapeHtml(s) + '</span>' +
                    '<button type="button" ' +
                    'class="btn btn-sm btn-outline-danger" ' +
                    'onclick="removeSoftwareAt(' + i + ')">' +
                    '<i class="bi bi-x"></i></button></div>';
            }).join('');
        }

        function availableSoftwareList() {
            if (available.length === 0) {
                return '<div class="text-muted small p-2">' +
                    'В лицензиях кабинета нет ПО.</div>';
            }
            return available.map(function(a) {
                var checked = (software.indexOf(a.name) !== -1)
                    ? ' checked' : '';
                var dataName = utils.escapeHtml(a.name);
                return '<label class="eq-software-check">' +
                    '<input type="checkbox" data-software-name="' +
                    dataName + '" ' + checked + '>' +
                    '<span>' + utils.escapeHtml(a.name) +
                    (a.type
                        ? ' <small class="text-muted">(' +
                          utils.escapeHtml(a.type) + ')</small>'
                        : '') +
                    '</span></label>';
            }).join('');
        }

        var modalHtml =
            '<div class="text-start eq-pc-form">' +
            '<div class="row g-2">' +
                '<div class="col-md-6">' +
                '<label class="form-label">Название *</label>' +
                '<input id="eq-pc-name" class="form-control" value="' +
                utils.escapeHtml(data.name || '') + '"></div>' +
                '<div class="col-md-6">' +
                '<label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pc-inv" class="form-control" value="' +
                utils.escapeHtml(data.inventory_number || '') + '"></div>' +
                '<div class="col-md-6">' +
                '<label class="form-label">Материнская плата</label>' +
                '<input id="eq-pc-mb" class="form-control" value="' +
                utils.escapeHtml(data.motherboard || '') + '"></div>' +
                '<div class="col-md-6">' +
                '<label class="form-label">Сокет материнской платы</label>' +
                '<input id="eq-pc-socket" class="form-control" value="' +
                utils.escapeHtml(data.motherboard_socket || '') +
                '" list="socket-list">' +
                '<datalist id="socket-list">' +
                '<option value="LGA1151"><option value="LGA1200">' +
                '<option value="LGA1700"><option value="AM4">' +
                '<option value="AM5"></datalist></div>' +
                '<div class="col-md-6">' +
                '<label class="form-label">Процессор</label>' +
                '<input id="eq-pc-cpu" class="form-control" value="' +
                utils.escapeHtml(data.cpu || '') + '"></div>' +
                '<div class="col-md-6"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-pc-ip" class="form-control" value="' +
                utils.escapeHtml(data.ip_address || '') + '"></div>' +
            '</div>' +
            '<div class="eq-form-block mt-3">' +
                '<label class="form-label">ОЗУ ' +
                '<small class="text-muted">(в GB)</small></label>' +
                '<div id="eq-ram-container" class="eq-list-container">' +
                ram.map(ramRowHtml).join('') + '</div>' +
                '<button type="button" ' +
                'class="btn btn-sm btn-outline-primary w-100 mt-1" ' +
                'onclick="addRamRow()">' +
                '<i class="bi bi-plus"></i> Добавить планку</button>' +
            '</div>' +
            '<div class="eq-form-block mt-3">' +
                '<label class="form-label">Диски</label>' +
                '<div id="eq-storage-container" class="eq-list-container">' +
                storage.map(storageRowHtml).join('') + '</div>' +
                '<button type="button" ' +
                'class="btn btn-sm btn-outline-primary w-100 mt-1" ' +
                'onclick="addStorageRow()">' +
                '<i class="bi bi-plus"></i> Добавить диск</button>' +
            '</div>' +
            '<div class="eq-form-block mt-3">' +
                '<label class="form-label">' +
                '<i class="bi bi-window-stack"></i> Установленное ПО</label>' +
                '<div id="eq-software-selected" class="eq-selected-box">' +
                selectedSoftwareList() + '</div>' +
                '<button type="button" ' +
                'class="btn btn-sm btn-outline-primary w-100 my-2" ' +
                'onclick="toggleAvailableSoftware()">' +
                '<i class="bi bi-list-check"></i> ' +
                '<span id="eq-toggle-soft-label">' +
                'Показать доступные ПО</span></button>' +
                '<div id="eq-software-available" class="eq-available-box" ' +
                'style="display:none">' + availableSoftwareList() + '</div>' +
                '<div class="input-group input-group-sm mt-2">' +
                '<input id="eq-manual-soft" class="form-control" ' +
                'placeholder="Или введите название вручную">' +
                '<button type="button" class="btn btn-outline-primary" ' +
                'onclick="addManualSoftware()">' +
                '<i class="bi bi-plus"></i> Добавить</button></div>' +
            '</div>' +
            '<div class="eq-form-block mt-3">' +
                '<label class="form-label">Примечание</label>' +
                '<textarea id="eq-pc-notes" class="form-control" rows="2">' +
                utils.escapeHtml(data.notes || '') + '</textarea></div>' +
            '</div>';

        Swal.fire({
            title: pcId ? 'Редактировать ПК' : 'Добавить компьютер',
            width: 780,
            html: modalHtml,
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            didOpen: function() {
                window.addRamRow = function() {
                    var c = document.getElementById('eq-ram-container');
                    if (!c) return;
                    var div = document.createElement('div');
                    div.className = 'eq-ram-row';
                    div.innerHTML =
                        '<input class="form-control form-control-sm ' +
                        'eq-ram-size" placeholder="8" type="number" ' +
                        'min="1" max="999">' +
                        '<span class="eq-unit-label">GB</span>' +
                        '<select class="form-select form-select-sm ' +
                        'eq-ram-type">' +
                        '<option>DDR3</option>' +
                        '<option selected>DDR4</option>' +
                        '<option>DDR5</option></select>' +
                        '<button type="button" ' +
                        'class="btn btn-sm btn-outline-danger" ' +
                        'onclick="this.closest(\'.eq-ram-row\').remove()">' +
                        '<i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };

                window.addStorageRow = function() {
                    var c = document.getElementById('eq-storage-container');
                    if (!c) return;
                    var div = document.createElement('div');
                    div.className = 'eq-storage-row';
                    div.innerHTML =
                        '<input class="form-control form-control-sm ' +
                        'eq-storage-cap" placeholder="512" type="number" ' +
                        'min="1" max="9999">' +
                        '<select class="form-select form-select-sm ' +
                        'eq-storage-unit">' +
                        '<option value="GB" selected>GB</option>' +
                        '<option value="TB">TB</option></select>' +
                        '<select class="form-select form-select-sm ' +
                        'eq-storage-type">' +
                        '<option selected>SSD</option>' +
                        '<option>HDD</option>' +
                        '<option>NVMe</option></select>' +
                        '<button type="button" ' +
                        'class="btn btn-sm btn-outline-danger" ' +
                        'onclick="this.closest(\'.eq-storage-row\').remove()">' +
                        '<i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };

                function refreshSelectedSoftware() {
                    var cont = document.getElementById('eq-software-selected');
                    if (cont) cont.innerHTML = selectedSoftwareList();
                }

                function refreshAvailableCheckboxes() {
                    var list = document.getElementById('eq-software-available');
                    if (!list) return;
                    var checkboxes = list.querySelectorAll(
                        'input[type="checkbox"][data-software-name]'
                    );
                    checkboxes.forEach(function(cb) {
                        var n = cb.getAttribute('data-software-name');
                        cb.checked = (software.indexOf(n) !== -1);
                    });
                }

                window.removeSoftwareAt = function(idx) {
                    software.splice(idx, 1);
                    refreshSelectedSoftware();
                    refreshAvailableCheckboxes();
                };

                window.toggleAvailableSoftware = function() {
                    var block = document.getElementById(
                        'eq-software-available'
                    );
                    var label = document.getElementById(
                        'eq-toggle-soft-label'
                    );
                    if (!block) return;
                    if (block.style.display === 'none') {
                        block.style.display = 'block';
                        if (label) {
                            label.textContent = 'Скрыть доступные ПО';
                        }
                    } else {
                        block.style.display = 'none';
                        if (label) {
                            label.textContent = 'Показать доступные ПО';
                        }
                    }
                };

                var listEl = document.getElementById('eq-software-available');
                if (listEl) {
                    listEl.addEventListener('change', function(e) {
                        var cb = e.target;
                        if (!cb || cb.type !== 'checkbox') return;
                        var name = cb.getAttribute('data-software-name');
                        if (!name) return;
                        var idx = software.indexOf(name);
                        if (cb.checked && idx === -1) software.push(name);
                        else if (!cb.checked && idx !== -1) {
                            software.splice(idx, 1);
                        }
                        refreshSelectedSoftware();
                    });
                }

                window.addManualSoftware = function() {
                    var input = document.getElementById('eq-manual-soft');
                    if (!input) return;
                    var v = (input.value || '').trim();
                    if (!v) return;
                    if (software.indexOf(v) === -1) {
                        software.push(v);
                        input.value = '';
                        refreshSelectedSoftware();
                        refreshAvailableCheckboxes();
                    }
                };
            },
            preConfirm: function() {
                var name = Cabinet().getTrimmed('eq-pc-name');
                if (!name) {
                    Swal.showValidationMessage('Введите название ПК');
                    return false;
                }

                var ramArr = [];
                document.querySelectorAll('#eq-ram-container .eq-ram-row')
                    .forEach(function(row) {
                        var sizeEl = row.querySelector('.eq-ram-size');
                        var typeEl = row.querySelector('.eq-ram-type');
                        if (!sizeEl || !typeEl) return;
                        var val = (sizeEl.value || '').trim();
                        if (val) ramArr.push({
                            size: val + ' GB',
                            type: typeEl.value,
                        });
                    });

                var storageArr = [];
                document.querySelectorAll(
                    '#eq-storage-container .eq-storage-row'
                ).forEach(function(row) {
                    var capEl = row.querySelector('.eq-storage-cap');
                    var typeEl = row.querySelector('.eq-storage-type');
                    var unitEl = row.querySelector('.eq-storage-unit');
                    if (!capEl || !typeEl) return;
                    var cap = (capEl.value || '').trim();
                    var unit = unitEl ? unitEl.value : 'GB';
                    if (cap) storageArr.push({
                        capacity: cap + ' ' + unit,
                        type: typeEl.value,
                    });
                });

                return {
                    name: name,
                    motherboard: Cabinet().getTrimmed('eq-pc-mb'),
                    motherboard_socket: Cabinet().getTrimmed('eq-pc-socket'),
                    cpu: Cabinet().getTrimmed('eq-pc-cpu'),
                    inventory_number: Cabinet().getTrimmed('eq-pc-inv'),
                    ip_address: Cabinet().getTrimmed('eq-pc-ip'),
                    ram: ramArr,
                    storage: storageArr,
                    software: software.slice(),
                    notes: Cabinet().getTrimmed('eq-pc-notes'),
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = pcId
                ? '/api/computers/' + pcId
                : '/api/cabinets/' + Cabinet().currentId + '/computers';
            var method = pcId ? 'put' : 'post';

            api[method](url, r.value)
                .then(function() {
                    utils.showSuccessMessage('Сохранено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // ПРИНТЕРЫ
    // ============================================================
    function showAddPrinter() { editPrinter(null); }

    function editPrinter(printerId) {
        var pr = printerId
            ? Cabinet().data.printers.find(function(x) {
                return x.id === printerId;
            })
            : {};
        var data = pr || {};
        var connType = data.connection_type || 'network';

        var pcOptions = Cabinet().data.computers.map(function(pc) {
            var sel = (data.connected_to_pc_id === pc.id) ? ' selected' : '';
            return '<option value="' + pc.id + '"' + sel + '>' +
                utils.escapeHtml(pc.name || 'ПК #' + pc.id) + '</option>';
        }).join('');

        Swal.fire({
            title: printerId ? 'Редактировать принтер' : 'Добавить принтер',
            html: '<div class="text-start">' +
                '<div class="mb-3">' +
                '<label class="form-label">Тип подключения *</label>' +
                '<div class="btn-group w-100" role="group">' +
                    '<input type="radio" class="btn-check" name="pr-conn" ' +
                    'id="pr-conn-net" value="network"' +
                    (connType === 'network' ? ' checked' : '') + '>' +
                    '<label class="btn btn-outline-primary" for="pr-conn-net">' +
                    '<i class="bi bi-globe"></i> Сетевой</label>' +
                    '<input type="radio" class="btn-check" name="pr-conn" ' +
                    'id="pr-conn-usb" value="usb"' +
                    (connType === 'usb' ? ' checked' : '') + '>' +
                    '<label class="btn btn-outline-primary" for="pr-conn-usb">' +
                    '<i class="bi bi-usb-symbol"></i> USB (к ПК)</label>' +
                '</div></div>' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-pr-model" class="form-control" value="' +
                utils.escapeHtml(data.model || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Картридж</label>' +
                '<input id="eq-pr-cart" class="form-control" value="' +
                utils.escapeHtml(data.cartridge || '') + '"></div>' +
                '<div class="mb-2">' +
                '<label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pr-inv" class="form-control" value="' +
                utils.escapeHtml(data.inventory_number || '') + '"></div>' +
                '<div class="mb-2" id="eq-pr-ip-block">' +
                '<label class="form-label">IP-адрес</label>' +
                '<input id="eq-pr-ip" class="form-control" value="' +
                utils.escapeHtml(data.ip_address || '') + '"></div>' +
                '<div class="mb-2" id="eq-pr-pc-block">' +
                '<label class="form-label">Подключен к ПК</label>' +
                '<select id="eq-pr-pc" class="form-select">' +
                '<option value="">— не подключен —</option>' +
                pcOptions + '</select></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-pr-notes" class="form-control" rows="2">' +
                utils.escapeHtml(data.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            didOpen: function() {
                function updateConnFields() {
                    var checked = document.querySelector(
                        'input[name="pr-conn"]:checked'
                    );
                    var v = checked ? checked.value : 'network';
                    var isNet = (v === 'network');
                    var ipBlock = document.getElementById('eq-pr-ip-block');
                    var pcBlock = document.getElementById('eq-pr-pc-block');
                    if (ipBlock) ipBlock.style.display = isNet ? '' : 'none';
                    if (pcBlock) pcBlock.style.display = isNet ? 'none' : '';
                }
                document.querySelectorAll('input[name="pr-conn"]')
                    .forEach(function(r) {
                        r.addEventListener('change', updateConnFields);
                    });
                updateConnFields();
            },
            preConfirm: function() {
                var model = Cabinet().getTrimmed('eq-pr-model');
                if (!model) {
                    Swal.showValidationMessage('Введите модель');
                    return false;
                }

                var checked = document.querySelector(
                    'input[name="pr-conn"]:checked'
                );
                var conn = checked ? checked.value : 'network';

                var result = {
                    model: model,
                    cartridge: Cabinet().getTrimmed('eq-pr-cart'),
                    inventory_number: Cabinet().getTrimmed('eq-pr-inv'),
                    notes: Cabinet().getTrimmed('eq-pr-notes'),
                    connection_type: conn,
                };

                if (conn === 'network') {
                    result.ip_address = Cabinet().getTrimmed('eq-pr-ip');
                    result.connected_to_pc_id = null;
                } else {
                    result.ip_address = '';
                    result.connected_to_pc_id =
                        Cabinet().getVal('eq-pr-pc') || null;
                }
                return result;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = printerId
                ? '/api/printers/' + printerId
                : '/api/cabinets/' + Cabinet().currentId + '/printers';
            var method = printerId ? 'put' : 'post';

            api[method](url, r.value)
                .then(function() {
                    utils.showSuccessMessage('Сохранено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    var mod = window.App.register('CabinetDeviceModals');
    mod.showAddNetwork = showAddNetwork;
    mod.editNetwork = editNetwork;
    mod.showAddComputer = showAddComputer;
    mod.editComputer = editComputer;
    mod.showAddPrinter = showAddPrinter;
    mod.editPrinter = editPrinter;

    window.showAddNetwork = showAddNetwork;
    window.editNetwork = editNetwork;
    window.showAddComputer = showAddComputer;
    window.editComputer = editComputer;
    window.showAddPrinter = showAddPrinter;
    window.editPrinter = editPrinter;

    console.log('[cabinet_device_modals] Загружено');
})();