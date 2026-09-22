// static/js/cabinet_devices.js
// Рендер секций оборудования кабинета: сеть, ПК, принтеры.
// CRUD-модалки — в cabinet_device_modals.js
// Действия (удаление, ping, QR, connect) — в cabinet_device_actions.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_devices] App не инициализирован');
        return;
    }

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
    // ЭКСПОРТ
    // ============================================================
    var mod = window.App.register('CabinetDevicesAPI');
    mod.renderNetworkSection = Devices.renderNetworkSection;
    mod.renderComputersSection = Devices.renderComputersSection;
    mod.renderPrintersSection = Devices.renderPrintersSection;

    console.log('[cabinet_devices] Загружено');
})();