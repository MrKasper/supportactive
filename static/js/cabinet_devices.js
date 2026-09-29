// static/js/cabinet_devices.js
// Устройства кабинета: сетевое оборудование, ПК, принтеры.
//
// ВАЖНО: строки RAM/Storage в форме ПК используют ТОЛЬКО inline-стили
// (без классов .eq-ram-row / .eq-storage-row), чтобы избежать конфликтов
// с любыми CSS-файлами и быть уверенными в grid-раскладке.

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
    // INLINE-СТИЛИ ДЛЯ ФОРМЫ ПК
    // ============================================================
    var STYLE_GRID_2COL =
        'display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;width:100%;';

    var STYLE_RAM_ROW =
        'display:grid;grid-template-columns:90px 46px minmax(0,1fr) 38px;' +
        'gap:8px;align-items:center;width:100%;margin-bottom:8px;';

    var STYLE_RAM_INPUT =
        'width:100%;box-sizing:border-box;height:32px;padding:4px 8px;' +
        'font-size:13px;text-align:center;border:1px solid #e8e8ec;' +
        'border-radius:6px;background:#fff;color:#18181b;';

    var STYLE_RAM_SELECT =
        'width:100%;box-sizing:border-box;height:32px;padding:4px 8px;' +
        'font-size:13px;border:1px solid #e8e8ec;border-radius:6px;' +
        'background:#fff;color:#18181b;';

    var STYLE_UNIT_LABEL =
        'display:inline-flex;align-items:center;justify-content:center;' +
        'height:32px;width:100%;background:#f4f4f5;border:1px solid #e8e8ec;' +
        'border-radius:6px;font-size:11px;font-weight:600;color:#71717a;' +
        'box-sizing:border-box;';

    var STYLE_REMOVE_BTN =
        'width:38px;height:32px;padding:0;display:inline-flex;' +
        'align-items:center;justify-content:center;border-radius:6px;' +
        'border:1px solid #e8e8ec;background:#fff;color:#ef4444;cursor:pointer;' +
        'box-sizing:border-box;';

    var STYLE_STORAGE_ROW =
        'display:grid;grid-template-columns:90px 62px minmax(0,1fr) 38px;' +
        'gap:8px;align-items:center;width:100%;margin-bottom:8px;';

    var STYLE_STORAGE_INPUT =
        'width:100%;box-sizing:border-box;height:32px;padding:4px 8px;' +
        'font-size:13px;text-align:center;border:1px solid #e8e8ec;' +
        'border-radius:6px;background:#fff;color:#18181b;';

    var STYLE_STORAGE_SELECT =
        'width:100%;box-sizing:border-box;height:32px;padding:4px 8px;' +
        'font-size:13px;border:1px solid #e8e8ec;border-radius:6px;' +
        'background:#fff;color:#18181b;';

    var STYLE_IP_ROW =
        'display:grid;grid-template-columns:minmax(0,1fr) 38px;' +
        'gap:6px;align-items:stretch;width:100%;';

    var STYLE_IP_INPUT =
        'width:100%;box-sizing:border-box;height:32px;padding:4px 10px;' +
        'font-size:13px;border:1px solid #e8e8ec;border-radius:8px 0 0 8px;' +
        'background:#fff;color:#18181b;';

    var STYLE_IP_RELOAD =
        'width:38px;height:32px;padding:0;display:inline-flex;' +
        'align-items:center;justify-content:center;border:1px solid #e8e8ec;' +
        'border-radius:0 8px 8px 0;background:#fff;color:#71717a;cursor:pointer;' +
        'box-sizing:border-box;';

    var STYLE_FULL_BTN =
        'display:block;width:100%;margin-top:6px;padding:8px 12px;' +
        'text-align:center;border:1px solid #6366f1;border-radius:8px;' +
        'background:transparent;color:#6366f1;cursor:pointer;font-size:13px;' +
        'font-weight:500;box-sizing:border-box;';

    var STYLE_SELECTED_BOX =
        'border:1px solid #e8e8ec;border-radius:8px;padding:8px;' +
        'background:#f4f4f5;min-height:40px;max-height:140px;' +
        'overflow-y:auto;box-sizing:border-box;';

    var STYLE_TOGGLE_SOFT =
        'display:block;width:100%;margin-top:8px;padding:8px 12px;' +
        'text-align:center;border:1px dashed #d4d4d8;border-radius:8px;' +
        'background:transparent;color:#71717a;cursor:pointer;font-size:13px;' +
        'box-sizing:border-box;';

    var STYLE_AVAILABLE_BOX =
        'border:1px solid #e8e8ec;border-radius:8px;padding:8px;' +
        'background:#fff;max-height:200px;overflow-y:auto;margin-top:8px;' +
        'box-sizing:border-box;';

    var STYLE_FORM_LABEL =
        'display:block;margin-bottom:5px;font-size:11px;font-weight:600;' +
        'text-transform:uppercase;letter-spacing:0.05em;color:#71717a;';

    var STYLE_FORM_BLOCK =
        'display:block;width:100%;margin-top:18px;';

    var STYLE_FORM_CONTROL =
        'width:100%;box-sizing:border-box;height:34px;padding:6px 12px;' +
        'font-size:13px;border:1px solid #e8e8ec;border-radius:8px;' +
        'background:#fff;color:#18181b;font-family:inherit;';

    var STYLE_FORM_TEXTAREA =
        'width:100%;box-sizing:border-box;padding:8px 12px;font-size:13px;' +
        'border:1px solid #e8e8ec;border-radius:8px;background:#fff;' +
        'color:#18181b;font-family:inherit;resize:vertical;';

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
    // ЖИЗНЕННЫЙ ЦИКЛ — обёртки
    // ============================================================
    function showComputerLifecycle(pcId) {
        var cab = Cabinet();
        if (!cab || !cab.data) return;
        var pc = cab.data.computers.find(function(p) { return p.id === pcId; });
        if (!pc) { utils.showErrorMessage('ПК не найден'); return; }
        if (!window.App.EquipmentLifecycle) {
            utils.showErrorMessage('Модуль жизненного цикла не загружен');
            return;
        }
        window.App.EquipmentLifecycle.openForComputer(pc, cab.data.cabinet);
    }

    function showPrinterLifecycle(prId) {
        var cab = Cabinet();
        if (!cab || !cab.data) return;
        var pr = cab.data.printers.find(function(x) { return x.id === prId; });
        if (!pr) { utils.showErrorMessage('Принтер не найден'); return; }
        if (!window.App.EquipmentLifecycle) {
            utils.showErrorMessage('Модуль жизненного цикла не загружен');
            return;
        }
        window.App.EquipmentLifecycle.openForPrinter(pr, cab.data.cabinet);
    }

    window.showComputerLifecycle = showComputerLifecycle;
    window.showPrinterLifecycle = showPrinterLifecycle;

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
            net.forEach(function(d) { html += renderNetworkDevice(d); });
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
            pcs.forEach(function(p) { html += renderComputer(p); });
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
                '<button class="btn btn-outline-primary" ' +
                'onclick="showComputerLifecycle(' + p.id + ')" ' +
                'title="Жизненный цикл">' +
                '<i class="bi bi-clock-history"></i></button>' +
                '<button class="btn btn-outline-secondary" ' +
                'onclick="duplicateComputer(' + p.id + ')" ' +
                'title="Копировать ПК">' +
                '<i class="bi bi-files"></i></button>' +
                '<button class="btn btn-outline-info" ' +
                'onclick="moveComputer(' + p.id + ')" ' +
                'title="Переместить в другой кабинет">' +
                '<i class="bi bi-arrow-left-right"></i></button>' +
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

        var gpuPsuHtml = '';
        if (p.gpu || p.psu) {
            gpuPsuHtml = '<div class="eq-meta">';
            if (p.gpu) {
                gpuPsuHtml += '<i class="bi bi-gpu-card"></i> GPU: ' +
                    utils.escapeHtml(p.gpu) + ' ';
            }
            if (p.psu) {
                gpuPsuHtml += '<i class="bi bi-plug"></i> БП: ' +
                    utils.escapeHtml(p.psu);
            }
            gpuPsuHtml += '</div>';
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
            gpuPsuHtml +
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
            printers.forEach(function(p) { html += renderPrinter(p, pcs); });
        }
        html += '</div></div>';
        return html;
    };

    function renderPrinter(pr, pcs) {
        var btns = '';
        if (Cabinet().canEdit()) {
            btns =
                '<button class="btn btn-outline-primary" ' +
                'onclick="showPrinterLifecycle(' + pr.id + ')" ' +
                'title="Жизненный цикл">' +
                '<i class="bi bi-clock-history"></i></button>' +
                '<button class="btn btn-outline-info" ' +
                'onclick="movePrinter(' + pr.id + ')" ' +
                'title="Переместить в другой кабинет">' +
                '<i class="bi bi-arrow-left-right"></i></button>' +
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
    // ПРОСМОТР ПК / ПРИНТЕРА
    // ============================================================
    function viewComputer(pcId) {
        var p = Cabinet().data.computers.find(function(x) { return x.id === pcId; });
        if (!p) {
            utils.showErrorMessage('ПК не найден');
            return;
        }
        if (window.App.ComputerCard &&
            typeof window.App.ComputerCard.show === 'function') {
            window.App.ComputerCard.show(p, Cabinet().data.cabinet);
        } else {
            utils.showErrorMessage('Модуль карточки ПК не загружен');
        }
    }

    function viewPrinter(prId) {
        var pr = Cabinet().data.printers.find(function(x) { return x.id === prId; });
        if (!pr) return;
        if (window.App.PrinterCard &&
            typeof window.App.PrinterCard.show === 'function') {
            window.App.PrinterCard.show(pr, Cabinet().data.cabinet);
        } else {
            utils.showErrorMessage('Модуль карточки принтера не загружен');
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
    // КОПИРОВАНИЕ ПК
    // ============================================================
    function duplicateComputer(pcId) {
        var cab = Cabinet();
        if (!cab || !cab.data) return;

        var src = cab.data.computers.find(function(p) { return p.id === pcId; });
        if (!src) { utils.showErrorMessage('ПК не найден'); return; }

        var baseName = (src.name || 'ПК').trim();
        var suggestedName = baseName + ' (копия)';

        Swal.fire({
            title: '<i class="bi bi-files"></i> Копировать ПК',
            html:
                '<div class="text-start">' +
                '<p class="text-muted small mb-3">' +
                'Будут скопированы все характеристики ПК ' +
                '(мат. плата, CPU, GPU, БП, ОЗУ, диски, мониторы, ПО). ' +
                'Инвентарный номер НЕ копируется.</p>' +

                '<div class="mb-2"><label class="form-label">Имя нового ПК</label>' +
                '<input id="dup-name" class="form-control" value="' +
                utils.escapeHtml(suggestedName) + '"></div>' +

                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<div style="' + STYLE_IP_ROW + '">' +
                '<input id="dup-ip" style="' + STYLE_IP_INPUT + '" ' +
                'placeholder="Загрузка..." disabled>' +
                '<button type="button" style="' + STYLE_IP_RELOAD + '" ' +
                'id="dup-ip-reload" title="Подобрать заново">' +
                '<i class="bi bi-arrow-clockwise"></i></button>' +
                '</div>' +
                '<small class="text-muted">Свободный IP в этом кабинете</small>' +
                '</div>' +
                '</div>',
            width: 520,
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-files"></i> Скопировать',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#6c757d',
            didOpen: function() {
                function loadIp() {
                    var $ip = $('#dup-ip');
                    $ip.val('').prop('disabled', true)
                        .attr('placeholder', 'Загрузка...');

                    api.get('/api/cabinets/' + cab.currentId + '/next-ip')
                        .then(function(res) {
                            if (res && res.success) {
                                $ip.val(res.next_ip)
                                    .prop('disabled', false)
                                    .attr('placeholder', '');
                            } else {
                                $ip.prop('disabled', false)
                                    .attr('placeholder', '192.168.1.100');
                            }
                        })
                        .catch(function() {
                            $ip.prop('disabled', false)
                                .attr('placeholder', '192.168.1.100');
                        });
                }
                loadIp();

                $('#dup-ip-reload').on('click', function(e) {
                    e.preventDefault();
                    loadIp();
                });
            },
            preConfirm: function() {
                var name = ($('#dup-name').val() || '').trim();
                if (!name) {
                    Swal.showValidationMessage('Введите имя');
                    return false;
                }
                return {
                    name: name,
                    ip_address: ($('#dup-ip').val() || '').trim(),
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;

            Swal.fire({
                title: 'Создание копии...',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.post('/api/computers/' + pcId + '/duplicate', r.value)
                .then(function(res) {
                    Swal.close();
                    if (res.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Копия создана',
                            html: '<div class="text-start">' +
                                '<p><strong>Имя:</strong> ' +
                                utils.escapeHtml(res.name) + '</p>' +
                                '<p><strong>IP:</strong> ' +
                                utils.escapeHtml(res.ip_address) + '</p>' +
                                '</div>',
                            timer: 2500,
                            showConfirmButton: false,
                        });
                        Cabinet().reload();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                })
                .catch(function(err) {
                    Swal.close();
                    utils.showErrorMessage(err.message || 'Ошибка копирования');
                });
        });
    }

    // ============================================================
    // ПЕРЕМЕЩЕНИЕ ПК В ДРУГОЙ КАБИНЕТ
    // ============================================================
    function moveComputer(pcId) {
        var cab = Cabinet();
        if (!cab || !cab.data) return;

        var src = cab.data.computers.find(function(p) { return p.id === pcId; });
        if (!src) { utils.showErrorMessage('ПК не найден'); return; }

        api.get('/api/cabinets')
            .then(function(cabinets) {
                var options = '<option value="">— выберите кабинет —</option>';
                (cabinets || []).forEach(function(c) {
                    if (c.id === src.cabinet_id) return;
                    options += '<option value="' + c.id + '">' +
                        utils.escapeHtml(c.cabinet_number +
                            (c.description ? ' — ' + c.description : '')) +
                        '</option>';
                });

                Swal.fire({
                    title: '<i class="bi bi-arrow-left-right"></i> Переместить ПК',
                    html:
                        '<div class="text-start">' +
                        '<p class="text-muted small mb-3">' +
                        'ПК «<strong>' +
                        utils.escapeHtml(src.name || '') +
                        '</strong>» будет перемещён в выбранный кабинет. ' +
                        'Подключённые USB-принтеры будут отвязаны.</p>' +

                        '<div class="mb-2"><label class="form-label">' +
                        'Новый кабинет *</label>' +
                        '<select id="mv-cabinet" class="form-select">' +
                        options + '</select></div>' +

                        '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                        '<div style="' + STYLE_IP_ROW + '">' +
                        '<input id="mv-ip" style="' + STYLE_IP_INPUT + '" ' +
                        'placeholder="Сначала выберите кабинет" disabled>' +
                        '<button type="button" style="' + STYLE_IP_RELOAD + '" ' +
                        'id="mv-ip-reload" title="Подобрать заново">' +
                        '<i class="bi bi-arrow-clockwise"></i></button>' +
                        '</div>' +
                        '<small class="text-muted">Свободный IP в новом кабинете</small>' +
                        '</div>' +
                        '</div>',
                    width: 520,
                    showCancelButton: true,
                    confirmButtonText: '<i class="bi bi-arrow-left-right"></i> Переместить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#0ea5e9',
                    didOpen: function() {
                        var $cabSel = $('#mv-cabinet');
                        var $ip = $('#mv-ip');

                        function loadIp(cabinetId) {
                            if (!cabinetId) {
                                $ip.val('').prop('disabled', true)
                                    .attr('placeholder', 'Сначала выберите кабинет');
                                return;
                            }
                            $ip.val('').prop('disabled', true)
                                .attr('placeholder', 'Загрузка...');
                            api.get('/api/cabinets/' + cabinetId + '/next-ip')
                                .then(function(res) {
                                    if (res && res.success) {
                                        $ip.val(res.next_ip)
                                            .prop('disabled', false)
                                            .attr('placeholder', '');
                                    } else {
                                        $ip.prop('disabled', false)
                                            .attr('placeholder', '192.168.1.100');
                                    }
                                })
                                .catch(function() {
                                    $ip.prop('disabled', false)
                                        .attr('placeholder', '192.168.1.100');
                                });
                        }

                        $cabSel.on('change', function() {
                            loadIp($(this).val());
                        });

                        $('#mv-ip-reload').on('click', function(e) {
                            e.preventDefault();
                            loadIp($cabSel.val());
                        });
                    },
                    preConfirm: function() {
                        var cabinetId = $('#mv-cabinet').val();
                        if (!cabinetId) {
                            Swal.showValidationMessage('Выберите кабинет');
                            return false;
                        }
                        return {
                            cabinet_id: parseInt(cabinetId, 10),
                            ip_address: ($('#mv-ip').val() || '').trim(),
                        };
                    },
                }).then(function(r) {
                    if (!r.isConfirmed) return;

                    Swal.fire({
                        title: 'Перемещение...',
                        allowOutsideClick: false,
                        didOpen: function() { Swal.showLoading(); },
                    });

                    api.post('/api/computers/' + pcId + '/move', r.value)
                        .then(function(res) {
                            Swal.close();
                            if (res.success) {
                                utils.showSuccessMessage(
                                    res.message || 'ПК перемещён'
                                );
                                Cabinet().reload();
                            } else {
                                utils.showErrorMessage(res.error);
                            }
                        })
                        .catch(function(err) {
                            Swal.close();
                            utils.showErrorMessage(err.message || 'Ошибка');
                        });
                });
            })
            .catch(function() {
                utils.showErrorMessage('Не удалось загрузить список кабинетов');
            });
    }

    // ============================================================
    // ПЕРЕМЕЩЕНИЕ ПРИНТЕРА В ДРУГОЙ КАБИНЕТ
    // ============================================================
    function movePrinter(printerId) {
        var cab = Cabinet();
        if (!cab || !cab.data) return;

        var src = cab.data.printers.find(function(x) { return x.id === printerId; });
        if (!src) { utils.showErrorMessage('Принтер не найден'); return; }

        var connType = src.connection_type || 'network';
        var isNetwork = (connType === 'network');

        api.get('/api/cabinets')
            .then(function(cabinets) {
                var options = '<option value="">— выберите кабинет —</option>';
                (cabinets || []).forEach(function(c) {
                    if (c.id === src.cabinet_id) return;
                    options += '<option value="' + c.id + '">' +
                        utils.escapeHtml(c.cabinet_number +
                            (c.description ? ' — ' + c.description : '')) +
                        '</option>';
                });

                var ipBlockHtml = '';
                if (isNetwork) {
                    ipBlockHtml =
                        '<div class="mb-2"><label class="form-label">' +
                        'IP-адрес</label>' +
                        '<div style="' + STYLE_IP_ROW + '">' +
                        '<input id="mvp-ip" style="' + STYLE_IP_INPUT + '" ' +
                        'value="' + utils.escapeHtml(src.ip_address || '') + '" ' +
                        'placeholder="192.168.1.100">' +
                        '<button type="button" style="' + STYLE_IP_RELOAD + '" ' +
                        'id="mvp-ip-reload" title="Подобрать свободный">' +
                        '<i class="bi bi-arrow-clockwise"></i>' +
                        '</button>' +
                        '</div>' +
                        '<small class="text-muted">' +
                        'Если не менять — останется текущий IP</small>' +
                        '</div>';
                }

                var usbNote = !isNetwork
                    ? '<div class="alert alert-info small mb-2">' +
                      '<i class="bi bi-info-circle"></i> ' +
                      'USB-принтер будет отвязан от текущего ПК.</div>'
                    : '';

                Swal.fire({
                    title: '<i class="bi bi-arrow-left-right"></i> Переместить принтер',
                    html:
                        '<div class="text-start">' +
                        '<p class="text-muted small mb-3">' +
                        'Принтер «<strong>' +
                        utils.escapeHtml(src.model || '') +
                        '</strong>» будет перемещён в выбранный кабинет.</p>' +

                        usbNote +

                        '<div class="mb-2"><label class="form-label">' +
                        'Новый кабинет *</label>' +
                        '<select id="mvp-cabinet" class="form-select">' +
                        options + '</select></div>' +

                        ipBlockHtml +
                        '</div>',
                    width: 520,
                    showCancelButton: true,
                    confirmButtonText: '<i class="bi bi-arrow-left-right"></i> Переместить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#0ea5e9',
                    didOpen: function() {
                        if (!isNetwork) return;

                        var $cabSel = $('#mvp-cabinet');
                        var $ip = $('#mvp-ip');

                        $('#mvp-ip-reload').on('click', function(e) {
                            e.preventDefault();
                            var cabId = $cabSel.val();
                            if (!cabId) {
                                utils.showErrorMessage('Сначала выберите кабинет');
                                return;
                            }
                            $ip.prop('disabled', true)
                                .attr('placeholder', 'Загрузка...');
                            api.get('/api/cabinets/' + cabId + '/next-ip')
                                .then(function(res) {
                                    if (res && res.success) {
                                        $ip.val(res.next_ip)
                                            .prop('disabled', false)
                                            .attr('placeholder', '');
                                    } else {
                                        $ip.prop('disabled', false)
                                            .attr('placeholder', '192.168.1.100');
                                    }
                                })
                                .catch(function() {
                                    $ip.prop('disabled', false)
                                        .attr('placeholder', '192.168.1.100');
                                });
                        });
                    },
                    preConfirm: function() {
                        var cabinetId = $('#mvp-cabinet').val();
                        if (!cabinetId) {
                            Swal.showValidationMessage('Выберите кабинет');
                            return false;
                        }
                        return {
                            cabinet_id: parseInt(cabinetId, 10),
                            ip_address: isNetwork
                                ? ($('#mvp-ip').val() || '').trim()
                                : '',
                        };
                    },
                }).then(function(r) {
                    if (!r.isConfirmed) return;

                    Swal.fire({
                        title: 'Перемещение...',
                        allowOutsideClick: false,
                        didOpen: function() { Swal.showLoading(); },
                    });

                    api.post('/api/printers/' + printerId + '/move', r.value)
                        .then(function(res) {
                            Swal.close();
                            if (res.success) {
                                utils.showSuccessMessage(
                                    res.message || 'Принтер перемещён'
                                );
                                Cabinet().reload();
                            } else {
                                utils.showErrorMessage(res.error);
                            }
                        })
                        .catch(function(err) {
                            Swal.close();
                            utils.showErrorMessage(err.message || 'Ошибка');
                        });
                });
            })
            .catch(function() {
                utils.showErrorMessage('Не удалось загрузить список кабинетов');
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
        var isNew = !pcId;
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

        // ---------- RAM-строка (только inline-стили) ----------
        function ramRowHtml(r) {
            var numVal = (r.size || '').replace(/\s*(GB|TB|MB)\s*$/i, '');
            return '<div style="' + STYLE_RAM_ROW + '">' +
                '<input class="eq-ram-size" type="number" min="1" max="999"' +
                ' style="' + STYLE_RAM_INPUT + '" ' +
                'value="' + utils.escapeHtml(numVal) + '" placeholder="8">' +
                '<span style="' + STYLE_UNIT_LABEL + '">GB</span>' +
                '<select class="eq-ram-type" style="' + STYLE_RAM_SELECT + '">' +
                ['DDR3','DDR4','DDR5','LPDDR4','LPDDR5'].map(function(t) {
                    return '<option value="' + t + '"' +
                        (t === r.type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') +
                '</select>' +
                '<button type="button" class="eq-ram-remove" ' +
                'style="' + STYLE_REMOVE_BTN + '">' +
                '<i class="bi bi-x"></i></button>' +
                '</div>';
        }

        // ---------- Storage-строка (только inline-стили) ----------
        function storageRowHtml(s) {
            var val = (s.capacity || '').trim();
            var suffix = 'GB';
            if (/\s*TB/i.test(val)) {
                suffix = 'TB';
                val = val.replace(/\s*TB/i, '');
            } else {
                val = val.replace(/\s*GB/i, '');
            }

            return '<div style="' + STYLE_STORAGE_ROW + '">' +
                '<input class="eq-storage-cap" type="number" min="1" max="9999"' +
                ' style="' + STYLE_STORAGE_INPUT + '" ' +
                'value="' + utils.escapeHtml(val) + '" placeholder="512">' +
                '<select class="eq-storage-unit" ' +
                'style="' + STYLE_STORAGE_SELECT + '">' +
                '<option value="GB"' + (suffix === 'GB' ? ' selected' : '') +
                '>GB</option>' +
                '<option value="TB"' + (suffix === 'TB' ? ' selected' : '') +
                '>TB</option></select>' +
                '<select class="eq-storage-type" ' +
                'style="' + STYLE_STORAGE_SELECT + '">' +
                ['SSD','HDD','NVMe','SSD M.2','eMMC'].map(function(t) {
                    return '<option value="' + t + '"' +
                        (t === s.type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') +
                '</select>' +
                '<button type="button" class="eq-storage-remove" ' +
                'style="' + STYLE_REMOVE_BTN + '">' +
                '<i class="bi bi-x"></i></button>' +
                '</div>';
        }

        // ---------- Список выбранного ПО ----------
        function selectedSoftwareList() {
            if (software.length === 0) {
                return '<div style="padding:4px 8px;font-size:12px;color:#a1a1aa;font-style:italic;">' +
                    '— ничего не выбрано —</div>';
            }
            return software.map(function(s, i) {
                return '<div style="display:flex;justify-content:space-between;' +
                    'align-items:center;gap:8px;padding:4px 8px;' +
                    'background:#fff;border:1px solid #e8e8ec;border-radius:6px;' +
                    'margin-bottom:4px;font-size:13px;">' +
                    '<span style="flex:1;min-width:0;word-break:break-word;">' +
                    '<i class="bi bi-window" style="color:#6366f1;margin-right:4px;"></i>' +
                    utils.escapeHtml(s) + '</span>' +
                    '<button type="button" class="eq-soft-remove" ' +
                    'data-index="' + i + '" ' +
                    'style="width:24px;height:24px;padding:0;border:none;' +
                    'background:transparent;color:#ef4444;cursor:pointer;' +
                    'display:inline-flex;align-items:center;justify-content:center;' +
                    'border-radius:4px;">' +
                    '<i class="bi bi-x-lg" style="font-size:11px;"></i></button>' +
                    '</div>';
            }).join('');
        }

        // ---------- Список доступного ПО (чекбоксы) ----------
        function availableSoftwareList() {
            if (available.length === 0) {
                return '<div style="padding:8px;font-size:12px;color:#a1a1aa;font-style:italic;">' +
                    'В лицензиях кабинета нет ПО.</div>';
            }
            return available.map(function(a) {
                var checked = (software.indexOf(a.name) !== -1) ? ' checked' : '';
                var dataName = utils.escapeHtml(a.name);
                return '<label style="display:flex;align-items:center;gap:8px;' +
                    'padding:5px 8px;border-radius:6px;cursor:pointer;' +
                    'font-size:13px;margin-bottom:2px;">' +
                    '<input type="checkbox" data-software-name="' + dataName +
                    '"' + checked + ' ' +
                    'style="width:16px;height:16px;flex-shrink:0;margin:0;cursor:pointer;">' +
                    '<span style="flex:1;word-break:break-word;">' +
                    utils.escapeHtml(a.name) +
                    (a.type
                        ? ' <small style="color:#a1a1aa;">(' +
                          utils.escapeHtml(a.type) + ')</small>'
                        : '') +
                    '</span></label>';
            }).join('');
        }

        // ---------- HTML модалки ----------
        var modalHtml =
            '<div class="text-start" style="width:100%;">' +

            // ===== Верхняя сетка 2×N =====
            '<div style="' + STYLE_GRID_2COL + '">' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Название *</label>' +
                '<input id="eq-pc-name" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.name || '') + '"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Инвентарный номер</label>' +
                '<input id="eq-pc-inv" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.inventory_number || '') + '"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Материнская плата</label>' +
                '<input id="eq-pc-mb" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.motherboard || '') + '"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Сокет материнской платы</label>' +
                '<input id="eq-pc-socket" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.motherboard_socket || '') +
                '" list="socket-list">' +
                '<datalist id="socket-list">' +
                '<option value="LGA1151"><option value="LGA1200">' +
                '<option value="LGA1700"><option value="AM4">' +
                '<option value="AM5"></datalist></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Процессор (CPU)</label>' +
                '<input id="eq-pc-cpu" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.cpu || '') + '"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Видеокарта (GPU)</label>' +
                '<input id="eq-pc-gpu" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.gpu || '') + '" ' +
                'placeholder="Например: NVIDIA GTX 1660"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">Блок питания (БП)</label>' +
                '<input id="eq-pc-psu" style="' + STYLE_FORM_CONTROL + '" ' +
                'value="' + utils.escapeHtml(data.psu || '') + '" ' +
                'placeholder="Например: 500W Chieftec"></div>' +

                '<div>' +
                '<label style="' + STYLE_FORM_LABEL + '">IP-адрес</label>' +
                '<div style="' + STYLE_IP_ROW + '">' +
                '<input id="eq-pc-ip" style="' + STYLE_IP_INPUT + '" ' +
                'value="' + utils.escapeHtml(data.ip_address || '') + '" ' +
                'placeholder="Автоподбор..."' +
                (isNew ? ' disabled' : '') + '>' +
                (isNew
                    ? '<button type="button" style="' + STYLE_IP_RELOAD + '" ' +
                      'id="eq-pc-ip-reload" title="Подобрать заново">' +
                      '<i class="bi bi-arrow-clockwise"></i></button>'
                    : '') +
                '</div></div>' +

            '</div>' +

            // ===== ОЗУ =====
            '<div style="' + STYLE_FORM_BLOCK + '">' +
                '<label style="' + STYLE_FORM_LABEL + '">ОЗУ (в GB)</label>' +
                '<div id="eq-ram-container">' +
                ram.map(ramRowHtml).join('') + '</div>' +
                '<button type="button" id="eq-add-ram" ' +
                'style="' + STYLE_FULL_BTN + '">' +
                '<i class="bi bi-plus"></i> Добавить планку</button>' +
            '</div>' +

            // ===== Диски =====
            '<div style="' + STYLE_FORM_BLOCK + '">' +
                '<label style="' + STYLE_FORM_LABEL + '">Диски</label>' +
                '<div id="eq-storage-container">' +
                storage.map(storageRowHtml).join('') + '</div>' +
                '<button type="button" id="eq-add-storage" ' +
                'style="' + STYLE_FULL_BTN + '">' +
                '<i class="bi bi-plus"></i> Добавить диск</button>' +
            '</div>' +

            // ===== Установленное ПО (без ручного ввода) =====
            '<div style="' + STYLE_FORM_BLOCK + '">' +
                '<label style="' + STYLE_FORM_LABEL + '">Установленное ПО</label>' +
                '<div id="eq-software-selected" ' +
                'style="' + STYLE_SELECTED_BOX + '">' +
                selectedSoftwareList() + '</div>' +
                '<button type="button" id="eq-toggle-soft" ' +
                'style="' + STYLE_TOGGLE_SOFT + '">' +
                '<i class="bi bi-list-check"></i> ' +
                '<span id="eq-toggle-soft-label">Показать доступные ПО</span>' +
                '</button>' +
                '<div id="eq-software-available" ' +
                'style="display:none;' + STYLE_AVAILABLE_BOX + '">' +
                availableSoftwareList() + '</div>' +
            '</div>' +

            // ===== Примечание =====
            '<div style="' + STYLE_FORM_BLOCK + '">' +
                '<label style="' + STYLE_FORM_LABEL + '">Примечание</label>' +
                '<textarea id="eq-pc-notes" rows="2" ' +
                'style="' + STYLE_FORM_TEXTAREA + '">' +
                utils.escapeHtml(data.notes || '') + '</textarea>' +
            '</div>' +

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
                // ---------- Автоподстановка IP для нового ПК ----------
                if (isNew) {
                    var $ip = $('#eq-pc-ip');
                    function loadIp() {
                        $ip.val('').prop('disabled', true)
                            .attr('placeholder', 'Загрузка...');
                        api.get('/api/cabinets/' + Cabinet().currentId + '/next-ip')
                            .then(function(res) {
                                if (res && res.success) {
                                    $ip.val(res.next_ip)
                                        .prop('disabled', false)
                                        .attr('placeholder', '');
                                } else {
                                    $ip.prop('disabled', false)
                                        .attr('placeholder', '192.168.1.100');
                                }
                            })
                            .catch(function() {
                                $ip.prop('disabled', false)
                                    .attr('placeholder', '192.168.1.100');
                            });
                    }
                    loadIp();
                    $('#eq-pc-ip-reload').on('click', function(e) {
                        e.preventDefault();
                        loadIp();
                    });
                }

                // ---------- Обновление UI ПО ----------
                function refreshSelectedSoftware() {
                    var cont = document.getElementById('eq-software-selected');
                    if (cont) cont.innerHTML = selectedSoftwareList();
                }

                function refreshAvailableCheckboxes() {
                    var list = document.getElementById('eq-software-available');
                    if (!list) return;
                    list.querySelectorAll(
                        'input[type="checkbox"][data-software-name]'
                    ).forEach(function(cb) {
                        var n = cb.getAttribute('data-software-name');
                        cb.checked = (software.indexOf(n) !== -1);
                    });
                }

                // ---------- RAM: добавить ----------
                $('#eq-add-ram').on('click', function(e) {
                    e.preventDefault();
                    var c = document.getElementById('eq-ram-container');
                    if (!c) return;
                    var div = document.createElement('div');
                    div.style.cssText = STYLE_RAM_ROW;
                    div.innerHTML =
                        '<input class="eq-ram-size" type="number" ' +
                        'min="1" max="999" placeholder="8" ' +
                        'style="' + STYLE_RAM_INPUT + '">' +
                        '<span style="' + STYLE_UNIT_LABEL + '">GB</span>' +
                        '<select class="eq-ram-type" ' +
                        'style="' + STYLE_RAM_SELECT + '">' +
                        '<option>DDR3</option>' +
                        '<option selected>DDR4</option>' +
                        '<option>DDR5</option></select>' +
                        '<button type="button" class="eq-ram-remove" ' +
                        'style="' + STYLE_REMOVE_BTN + '">' +
                        '<i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                });

                // ---------- Storage: добавить ----------
                $('#eq-add-storage').on('click', function(e) {
                    e.preventDefault();
                    var c = document.getElementById('eq-storage-container');
                    if (!c) return;
                    var div = document.createElement('div');
                    div.style.cssText = STYLE_STORAGE_ROW;
                    div.innerHTML =
                        '<input class="eq-storage-cap" type="number" ' +
                        'min="1" max="9999" placeholder="512" ' +
                        'style="' + STYLE_STORAGE_INPUT + '">' +
                        '<select class="eq-storage-unit" ' +
                        'style="' + STYLE_STORAGE_SELECT + '">' +
                        '<option value="GB" selected>GB</option>' +
                        '<option value="TB">TB</option></select>' +
                        '<select class="eq-storage-type" ' +
                        'style="' + STYLE_STORAGE_SELECT + '">' +
                        '<option selected>SSD</option>' +
                        '<option>HDD</option>' +
                        '<option>NVMe</option></select>' +
                        '<button type="button" class="eq-storage-remove" ' +
                        'style="' + STYLE_REMOVE_BTN + '">' +
                        '<i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                });

                // ---------- Удаление RAM/Storage ----------
                $(document).off('click.eqRamRemove')
                    .on('click.eqRamRemove', '.eq-ram-remove', function(e) {
                        e.preventDefault();
                        $(this).parent().remove();
                    });

                $(document).off('click.eqStorageRemove')
                    .on('click.eqStorageRemove', '.eq-storage-remove', function(e) {
                        e.preventDefault();
                        $(this).parent().remove();
                    });

                // ---------- ПО: toggle доступного ----------
                $('#eq-toggle-soft').on('click', function(e) {
                    e.preventDefault();
                    var block = document.getElementById('eq-software-available');
                    var label = document.getElementById('eq-toggle-soft-label');
                    if (!block) return;
                    if (block.style.display === 'none') {
                        block.style.display = 'block';
                        if (label) label.textContent = 'Скрыть доступные ПО';
                    } else {
                        block.style.display = 'none';
                        if (label) label.textContent = 'Показать доступные ПО';
                    }
                });

                // ---------- ПО: чекбоксы ----------
                $('#eq-software-available').on('change', 'input[type="checkbox"]',
                    function() {
                        var cb = this;
                        var name = cb.getAttribute('data-software-name');
                        if (!name) return;
                        var idx = software.indexOf(name);
                        if (cb.checked && idx === -1) software.push(name);
                        else if (!cb.checked && idx !== -1) software.splice(idx, 1);
                        refreshSelectedSoftware();
                    });

                // ---------- ПО: удаление из выбранного ----------
                $('#eq-software-selected').on('click', '.eq-soft-remove',
                    function(e) {
                        e.preventDefault();
                        var i = parseInt($(this).attr('data-index'), 10);
                        software.splice(i, 1);
                        refreshSelectedSoftware();
                        refreshAvailableCheckboxes();
                    });
            },
            preConfirm: function() {
                var name = Cabinet().getTrimmed('eq-pc-name');
                if (!name) {
                    Swal.showValidationMessage('Введите название ПК');
                    return false;
                }

                var ramArr = [];
                document.querySelectorAll('#eq-ram-container .eq-ram-size')
                    .forEach(function(el) {
                        var row = el.parentNode;
                        var typeEl = row.querySelector('.eq-ram-type');
                        if (!typeEl) return;
                        var val = (el.value || '').trim();
                        if (val) ramArr.push({
                            size: val + ' GB',
                            type: typeEl.value,
                        });
                    });

                var storageArr = [];
                document.querySelectorAll(
                    '#eq-storage-container .eq-storage-cap'
                ).forEach(function(el) {
                    var row = el.parentNode;
                    var typeEl = row.querySelector('.eq-storage-type');
                    var unitEl = row.querySelector('.eq-storage-unit');
                    if (!typeEl) return;
                    var cap = (el.value || '').trim();
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
                    gpu: Cabinet().getTrimmed('eq-pc-gpu'),
                    psu: Cabinet().getTrimmed('eq-pc-psu'),
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

    window.showAddNetwork = showAddNetwork;
    window.editNetwork = editNetwork;
    window.deleteNetwork = deleteNetwork;
    window.showAddComputer = showAddComputer;
    window.editComputer = editComputer;
    window.deleteComputer = deleteComputer;
    window.duplicateComputer = duplicateComputer;
    window.moveComputer = moveComputer;
    window.movePrinter = movePrinter;
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