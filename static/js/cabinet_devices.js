// static/js/cabinet_devices.js
// Устройства кабинета: сетевое оборудование, ПК, принтеры.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_devices] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    var Devices = window.App.CabinetDevices = window.App.CabinetDevices || {};

    function Cabinet() { return window.App.Cabinet; }

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    function dragHandle() {
        return Cabinet().canEdit()
            ? '<i class="bi bi-grip-vertical eq-drag-handle" ' +
              'title="Перетащить"></i>'
            : '';
    }

    function emptyState(icon, text) {
        return '<div class="eq-empty"><i class="bi ' + icon + '"></i>' +
               utils.escapeHtml(text) + '</div>';
    }

    // ============================================================
    // СЕКЦИЯ: СЕТЕВОЕ ОБОРУДОВАНИЕ
    // ============================================================
    Devices.renderNetworkSection = function(net) {
        var html = '<div class="eq-section" data-eq-section="network">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title">' +
                '<i class="bi bi-hdd-network"></i> Сетевое оборудование ' +
                '<span class="badge bg-secondary">' + net.length + '</span></h6>';
        if (Cabinet().canEdit()) {
            html += '<button class="btn btn-sm btn-success" ' +
                    'onclick="showAddNetwork()">' +
                    '<i class="bi bi-plus-circle"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body eq-sortable" data-entity="network">';
        if (net.length === 0) {
            html += emptyState('bi-hdd-network', 'Оборудование не добавлено');
        } else {
            net.forEach(function(d) {
                html += renderNetworkDevice(d);
            });
        }
        html += '</div></div>';
        return html;
    };

    function renderNetworkDevice(d) {
        var btns = '';
        if (Cabinet().canEdit()) {
            btns =
                '<button class="btn btn-outline-success" ' +
                'onclick="editNetwork(' + d.id + ')" title="Редактировать">' +
                '<i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" ' +
                'onclick="deleteNetwork(' + d.id + ')" title="Удалить">' +
                '<i class="bi bi-trash"></i></button>';
        }
        var ipHtml = d.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'net\', ' + d.id + ', \'' +
              utils.escapeHtml(d.ip_address) + '\')">' +
              utils.escapeHtml(d.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'net\', ' + d.id +
              ', \'\')">— не задан —</span>';

        return '<div class="eq-device" data-entity-id="' + d.id + '">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name">' + dragHandle() +
            '<i class="bi bi-hdd-network"></i> ' +
            utils.escapeHtml(d.device_type) + ': ' +
            utils.escapeHtml(d.model) + '</div>' +
            '<div class="eq-actions">' + btns + '</div>' +
            '</div>' +
            (d.inventory_number
                ? '<div class="eq-meta"><i class="bi bi-upc"></i> ' +
                  '<span class="eq-inv">' +
                  utils.escapeHtml(d.inventory_number) + '</span></div>'
                : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' +
            ipHtml + '</div>' +
            (d.notes
                ? '<div class="eq-meta"><i class="bi bi-chat-left-text"></i> ' +
                  utils.escapeHtml(d.notes) + '</div>'
                : '') +
            '</div>';
    }

    // ============================================================
    // СЕКЦИЯ: КОМПЬЮТЕРЫ
    // ============================================================
    Devices.renderComputersSection = function(pcs) {
        var html = '<div class="eq-section" data-eq-section="computers">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title">' +
                '<i class="bi bi-pc-display"></i> Компьютеры ' +
                '<span class="badge bg-secondary">' + pcs.length + '</span></h6>';
        if (Cabinet().canEdit()) {
            html += '<div class="d-flex gap-1">';
            html += '<button class="btn btn-sm btn-outline-primary" ' +
                    'onclick="pingAllInCabinet()" title="Проверить все ПК">' +
                    '<i class="bi bi-wifi"></i> Проверить все</button>';
            html += '<button class="btn btn-sm btn-success" ' +
                    'onclick="showAddComputer()">' +
                    '<i class="bi bi-plus-circle"></i> Добавить</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<div class="eq-section-body eq-sortable" data-entity="computers">';
        if (pcs.length === 0) {
            html += emptyState('bi-pc-display', 'Компьютеров нет');
        } else {
            pcs.forEach(function(p) {
                html += renderComputer(p);
            });
        }
        html += '</div></div>';
        return html;
    };

    function renderComputer(p) {
        var statusCls = p.status === 'online' ? 'online' : 'offline';
        var statusText = p.status === 'online' ? 'Онлайн' : 'Офлайн';
        var statusIcon = p.status === 'online' ? 'bi-circle-fill' : 'bi-circle';

        var btns = '';
        if (Cabinet().canEdit()) {
            btns =
                '<button class="btn btn-outline-dark" ' +
                'onclick="showComputerQR(' + p.id + ')" title="QR-код">' +
                '<i class="bi bi-qr-code"></i></button>' +
                '<button class="btn btn-outline-success" ' +
                'onclick="editComputer(' + p.id + ')" title="Редактировать">' +
                '<i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" ' +
                'onclick="deleteComputer(' + p.id + ')" title="Удалить">' +
                '<i class="bi bi-trash"></i></button>';
        }

        var ipHtml = p.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'pc\', ' + p.id + ', \'' +
              utils.escapeHtml(p.ip_address) + '\')">' +
              utils.escapeHtml(p.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'pc\', ' + p.id +
              ', \'\')">— не задан —</span>';

        var ramHtml = '';
        if (p.ram && p.ram.length > 0) {
            ramHtml = '<div class="eq-chips">';
            p.ram.forEach(function(r) {
                ramHtml += '<span class="eq-chip">' +
                    utils.escapeHtml((r.size || '') + ' ' + (r.type || '')) +
                    '</span>';
            });
            ramHtml += '</div>';
        }

        var storageHtml = '';
        if (p.storage && p.storage.length > 0) {
            storageHtml = '<div class="eq-chips">';
            p.storage.forEach(function(s) {
                storageHtml += '<span class="eq-chip">' +
                    utils.escapeHtml((s.capacity || '') + ' ' + (s.type || '')) +
                    '</span>';
            });
            storageHtml += '</div>';
        }

        var softwareHtml = '';
        if (p.software && p.software.length > 0) {
            softwareHtml = '<div class="eq-meta">' +
                '<i class="bi bi-window-stack"></i> ПО: ' +
                p.software.length + ' наим.</div>';
        }

        var pingCount = p.ping_count || 0;
        var pingSuccess = p.ping_success_count || 0;
        var pingFail = pingCount - pingSuccess;
        var lastPingAt = p.last_ping_at
            ? utils.formatDate(p.last_ping_at)
            : '—';

        var statsHtml;
        if (pingCount > 0) {
            statsHtml = '<div class="eq-ping-stats">' +
                '<i class="bi bi-activity"></i> ' +
                '<span title="Всего проверок">' + pingCount + '</span>' +
                ' · <span class="ping-ok" title="Успешных">✓ ' + pingSuccess + '</span>' +
                ' · <span class="ping-fail" title="Неудачных">✗ ' + pingFail + '</span>' +
                '<small class="d-block text-muted">Последняя: ' +
                lastPingAt + '</small></div>';
        } else {
            statsHtml = '<div class="eq-ping-stats">' +
                '<i class="bi bi-activity"></i> Проверок ещё не было</div>';
        }

        return '<div class="eq-device" data-pc-id="' + p.id + '" ' +
                'data-entity-id="' + p.id + '">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" ' +
            'onclick="viewComputer(' + p.id + ')">' + dragHandle() +
            '<i class="bi bi-pc-display"></i> ' +
            utils.escapeHtml(p.name || 'Без названия') + '</div>' +
            '<div class="eq-actions">' + btns + '</div></div>' +
            '<div class="eq-meta">' +
            '<span class="eq-status ' + statusCls + '" data-pc-status>' +
            '<i class="bi ' + statusIcon + '"></i> ' + statusText + '</span>' +
            (p.inventory_number
                ? ' <span class="eq-inv">' +
                  utils.escapeHtml(p.inventory_number) + '</span>'
                : '') +
            '</div>' +
            (p.motherboard
                ? '<div class="eq-meta"><i class="bi bi-cpu"></i> ' +
                  utils.escapeHtml(p.motherboard) +
                  (p.motherboard_socket
                      ? ' (' + utils.escapeHtml(p.motherboard_socket) + ')'
                      : '') + '</div>'
                : '') +
            (p.cpu
                ? '<div class="eq-meta"><i class="bi bi-cpu-fill"></i> ' +
                  utils.escapeHtml(p.cpu) + '</div>'
                : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' +
            ipHtml + '</div>' +
            (ramHtml
                ? '<div class="eq-meta"><i class="bi bi-memory"></i> ОЗУ: ' +
                  ramHtml + '</div>'
                : '') +
            (storageHtml
                ? '<div class="eq-meta"><i class="bi bi-device-hdd"></i> Диски: ' +
                  storageHtml + '</div>'
                : '') +
            softwareHtml + statsHtml +
            '<div class="eq-meta mt-2">' +
            '<button class="btn btn-sm btn-outline-primary" ' +
            'onclick="pingPc(' + p.id + ', this)" data-ping-btn>' +
            '<i class="bi bi-wifi"></i> Проверить сейчас</button>' +
            '</div></div>';
    }

    // ============================================================
    // СЕКЦИЯ: ПРИНТЕРЫ
    // ============================================================
    Devices.renderPrintersSection = function(printers, pcs) {
        var html = '<div class="eq-section" data-eq-section="printers">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title">' +
                '<i class="bi bi-printer"></i> Принтеры ' +
                '<span class="badge bg-secondary">' + printers.length + '</span></h6>';
        if (Cabinet().canEdit()) {
            html += '<div class="d-flex gap-1">';
            html += '<button class="btn btn-sm btn-outline-primary" ' +
                    'onclick="importPrintersFromCartridges()" ' +
                    'title="Импорт из Картриджей">' +
                    '<i class="bi bi-download"></i> Импорт</button>';
            html += '<button class="btn btn-sm btn-success" ' +
                    'onclick="showAddPrinter()">' +
                    '<i class="bi bi-plus-circle"></i> Добавить</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<div class="eq-section-body eq-sortable" data-entity="printers">';
        if (printers.length === 0) {
            html += emptyState('bi-printer', 'Принтеров нет');
        } else {
            printers.forEach(function(p) {
                html += renderPrinter(p, pcs);
            });
        }
        html += '</div></div>';
        return html;
    };

    function renderPrinter(pr, pcs) {
        var btns = '';
        if (Cabinet().canEdit()) {
            btns =
                '<button class="btn btn-outline-dark" ' +
                'onclick="showPrinterQR(' + pr.id + ')" title="QR-код">' +
                '<i class="bi bi-qr-code"></i></button>' +
                '<button class="btn btn-outline-success" ' +
                'onclick="editPrinter(' + pr.id + ')" title="Редактировать">' +
                '<i class="bi bi-pencil"></i></button>' +
                '<button class="btn btn-outline-danger" ' +
                'onclick="deletePrinter(' + pr.id + ')" title="Удалить">' +
                '<i class="bi bi-trash"></i></button>';
        }

        var connType = pr.connection_type || 'network';
        var isNetwork = (connType === 'network');

        var connBadge = isNetwork
            ? '<span class="eq-conn-badge eq-conn-network">' +
              '<i class="bi bi-globe"></i> Сетевой</span>'
            : '<span class="eq-conn-badge eq-conn-usb">' +
              '<i class="bi bi-usb-symbol"></i> USB</span>';

        var ipHtml = '';
        if (isNetwork) {
            ipHtml = pr.ip_address
                ? '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' +
                  '<span class="eq-ip" onclick="editIp(\'pr\', ' + pr.id +
                  ', \'' + utils.escapeHtml(pr.ip_address) + '\')">' +
                  utils.escapeHtml(pr.ip_address) + '</span></div>'
                : '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' +
                  '<span class="eq-ip empty" onclick="editIp(\'pr\', ' +
                  pr.id + ', \'\')">— не задан —</span></div>';
        }

        var connectHtml = '';
        if (!isNetwork) {
            if (Cabinet().canEdit()) {
                connectHtml = '<div class="eq-meta mt-2">🔗 Подключен к: ' +
                    '<select class="eq-connect-select" ' +
                    'onchange="connectPrinter(' + pr.id + ', this.value)">' +
                    '<option value="">— не подключен —</option>';
                pcs.forEach(function(pc) {
                    var sel = (pr.connected_to_pc_id === pc.id) ? ' selected' : '';
                    connectHtml += '<option value="' + pc.id + '"' + sel + '>' +
                        utils.escapeHtml(pc.name || 'ПК #' + pc.id) +
                        '</option>';
                });
                connectHtml += '</select></div>';
            } else {
                var connected = pcs.find(function(pc) {
                    return pc.id === pr.connected_to_pc_id;
                });
                if (connected) {
                    connectHtml = '<div class="eq-meta mt-2">' +
                        '<i class="bi bi-link-45deg"></i> Подключен к: ' +
                        '<strong>' +
                        utils.escapeHtml(connected.name || 'ПК #' + connected.id) +
                        '</strong></div>';
                }
            }
        }

        return '<div class="eq-device" data-entity-id="' + pr.id + '">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" ' +
            'onclick="viewPrinter(' + pr.id + ')">' + dragHandle() +
            '<i class="bi bi-printer"></i> ' +
            utils.escapeHtml(pr.model || 'Принтер') +
            ' ' + connBadge + '</div>' +
            '<div class="eq-actions">' + btns + '</div></div>' +
            (pr.inventory_number
                ? '<div class="eq-meta"><span class="eq-inv">' +
                  utils.escapeHtml(pr.inventory_number) + '</span></div>'
                : '') +
            (pr.cartridge
                ? '<div class="eq-meta"><i class="bi bi-droplet"></i> ' +
                  'Картридж: ' + utils.escapeHtml(pr.cartridge) + '</div>'
                : '') +
            ipHtml + connectHtml +
            (pr.notes
                ? '<div class="eq-meta"><i class="bi bi-chat-left-text"></i> ' +
                  utils.escapeHtml(pr.notes) + '</div>'
                : '') +
            '</div>';
    }

    // ============================================================
    // ПРОСМОТР ПК
    // ============================================================
    function viewComputer(pcId) {
        var p = Cabinet().data.computers.find(function(x) { return x.id === pcId; });
        if (!p) {
            utils.showErrorMessage('ПК не найден');
            return;
        }

        // Используем новый модуль карточки ПК
        if (window.App.ComputerCard &&
            typeof window.App.ComputerCard.show === 'function') {
            window.App.ComputerCard.show(p, Cabinet().data.cabinet);
        } else {
            // Fallback — старая модалка (упрощённая)
            utils.showErrorMessage(
                'Модуль карточки ПК не загружен'
            );
        }
    }

    // ============================================================
    // ПРОСМОТР ПРИНТЕРА
    // ============================================================
    function viewPrinter(prId) {
        var pr = Cabinet().data.printers.find(function(x) {
            return x.id === prId;
        });
        if (!pr) return;

        // Используем модуль карточки принтера
        if (window.App.PrinterCard &&
            typeof window.App.PrinterCard.show === 'function') {
            window.App.PrinterCard.show(pr, Cabinet().data.cabinet);
        } else {
            utils.showErrorMessage(
                'Модуль карточки принтера не загружен'
            );
        }
    }

    // ============================================================
    // QR
    // ============================================================
    function showComputerQR(pcId) {
        var p = Cabinet().data.computers.find(function(x) { return x.id === pcId; });
        var name = p ? (p.name || 'ПК #' + pcId) : 'ПК';

        Swal.fire({
            title: '<i class="bi bi-qr-code"></i> QR-код',
            html: '<div class="text-center">' +
                '<p class="text-muted">' + utils.escapeHtml(name) + '</p>' +
                '<img src="/api/computers/' + pcId + '/qr" ' +
                'style="max-width:280px;border:1px solid #ccc;' +
                'border-radius:8px;padding:8px;background:#fff" alt="QR">' +
                '<p class="text-muted small mt-2">' +
                'Отсканируйте камерой телефона, чтобы открыть карточку устройства' +
                '</p>' +
                '<a class="btn btn-primary" href="/api/computers/' + pcId + '/qr" ' +
                'download="qr_pc_' + pcId + '.png">' +
                '<i class="bi bi-download"></i> Скачать</a>' +
                '</div>',
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
        });
    }

    function showPrinterQR(prId) {
        var pr = Cabinet().data.printers.find(function(x) { return x.id === prId; });
        var name = pr ? (pr.model || 'Принтер #' + prId) : 'Принтер';

        Swal.fire({
            title: '<i class="bi bi-qr-code"></i> QR-код',
            html: '<div class="text-center">' +
                '<p class="text-muted">' + utils.escapeHtml(name) + '</p>' +
                '<img src="/api/printers/' + prId + '/qr" ' +
                'style="max-width:280px;border:1px solid #ccc;' +
                'border-radius:8px;padding:8px;background:#fff" alt="QR">' +
                '<p class="text-muted small mt-2">' +
                'Отсканируйте камерой телефона, чтобы открыть карточку устройства' +
                '</p>' +
                '<a class="btn btn-primary" href="/api/printers/' + prId + '/qr" ' +
                'download="qr_printer_' + prId + '.png">' +
                '<i class="bi bi-download"></i> Скачать</a>' +
                '</div>',
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
        });
    }

    // ============================================================
    // IP / PING / CONNECT
    // ============================================================
    function editIp(type, id, currentIp) {
        if (!Cabinet().canEdit()) {
            utils.showErrorMessage('Недостаточно прав');
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
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var newIp = (result.value || '').trim();

            var url;
            if (type === 'net') url = '/api/network/' + id;
            else if (type === 'pc') url = '/api/computers/' + id;
            else if (type === 'pr') url = '/api/printers/' + id;
            else return;

            api.put(url, { ip_address: newIp })
                .then(function() {
                    utils.showSuccessMessage('IP сохранён');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка сохранения');
                });
        });
    }

    function pingPc(pcId, btn) {
        var $btn = $(btn);
        var oldHtml = $btn.html();
        $btn.prop('disabled', true).html(
            '<span class="spinner-border spinner-border-sm"></span> Проверка...'
        );

        api.post('/api/computers/' + pcId + '/ping', {})
            .then(function(data) {
                $btn.prop('disabled', false).html(oldHtml);

                if (data.success) {
                    utils.showSuccessMessage(data.message || 'Проверено');
                    var $card = $('.eq-device[data-pc-id="' + pcId + '"]');
                    var $status = $card.find('[data-pc-status]');
                    if (data.status === 'online') {
                        $status.removeClass('offline').addClass('online')
                            .html('<i class="bi bi-circle-fill"></i> Онлайн');
                    } else {
                        $status.removeClass('online').addClass('offline')
                            .html('<i class="bi bi-circle"></i> Офлайн');
                    }

                    if (Cabinet().data) {
                        var pc = Cabinet().data.computers.find(function(p) {
                            return p.id === pcId;
                        });
                        if (pc) {
                            pc.status = data.status;
                            pc.ping_count = data.ping_count;
                            pc.ping_success_count = data.ping_success_count;
                            pc.last_ping_at = data.last_ping_at;
                        }
                    }
                } else {
                    utils.showErrorMessage(data.error || 'Ошибка');
                }
            })
            .catch(function() {
                $btn.prop('disabled', false).html(oldHtml);
                utils.showErrorMessage('Ошибка соединения');
            });
    }

    function pingAllInCabinet() {
        Swal.fire({
            title: 'Проверка всех ПК?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-wifi"></i> Проверить',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (!r.isConfirmed) return;

            Swal.fire({
                title: 'Проверка...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.post('/api/cabinets/' + Cabinet().currentId + '/ping-all', {})
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        utils.showSuccessMessage(data.message || 'Проверено');
                        setTimeout(function() { Cabinet().reload(); }, 500);
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function() {
                    Swal.close();
                    utils.showErrorMessage('Ошибка проверки');
                });
        });
    }

    function connectPrinter(printerId, pcId) {
        api.post('/api/printers/' + printerId + '/connect', {
            pc_id: pcId || null,
        })
            .then(function(data) {
                if (data.success) utils.showSuccessMessage('Привязка обновлена');
                else utils.showErrorMessage(data.error);
            })
            .catch(function() {
                utils.showErrorMessage('Ошибка привязки');
            });
    }

    // ============================================================
    // CRUD: СЕТЬ
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

    function deleteNetwork(id) {
        Swal.fire({
            title: 'Удалить устройство?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.delete('/api/network/' + id)
                .then(function() {
                    utils.showSuccessMessage('Удалено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // CRUD: ПК
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

    function deleteComputer(id) {
        Swal.fire({
            title: 'Удалить ПК?',
            text: 'Привязанные принтеры будут отключены',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.delete('/api/computers/' + id)
                .then(function() {
                    utils.showSuccessMessage('Удалено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // CRUD: ПРИНТЕРЫ
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

    function deletePrinter(id) {
        Swal.fire({
            title: 'Удалить принтер?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.delete('/api/printers/' + id)
                .then(function() {
                    utils.showSuccessMessage('Удалено');
                    Cabinet().reload();
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    function importPrintersFromCartridges() {
        Swal.fire({
            title: 'Импорт принтеров',
            html: '<div class="text-start">' +
                '<p>Будут добавлены принтеры из модуля ' +
                '<strong>«Картриджи»</strong>.</p>' +
                '<p class="text-muted small">Дубликаты будут пропущены.</p></div>',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-download"></i> Импортировать',
            cancelButtonText: 'Отмена',
        }).then(function(result) {
            if (!result.isConfirmed) return;

            Swal.fire({
                title: 'Импорт...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.post('/api/cabinets/' + Cabinet().currentId +
                     '/printers/import-from-cartridges', {})
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        Swal.fire({
                            icon: data.imported > 0 ? 'success' : 'info',
                            title: data.imported > 0
                                ? 'Импорт завершён'
                                : 'Нечего импортировать',
                            html: '<div class="text-start">' +
                                '<p><strong>Импортировано:</strong> ' +
                                data.imported + '</p>' +
                                '<p><strong>Пропущено:</strong> ' +
                                data.skipped + '</p></div>',
                            timer: 2500,
                        });
                        if (data.imported > 0) Cabinet().reload();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function() {
                    Swal.close();
                    utils.showErrorMessage('Ошибка импорта');
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    var mod = window.App.register('CabinetDevicesAPI');
    mod.renderNetworkSection = Devices.renderNetworkSection;
    mod.renderComputersSection = Devices.renderComputersSection;
    mod.renderPrintersSection = Devices.renderPrintersSection;

    // Public API для inline onclick
    window.showAddNetwork = showAddNetwork;
    window.editNetwork = editNetwork;
    window.deleteNetwork = deleteNetwork;
    window.showAddComputer = showAddComputer;
    window.editComputer = editComputer;
    window.deleteComputer = deleteComputer;
    window.viewComputer = viewComputer;
    window.viewPrinter = viewPrinter;
    window.pingPc = pingPc;
    window.pingAllInCabinet = pingAllInCabinet;
    window.showAddPrinter = showAddPrinter;
    window.editPrinter = editPrinter;
    window.deletePrinter = deletePrinter;
    window.connectPrinter = connectPrinter;
    window.editIp = editIp;
    window.importPrintersFromCartridges = importPrintersFromCartridges;
    window.showComputerQR = showComputerQR;
    window.showPrinterQR = showPrinterQR;

    console.log('[cabinet_devices] Загружено');
})();