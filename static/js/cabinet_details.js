// static/js/cabinet_details.js
// Детальная страница кабинета: сетевое оборудование, ПК, принтеры

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_details] App не инициализирован');
        return;
    }

    var api = window.App.register('CabinetDetails');
    var utils = window.App.utils;

    var currentCabinetId = null;
    var currentData = null;   // {cabinet, network_devices, computers, printers}

    var isAdmin = function() {
        return window.currentUserRole === 'Администратор';
    };

    // ============================================================
    // ОТКРЫТИЕ СТРАНИЦЫ
    // ============================================================
    function open(cabinetId) {
        currentCabinetId = cabinetId;

        var $b = $('#otherPagesBlock');
        $b.html('<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Загрузка...</p></div>');
        $('#tasksBlock').hide();
        $b.show();

        // Скрываем другие активные пункты меню
        $('.sidebar .nav-link').removeClass('active');

        loadData();
    }

    function loadData() {
        fetch('/api/cabinets/' + currentCabinetId + '/details')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) {
                    $('#otherPagesBlock').html('<div class="alert alert-danger">' + utils.escapeHtml(data.error) + '</div>');
                    return;
                }
                currentData = data;
                render();
            })
            .catch(function(err) {
                console.error('[cabinet_details] load error:', err);
                $('#otherPagesBlock').html('<div class="alert alert-danger">Не удалось загрузить кабинет</div>');
            });
    }

    // ============================================================
    // РЕНДЕР СТРАНИЦЫ
    // ============================================================
    function render() {
        var c = currentData.cabinet;
        var net = currentData.network_devices || [];
        var pcs = currentData.computers || [];
        var printers = currentData.printers || [];

        var html = '';

        // ---- Шапка ----
        html += '<div class="eq-header">';
        html += '<div>';
        html += '<h4><i class="bi bi-door-closed"></i> ' + utils.escapeHtml(c.cabinet_number || 'Кабинет') + '</h4>';
        if (c.description) {
            html += '<small style="opacity:.85">' + utils.escapeHtml(c.description) + '</small>';
        }
        html += '</div>';
        html += '<button class="btn eq-back-btn" onclick="loadCabinetsManagePage()">';
        html += '<i class="bi bi-arrow-left"></i> К списку кабинетов</button>';
        html += '</div>';

        // ---- Инфо о кабинете ----
        html += '<div class="eq-cabinet-info">';
        if (c.floor) html += infoBlock('Этаж', c.floor);
        if (c.building) html += infoBlock('Корпус', c.building);
        if (c.responsible_person) html += infoBlock('Ответственный', c.responsible_person);
        if (c.phone) html += infoBlock('Телефон', c.phone);
        html += '</div>';

        // ---- KPI ----
        var onlineCount = pcs.filter(function(p) { return p.status === 'online'; }).length;
        html += '<div class="row mb-3 g-3">';
        html += kpiCard('Сетевых устройств', net.length, 'bi-hdd-network', 'info');
        html += kpiCard('Компьютеров', pcs.length + (onlineCount > 0 ? ' <small style="font-size:.55em;opacity:.75">(' + onlineCount + ' online)</small>' : ''), 'bi-pc-display', 'primary');
        html += kpiCard('Принтеров', printers.length, 'bi-printer', 'success');
        html += kpiCard('Всего единиц', net.length + pcs.length + printers.length, 'bi-boxes', 'warning');
        html += '</div>';

        // ---- Сетка оборудования ----
        html += '<div class="eq-grid">';

        // Сеть
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-hdd-network"></i> Сетевое оборудование <span class="badge bg-secondary">' + net.length + '</span></h6>';
        if (isAdmin()) {
            html += '<button class="btn btn-sm btn-success" onclick="showAddNetwork()"><i class="bi bi-plus-circle"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (net.length === 0) {
            html += emptyState('bi-hdd-network', 'Оборудование не добавлено');
        } else {
            net.forEach(function(d) {
                html += renderNetworkDevice(d);
            });
        }
        html += '</div></div>';

        // Компьютеры
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-pc-display"></i> Компьютеры <span class="badge bg-secondary">' + pcs.length + '</span></h6>';
        if (isAdmin()) {
            html += '<button class="btn btn-sm btn-success" onclick="showAddComputer()"><i class="bi bi-plus-circle"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (pcs.length === 0) {
            html += emptyState('bi-pc-display', 'Компьютеров нет');
        } else {
            pcs.forEach(function(p) {
                html += renderComputer(p);
            });
        }
        html += '</div></div>';

        // Принтеры
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-printer"></i> Принтеры <span class="badge bg-secondary">' + printers.length + '</span></h6>';
        if (isAdmin()) {
            html += '<button class="btn btn-sm btn-success" onclick="showAddPrinter()"><i class="bi bi-plus-circle"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (printers.length === 0) {
            html += emptyState('bi-printer', 'Принтеров нет');
        } else {
            printers.forEach(function(p) {
                html += renderPrinter(p, pcs);
            });
        }
        html += '</div></div>';

        html += '</div>'; // eq-grid

        $('#otherPagesBlock').html(html);
    }

    // ============================================================
    // ХЕЛПЕРЫ РЕНДЕРА
    // ============================================================
    function infoBlock(label, value) {
        return '<div><div class="eq-label">' + utils.escapeHtml(label) + '</div>' +
               '<div class="eq-value">' + utils.escapeHtml(value) + '</div></div>';
    }

    function kpiCard(label, value, icon, color) {
        return '<div class="col-6 col-md-3">' +
            '<div class="cart-kpi bg-grad-' + color + '">' +
            '<i class="bi ' + icon + ' kpi-icon"></i>' +
            '<div class="kpi-value">' + value + '</div>' +
            '<div class="kpi-label">' + utils.escapeHtml(label) + '</div>' +
            '</div></div>';
    }

    function emptyState(icon, text) {
        return '<div class="eq-empty"><i class="bi ' + icon + '"></i>' + utils.escapeHtml(text) + '</div>';
    }

    function renderNetworkDevice(d) {
        var adminBtns = '';
        if (isAdmin()) {
            adminBtns =
                '<button class="btn btn-outline-success" onclick="editNetwork(' + d.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" onclick="deleteNetwork(' + d.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }

        var ipHtml = d.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'net\', ' + d.id + ', \'' + utils.escapeHtml(d.ip_address) + '\')">' + utils.escapeHtml(d.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'net\', ' + d.id + ', \'\')">— не задан —</span>';

        return '<div class="eq-device">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name"><i class="bi bi-hdd-network"></i> ' +
            utils.escapeHtml(d.device_type) + ': ' + utils.escapeHtml(d.model) + '</div>' +
            '<div class="eq-actions">' + adminBtns + '</div>' +
            '</div>' +
            (d.inventory_number ? '<div class="eq-meta"><i class="bi bi-upc"></i> <span class="eq-inv">' + utils.escapeHtml(d.inventory_number) + '</span></div>' : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' + ipHtml + '</div>' +
            (d.notes ? '<div class="eq-meta"><i class="bi bi-chat-left-text"></i> ' + utils.escapeHtml(d.notes) + '</div>' : '') +
            '</div>';
    }

    function renderComputer(p) {
        var statusCls = p.status === 'online' ? 'online' : 'offline';
        var statusText = p.status === 'online' ? 'Онлайн' : 'Офлайн';
        var statusIcon = p.status === 'online' ? 'bi-circle-fill' : 'bi-circle';

        var adminBtns = '';
        if (isAdmin()) {
            adminBtns =
                '<button class="btn btn-outline-success" onclick="editComputer(' + p.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" onclick="deleteComputer(' + p.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }

        var ipHtml = p.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'pc\', ' + p.id + ', \'' + utils.escapeHtml(p.ip_address) + '\')">' + utils.escapeHtml(p.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'pc\', ' + p.id + ', \'\')">— не задан —</span>';

        var ramHtml = '';
        if (p.ram && p.ram.length > 0) {
            ramHtml = '<div class="eq-chips">';
            p.ram.forEach(function(r) {
                ramHtml += '<span class="eq-chip">' + utils.escapeHtml((r.size || '') + ' ' + (r.type || '')) + '</span>';
            });
            ramHtml += '</div>';
        }

        var storageHtml = '';
        if (p.storage && p.storage.length > 0) {
            storageHtml = '<div class="eq-chips">';
            p.storage.forEach(function(s) {
                storageHtml += '<span class="eq-chip">' + utils.escapeHtml((s.capacity || '') + ' ' + (s.type || '')) + '</span>';
            });
            storageHtml += '</div>';
        }

        return '<div class="eq-device">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" onclick="viewComputer(' + p.id + ')">' +
            '<i class="bi bi-pc-display"></i> ' + utils.escapeHtml(p.name || 'Без названия') + '</div>' +
            '<div class="eq-actions">' + adminBtns + '</div>' +
            '</div>' +
            '<div class="eq-meta">' +
            '<span class="eq-status ' + statusCls + '"><i class="bi ' + statusIcon + '"></i> ' + statusText + '</span>' +
            (p.inventory_number ? ' <span class="eq-inv">' + utils.escapeHtml(p.inventory_number) + '</span>' : '') +
            '</div>' +
            (p.motherboard ? '<div class="eq-meta"><i class="bi bi-cpu"></i> ' + utils.escapeHtml(p.motherboard) + '</div>' : '') +
            (p.cpu ? '<div class="eq-meta"><i class="bi bi-cpu-fill"></i> ' + utils.escapeHtml(p.cpu) + '</div>' : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' + ipHtml + '</div>' +
            (ramHtml ? '<div class="eq-meta"><i class="bi bi-memory"></i> ОЗУ: ' + ramHtml + '</div>' : '') +
            (storageHtml ? '<div class="eq-meta"><i class="bi bi-device-hdd"></i> Диски: ' + storageHtml + '</div>' : '') +
            '<div class="eq-meta mt-2">' +
            '<button class="btn btn-sm btn-outline-primary" onclick="togglePcStatus(' + p.id + ')">' +
            '<i class="bi bi-arrow-clockwise"></i> Проверить онлайн</button>' +
            '</div>' +
            '</div>';
    }

    function renderPrinter(pr, pcs) {
        var adminBtns = '';
        if (isAdmin()) {
            adminBtns =
                '<button class="btn btn-outline-success" onclick="editPrinter(' + pr.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" onclick="deletePrinter(' + pr.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }

        var ipHtml = pr.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'pr\', ' + pr.id + ', \'' + utils.escapeHtml(pr.ip_address) + '\')">' + utils.escapeHtml(pr.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'pr\', ' + pr.id + ', \'\')">— не задан —</span>';

        var connectHtml = '';
        if (isAdmin()) {
            connectHtml = '<div class="eq-meta mt-2">🔗 Подключен к: ' +
                '<select class="eq-connect-select" onchange="connectPrinter(' + pr.id + ', this.value)">' +
                '<option value="">— не подключен —</option>';
            pcs.forEach(function(pc) {
                var sel = (pr.connected_to_pc_id === pc.id) ? ' selected' : '';
                connectHtml += '<option value="' + pc.id + '"' + sel + '>' + utils.escapeHtml(pc.name || 'ПК #' + pc.id) + '</option>';
            });
            connectHtml += '</select></div>';
        } else {
            var connected = pcs.find(function(pc) { return pc.id === pr.connected_to_pc_id; });
            if (connected) {
                connectHtml = '<div class="eq-meta mt-2"><i class="bi bi-link-45deg"></i> Подключен к: <strong>' +
                    utils.escapeHtml(connected.name || 'ПК #' + connected.id) + '</strong></div>';
            }
        }

        return '<div class="eq-device">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" onclick="viewPrinter(' + pr.id + ')">' +
            '<i class="bi bi-printer"></i> ' + utils.escapeHtml(pr.model || 'Принтер') + '</div>' +
            '<div class="eq-actions">' + adminBtns + '</div>' +
            '</div>' +
            (pr.inventory_number ? '<div class="eq-meta"><span class="eq-inv">' + utils.escapeHtml(pr.inventory_number) + '</span></div>' : '') +
            (pr.cartridge ? '<div class="eq-meta"><i class="bi bi-droplet"></i> Картридж: ' + utils.escapeHtml(pr.cartridge) + '</div>' : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' + ipHtml + '</div>' +
            connectHtml +
            '</div>';
    }

    // ============================================================
    // ДЕЙСТВИЯ: IP
    // ============================================================
    function editIp(type, id, currentIp) {
        if (!isAdmin()) {
            utils.showErrorMessage('Только администратор может изменять IP-адреса');
            return;
        }

        Swal.fire({
            title: 'Изменить IP-адрес',
            input: 'text',
            inputValue: currentIp || '',
            inputPlaceholder: '192.168.1.100',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            inputValidator: function(value) {
                if (value === null) return null;
                if (value && !/^[0-9.]*$/.test(value)) {
                    return 'IP может содержать только цифры и точки';
                }
                return null;
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var newIp = (result.value || '').trim();
            var url, body;

            if (type === 'net') {
                var d = currentData.network_devices.find(function(x) { return x.id === id; });
                if (!d) return;
                url = '/api/network/' + id;
                body = { ip_address: newIp };
            } else if (type === 'pc') {
                var p = currentData.computers.find(function(x) { return x.id === id; });
                if (!p) return;
                url = '/api/computers/' + id;
                body = { ip_address: newIp };
            } else if (type === 'pr') {
                var pr = currentData.printers.find(function(x) { return x.id === id; });
                if (!pr) return;
                url = '/api/printers/' + id;
                body = { ip_address: newIp };
            } else {
                return;
            }

            fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('IP сохранён');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // ПРОВЕРКА СТАТУСА ПК
    // ============================================================
    function togglePcStatus(pcId) {
        fetch('/api/computers/' + pcId + '/toggle-status', { method: 'POST' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    loadData();
                } else {
                    utils.showErrorMessage(data.error);
                }
            });
    }

    // ============================================================
    // ПРИВЯЗКА ПРИНТЕРА
    // ============================================================
    function connectPrinter(printerId, pcId) {
        fetch('/api/printers/' + printerId + '/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pc_id: pcId || null })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    utils.showSuccessMessage('Привязка обновлена');
                } else {
                    utils.showErrorMessage(data.error);
                }
            });
    }

    // ============================================================
    // МОДАЛКА: ПРОСМОТР ПК
    // ============================================================
    function viewComputer(pcId) {
        var p = currentData.computers.find(function(x) { return x.id === pcId; });
        if (!p) return;

        var ramList = (p.ram || []).map(function(r) {
            return '<li>' + utils.escapeHtml((r.size || '') + ' ' + (r.type || '')) + '</li>';
        }).join('') || '<li class="text-muted">не указано</li>';

        var storageList = (p.storage || []).map(function(s) {
            return '<li>' + utils.escapeHtml((s.capacity || '') + ' ' + (s.type || '')) + '</li>';
        }).join('') || '<li class="text-muted">не указано</li>';

        var statusBadge = p.status === 'online'
            ? '<span class="eq-status online">Онлайн</span>'
            : '<span class="eq-status offline">Офлайн</span>';

        Swal.fire({
            title: '<i class="bi bi-pc-display"></i> ' + utils.escapeHtml(p.name || 'ПК'),
            html:
                '<div class="text-start">' +
                '<p><strong>Инв. номер:</strong> ' + utils.escapeHtml(p.inventory_number || '—') + '</p>' +
                '<p><strong>Статус:</strong> ' + statusBadge + '</p>' +
                '<p><strong>Материнская плата:</strong> ' + utils.escapeHtml(p.motherboard || '—') + '</p>' +
                '<p><strong>Процессор:</strong> ' + utils.escapeHtml(p.cpu || '—') + '</p>' +
                '<p><strong>IP-адрес:</strong> ' + utils.escapeHtml(p.ip_address || '—') + '</p>' +
                '<p><strong>ОЗУ:</strong></p><ul>' + ramList + '</ul>' +
                '<p><strong>Диски:</strong></p><ul>' + storageList + '</ul>' +
                (p.notes ? '<p><strong>Примечание:</strong> ' + utils.escapeHtml(p.notes) + '</p>' : '') +
                '</div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: isAdmin(),
            cancelButtonText: '<i class="bi bi-pencil"></i> Редактировать',
            cancelButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' }
        }).then(function(r) {
            if (r.dismiss === Swal.DismissReason.cancel && isAdmin()) {
                editComputer(pcId);
            }
        });
    }

    function viewPrinter(prId) {
        var pr = currentData.printers.find(function(x) { return x.id === prId; });
        if (!pr) return;

        var connectedPc = currentData.computers.find(function(pc) { return pc.id === pr.connected_to_pc_id; });

        Swal.fire({
            title: '<i class="bi bi-printer"></i> ' + utils.escapeHtml(pr.model || 'Принтер'),
            html:
                '<div class="text-start">' +
                '<p><strong>Инв. номер:</strong> ' + utils.escapeHtml(pr.inventory_number || '—') + '</p>' +
                '<p><strong>Картридж:</strong> ' + utils.escapeHtml(pr.cartridge || '—') + '</p>' +
                '<p><strong>IP-адрес:</strong> ' + utils.escapeHtml(pr.ip_address || '—') + '</p>' +
                '<p><strong>Подключен к:</strong> ' + (connectedPc ? utils.escapeHtml(connectedPc.name) : '— не подключен —') + '</p>' +
                (pr.notes ? '<p><strong>Примечание:</strong> ' + utils.escapeHtml(pr.notes) + '</p>' : '') +
                '</div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: isAdmin(),
            cancelButtonText: '<i class="bi bi-pencil"></i> Редактировать',
            cancelButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' }
        }).then(function(r) {
            if (r.dismiss === Swal.DismissReason.cancel && isAdmin()) {
                editPrinter(prId);
            }
        });
    }

    // ============================================================
    // МОДАЛКА: ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ СЕТИ
    // ============================================================
    function showAddNetwork() { editNetwork(null); }

    function editNetwork(deviceId) {
        var d = deviceId ? currentData.network_devices.find(function(x) { return x.id === deviceId; }) : {};
        d = d || {};

        Swal.fire({
            title: deviceId ? 'Редактировать устройство' : 'Добавить сетевое устройство',
            html:
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Тип *</label>' +
                '<select id="eq-net-type" class="form-select">' +
                ['Свитч','Маршрутизатор','Коммутатор','Точка доступа','Модем','Прочее'].map(function(t) {
                    return '<option value="' + t + '"' + (t === d.device_type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') +
                '</select></div>' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-net-model" class="form-control" value="' + utils.escapeHtml(d.model || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-net-inv" class="form-control" value="' + utils.escapeHtml(d.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-net-ip" class="form-control" value="' + utils.escapeHtml(d.ip_address || '') + '" placeholder="192.168.1.1"></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-net-notes" class="form-control" rows="2">' + utils.escapeHtml(d.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() {
                var model = document.getElementById('eq-net-model').value.trim();
                if (!model) { Swal.showValidationMessage('Введите модель'); return false; }
                return {
                    device_type: document.getElementById('eq-net-type').value,
                    model: model,
                    inventory_number: document.getElementById('eq-net-inv').value.trim(),
                    ip_address: document.getElementById('eq-net-ip').value.trim(),
                    notes: document.getElementById('eq-net-notes').value.trim()
                };
            }
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = deviceId ? '/api/network/' + deviceId : '/api/cabinets/' + currentCabinetId + '/network';
            var method = deviceId ? 'PUT' : 'POST';
            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Сохранено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    function deleteNetwork(id) {
        Swal.fire({
            title: 'Удалить устройство?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/network/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Удалено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // МОДАЛКА: ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ ПК
    // ============================================================
    function showAddComputer() { editComputer(null); }

    function editComputer(pcId) {
        var p = pcId ? currentData.computers.find(function(x) { return x.id === pcId; }) : {};
        p = p || {};
        var ram = p.ram || [{ size: '', type: 'DDR4' }];
        var storage = p.storage || [{ capacity: '', type: 'SSD' }];

        function ramRows() {
            return ram.map(function(r, i) {
                return '<div class="eq-ram-row">' +
                    '<input class="form-control form-control-sm eq-ram-size" value="' + utils.escapeHtml(r.size || '') + '" placeholder="8GB">' +
                    '<select class="form-select form-select-sm eq-ram-type">' +
                    ['DDR3','DDR4','DDR5','LPDDR4','LPDDR5'].map(function(t) {
                        return '<option value="' + t + '"' + (t === r.type ? ' selected' : '') + '>' + t + '</option>';
                    }).join('') +
                    '</select>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>' +
                    '</div>';
            }).join('');
        }

        function storageRows() {
            return storage.map(function(s) {
                return '<div class="eq-storage-row">' +
                    '<input class="form-control form-control-sm eq-storage-cap" value="' + utils.escapeHtml(s.capacity || '') + '" placeholder="512GB">' +
                    '<select class="form-select form-select-sm eq-storage-type">' +
                    ['SSD','HDD','NVMe','SSD M.2','eMMC'].map(function(t) {
                        return '<option value="' + t + '"' + (t === s.type ? ' selected' : '') + '>' + t + '</option>';
                    }).join('') +
                    '</select>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>' +
                    '</div>';
            }).join('');
        }

        Swal.fire({
            title: pcId ? 'Редактировать ПК' : 'Добавить компьютер',
            html:
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Название *</label>' +
                '<input id="eq-pc-name" class="form-control" value="' + utils.escapeHtml(p.name || '') + '" placeholder="Dell OptiPlex 7090"></div>' +
                '<div class="mb-2"><label class="form-label">Материнская плата</label>' +
                '<input id="eq-pc-mb" class="form-control" value="' + utils.escapeHtml(p.motherboard || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Процессор</label>' +
                '<input id="eq-pc-cpu" class="form-control" value="' + utils.escapeHtml(p.cpu || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pc-inv" class="form-control" value="' + utils.escapeHtml(p.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-pc-ip" class="form-control" value="' + utils.escapeHtml(p.ip_address || '') + '" placeholder="192.168.1.100"></div>' +
                '<div class="mb-2"><label class="form-label">ОЗУ</label>' +
                '<div id="eq-ram-container">' + ramRows() + '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-1" onclick="addRamRow()"><i class="bi bi-plus"></i> Добавить планку</button>' +
                '</div>' +
                '<div class="mb-2"><label class="form-label">Диски</label>' +
                '<div id="eq-storage-container">' + storageRows() + '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-1" onclick="addStorageRow()"><i class="bi bi-plus"></i> Добавить диск</button>' +
                '</div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-pc-notes" class="form-control" rows="2">' + utils.escapeHtml(p.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                window.addRamRow = function() {
                    var c = document.getElementById('eq-ram-container');
                    var div = document.createElement('div');
                    div.className = 'eq-ram-row';
                    div.innerHTML =
                        '<input class="form-control form-control-sm eq-ram-size" placeholder="8GB">' +
                        '<select class="form-select form-select-sm eq-ram-type">' +
                        '<option>DDR3</option><option selected>DDR4</option><option>DDR5</option>' +
                        '</select>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };
                window.addStorageRow = function() {
                    var c = document.getElementById('eq-storage-container');
                    var div = document.createElement('div');
                    div.className = 'eq-storage-row';
                    div.innerHTML =
                        '<input class="form-control form-control-sm eq-storage-cap" placeholder="512GB">' +
                        '<select class="form-select form-select-sm eq-storage-type">' +
                        '<option selected>SSD</option><option>HDD</option><option>NVMe</option>' +
                        '</select>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };
            },
            preConfirm: function() {
                var name = document.getElementById('eq-pc-name').value.trim();
                if (!name) { Swal.showValidationMessage('Введите название ПК'); return false; }

                var ramArr = [];
                document.querySelectorAll('#eq-ram-container .eq-ram-row').forEach(function(row) {
                    var size = row.querySelector('.eq-ram-size').value.trim();
                    var type = row.querySelector('.eq-ram-type').value;
                    if (size) ramArr.push({ size: size, type: type });
                });

                var storageArr = [];
                document.querySelectorAll('#eq-storage-container .eq-storage-row').forEach(function(row) {
                    var cap = row.querySelector('.eq-storage-cap').value.trim();
                    var type = row.querySelector('.eq-storage-type').value;
                    if (cap) storageArr.push({ capacity: cap, type: type });
                });

                return {
                    name: name,
                    motherboard: document.getElementById('eq-pc-mb').value.trim(),
                    cpu: document.getElementById('eq-pc-cpu').value.trim(),
                    inventory_number: document.getElementById('eq-pc-inv').value.trim(),
                    ip_address: document.getElementById('eq-pc-ip').value.trim(),
                    ram: ramArr,
                    storage: storageArr,
                    notes: document.getElementById('eq-pc-notes').value.trim()
                };
            }
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = pcId ? '/api/computers/' + pcId : '/api/cabinets/' + currentCabinetId + '/computers';
            var method = pcId ? 'PUT' : 'POST';
            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Сохранено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    function deleteComputer(id) {
        Swal.fire({
            title: 'Удалить ПК?',
            text: 'Привязанные принтеры будут отключены',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/computers/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Удалено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // МОДАЛКА: ДОБАВЛЕНИЕ / РЕДАКТИРОВАНИЕ ПРИНТЕРА
    // ============================================================
    function showAddPrinter() { editPrinter(null); }

    function editPrinter(printerId) {
        var pr = printerId ? currentData.printers.find(function(x) { return x.id === printerId; }) : {};
        pr = pr || {};

        var pcOptions = currentData.computers.map(function(pc) {
            var sel = (pr.connected_to_pc_id === pc.id) ? ' selected' : '';
            return '<option value="' + pc.id + '"' + sel + '>' + utils.escapeHtml(pc.name || 'ПК #' + pc.id) + '</option>';
        }).join('');

        Swal.fire({
            title: printerId ? 'Редактировать принтер' : 'Добавить принтер',
            html:
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-pr-model" class="form-control" value="' + utils.escapeHtml(pr.model || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Картридж</label>' +
                '<input id="eq-pr-cart" class="form-control" value="' + utils.escapeHtml(pr.cartridge || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pr-inv" class="form-control" value="' + utils.escapeHtml(pr.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-pr-ip" class="form-control" value="' + utils.escapeHtml(pr.ip_address || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Подключен к ПК</label>' +
                '<select id="eq-pr-pc" class="form-select">' +
                '<option value="">— не подключен —</option>' + pcOptions +
                '</select></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-pr-notes" class="form-control" rows="2">' + utils.escapeHtml(pr.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() {
                var model = document.getElementById('eq-pr-model').value.trim();
                if (!model) { Swal.showValidationMessage('Введите модель'); return false; }
                return {
                    model: model,
                    cartridge: document.getElementById('eq-pr-cart').value.trim(),
                    inventory_number: document.getElementById('eq-pr-inv').value.trim(),
                    ip_address: document.getElementById('eq-pr-ip').value.trim(),
                    connected_to_pc_id: document.getElementById('eq-pr-pc').value || null,
                    notes: document.getElementById('eq-pr-notes').value.trim()
                };
            }
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = printerId ? '/api/printers/' + printerId : '/api/cabinets/' + currentCabinetId + '/printers';
            var method = printerId ? 'PUT' : 'POST';
            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(r.value)
            })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Сохранено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    function deletePrinter(id) {
        Swal.fire({
            title: 'Удалить принтер?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/printers/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) {
                        utils.showSuccessMessage('Удалено');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.open = open;
    api.reload = loadData;

    window.openCabinetDetails = open;
    window.showAddNetwork = showAddNetwork;
    window.editNetwork = editNetwork;
    window.deleteNetwork = deleteNetwork;
    window.showAddComputer = showAddComputer;
    window.editComputer = editComputer;
    window.deleteComputer = deleteComputer;
    window.viewComputer = viewComputer;
    window.togglePcStatus = togglePcStatus;
    window.showAddPrinter = showAddPrinter;
    window.editPrinter = editPrinter;
    window.deletePrinter = deletePrinter;
    window.viewPrinter = viewPrinter;
    window.connectPrinter = connectPrinter;
    window.editIp = editIp;

    console.log('[cabinet_details] Загружено');
})();