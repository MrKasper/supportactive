// static/js/cabinet_details.js
// Детальная страница кабинета: сеть, ПК, принтеры, документы, печать

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_details] App не инициализирован');
        return;
    }

    var api = window.App.register('CabinetDetails');
    var utils = window.App.utils;

    var currentCabinetId = null;
    var currentData = null;
    var availableSoftwareCache = [];
    var documentsCache = [];
    var _pingRefreshTimer = null;

    function canEdit() {
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Техник';
    }

    // ============================================================
    // ОТКРЫТИЕ
    // ============================================================
    function open(cabinetId) {
        currentCabinetId = cabinetId;
        var $b = $('#otherPagesBlock');
        $b.html('<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Загрузка...</p></div>');
        $('#tasksBlock').hide();
        $b.show();
        $('.sidebar .nav-link').removeClass('active');
        loadData();
        startAutoRefresh();
    }

    function loadData() {
        Promise.all([
            fetch('/api/cabinets/' + currentCabinetId + '/details').then(function(r) { return r.json(); }),
            fetch('/api/cabinets/' + currentCabinetId + '/available-software').then(function(r) { return r.json(); }),
            fetch('/api/cabinets/' + currentCabinetId + '/documents').then(function(r) { return r.json(); })
        ])
            .then(function(results) {
                var data = results[0];
                var software = results[1];
                var documents = results[2];

                if (data.error) {
                    $('#otherPagesBlock').html('<div class="alert alert-danger">' + utils.escapeHtml(data.error) + '</div>');
                    return;
                }

                currentData = data;
                availableSoftwareCache = Array.isArray(software) ? software : [];
                documentsCache = Array.isArray(documents) ? documents : [];
                render();
                setTimeout(refreshPingStatuses, 500);
            })
            .catch(function(err) {
                console.error('[cabinet_details] load error:', err);
                $('#otherPagesBlock').html('<div class="alert alert-danger">Не удалось загрузить кабинет</div>');
            });
    }

    // ============================================================
    // АВТО-ОБНОВЛЕНИЕ ПИНГА
    // ============================================================
    function startAutoRefresh() {
        stopAutoRefresh();
        _pingRefreshTimer = setInterval(refreshPingStatuses, 5 * 60 * 1000);
        setTimeout(refreshPingStatuses, 5000);
    }

    function stopAutoRefresh() {
        if (_pingRefreshTimer) {
            clearInterval(_pingRefreshTimer);
            _pingRefreshTimer = null;
        }
    }

    function refreshPingStatuses() {
        if (!currentCabinetId) return;
        if (!$('#otherPagesBlock').is(':visible')) return;

        fetch('/api/cabinets/' + currentCabinetId + '/ping-status')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) return;
                var pcs = data.computers || [];
                pcs.forEach(function(pc) {
                    var $card = $('.eq-device[data-pc-id="' + pc.id + '"]');
                    if ($card.length === 0) return;
                    var $status = $card.find('[data-pc-status]');
                    if (pc.status === 'online') {
                        $status.removeClass('offline').addClass('online').html('<i class="bi bi-circle-fill"></i> Онлайн');
                    } else {
                        $status.removeClass('online').addClass('offline').html('<i class="bi bi-circle"></i> Офлайн');
                    }
                    updatePcStats($card, {
                        ping_count: pc.ping_count,
                        ping_success_count: pc.ping_success_count,
                        last_ping_at: pc.last_ping_at
                    });
                    if (currentData) {
                        var cached = currentData.computers.find(function(p) { return p.id === pc.id; });
                        if (cached) {
                            cached.status = pc.status;
                            cached.ping_count = pc.ping_count;
                            cached.ping_success_count = pc.ping_success_count;
                            cached.last_ping_at = pc.last_ping_at;
                        }
                    }
                });
                if (data.last_ping_at) {
                    var $hint = $('#eq-last-ping-hint');
                    var hintHtml = '<i class="bi bi-clock-history"></i> Последняя автопроверка: ' + utils.formatDate(data.last_ping_at);
                    if ($hint.length === 0) {
                        $('.eq-grid').before('<div id="eq-last-ping-hint" class="text-muted small mb-3 text-center">' + hintHtml + '</div>');
                    } else {
                        $hint.html(hintHtml);
                    }
                }
            })
            .catch(function(err) { console.warn('[cabinet_details] auto-refresh:', err); });
    }

    // ============================================================
    // РЕНДЕР
    // ============================================================
    function render() {
        var c = currentData.cabinet;
        var net = currentData.network_devices || [];
        var pcs = currentData.computers || [];
        var printers = currentData.printers || [];

        var html = '';

        // Шапка
        html += '<div class="eq-header">';
        html += '<div>';
        html += '<h4><i class="bi bi-door-closed"></i> ' + utils.escapeHtml(c.cabinet_number || 'Кабинет') + '</h4>';
        if (c.description) html += '<small style="opacity:.85">' + utils.escapeHtml(c.description) + '</small>';
        html += '</div>';
        html += '<div class="d-flex gap-2 flex-wrap">';
        html += '<button class="btn btn-light" onclick="printCabinet()" title="Печать карточки кабинета">' +
                '<i class="bi bi-printer"></i> Печать</button>';
        html += '<button class="btn eq-back-btn" onclick="loadCabinetsManagePage()">' +
                '<i class="bi bi-arrow-left"></i> К списку</button>';
        html += '</div>';
        html += '</div>';

        // Инфо
        html += '<div class="eq-cabinet-info">';
        if (c.floor) html += infoBlock('Этаж', c.floor);
        if (c.building) html += infoBlock('Корпус', c.building);
        if (c.responsible_person) html += infoBlock('Ответственный', c.responsible_person);
        if (c.phone) html += infoBlock('Телефон', c.phone);
        html += '</div>';

        // KPI
        var onlineCount = pcs.filter(function(p) { return p.status === 'online'; }).length;
        html += '<div class="row mb-3 g-3">';
        html += kpiCard('Сетевых устройств', net.length, 'bi-hdd-network', 'info');
        html += kpiCard('Компьютеров', pcs.length + (onlineCount > 0 ? ' <small style="font-size:.55em;opacity:.75">(' + onlineCount + ' online)</small>' : ''), 'bi-pc-display', 'primary');
        html += kpiCard('Принтеров', printers.length, 'bi-printer', 'success');
        html += kpiCard('Документов ПО', documentsCache.length, 'bi-file-earmark-text', 'warning');
        html += '</div>';

        // Сетка
        html += '<div class="eq-grid">';

        // Сеть
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-hdd-network"></i> Сетевое оборудование <span class="badge bg-secondary">' + net.length + '</span></h6>';
        if (canEdit()) html += '<button class="btn btn-sm btn-success" onclick="showAddNetwork()"><i class="bi bi-plus-circle"></i> Добавить</button>';
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (net.length === 0) html += emptyState('bi-hdd-network', 'Оборудование не добавлено');
        else net.forEach(function(d) { html += renderNetworkDevice(d); });
        html += '</div></div>';

        // ПК
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-pc-display"></i> Компьютеры <span class="badge bg-secondary">' + pcs.length + '</span></h6>';
        if (canEdit()) {
            html += '<div class="d-flex gap-1">';
            html += '<button class="btn btn-sm btn-outline-primary" onclick="pingAllInCabinet()" title="Проверить все ПК"><i class="bi bi-wifi"></i> Проверить все</button>';
            html += '<button class="btn btn-sm btn-success" onclick="showAddComputer()"><i class="bi bi-plus-circle"></i> Добавить</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (pcs.length === 0) html += emptyState('bi-pc-display', 'Компьютеров нет');
        else pcs.forEach(function(p) { html += renderComputer(p); });
        html += '</div></div>';

        // Принтеры
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-printer"></i> Принтеры <span class="badge bg-secondary">' + printers.length + '</span></h6>';
        if (canEdit()) {
            html += '<div class="d-flex gap-1">';
            html += '<button class="btn btn-sm btn-outline-primary" onclick="importPrintersFromCartridges()" title="Импорт из Картриджей"><i class="bi bi-download"></i> Импорт</button>';
            html += '<button class="btn btn-sm btn-success" onclick="showAddPrinter()"><i class="bi bi-plus-circle"></i> Добавить</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (printers.length === 0) html += emptyState('bi-printer', 'Принтеров нет');
        else printers.forEach(function(p) { html += renderPrinter(p, pcs); });
        html += '</div></div>';

        // Документы ПО
        html += '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title"><i class="bi bi-file-earmark-text"></i> Документы ПО <span class="badge bg-secondary">' + documentsCache.length + '</span></h6>';
        if (canEdit()) {
            html += '<button class="btn btn-sm btn-success" onclick="showUploadDocument()"><i class="bi bi-upload"></i> Загрузить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';
        if (documentsCache.length === 0) {
            html += emptyState('bi-file-earmark-text', 'Документов нет');
        } else {
            // Группируем по software_name
            var grouped = {};
            documentsCache.forEach(function(d) {
                var key = d.software_name || 'Прочее';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(d);
            });
            Object.keys(grouped).sort().forEach(function(swName) {
                html += '<div class="eq-doc-group">';
                html += '<div class="eq-doc-group-title"><i class="bi bi-window"></i> ' + utils.escapeHtml(swName) + '</div>';
                grouped[swName].forEach(function(doc) {
                    html += renderDocument(doc);
                });
                html += '</div>';
            });
        }
        html += '</div></div>';

        html += '</div>';
        $('#otherPagesBlock').html(html);
    }

    // ============================================================
    // РЕНДЕР: документ
    // ============================================================
    function renderDocument(doc) {
        var ext = (doc.original_name || '').split('.').pop().toLowerCase();
        var icon = 'bi-file-earmark';
        if (['pdf'].indexOf(ext) !== -1) icon = 'bi-file-earmark-pdf';
        else if (['doc','docx'].indexOf(ext) !== -1) icon = 'bi-file-earmark-word';
        else if (['xls','xlsx','csv'].indexOf(ext) !== -1) icon = 'bi-file-earmark-excel';
        else if (['png','jpg','jpeg','gif','webp','bmp'].indexOf(ext) !== -1) icon = 'bi-file-earmark-image';
        else if (['zip','rar','7z','tar','gz'].indexOf(ext) !== -1) icon = 'bi-file-earmark-zip';

        var sizeText = doc.file_size ? utils.formatSize(doc.file_size) : '';
        var exists = doc.file_exists !== false;

        var actions = '<div class="eq-doc-actions">';
        if (exists) {
            actions += '<a class="btn btn-sm btn-outline-primary" href="/api/documents/' + doc.id + '/download" title="Скачать"><i class="bi bi-download"></i></a>';
        }
        if (canEdit()) {
            actions += '<button class="btn btn-sm btn-outline-danger" onclick="deleteDocument(' + doc.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }
        actions += '</div>';

        return '<div class="eq-doc-item' + (exists ? '' : ' eq-doc-missing') + '">' +
            '<div class="eq-doc-icon"><i class="bi ' + icon + '"></i></div>' +
            '<div class="eq-doc-info">' +
            '<div class="eq-doc-name" title="' + utils.escapeHtml(doc.original_name) + '">' +
            utils.escapeHtml(doc.original_name) + '</div>' +
            '<div class="eq-doc-meta">' + sizeText +
            (doc.uploaded_by_name ? ' · ' + utils.escapeHtml(doc.uploaded_by_name) : '') +
            (doc.uploaded_at ? ' · ' + utils.formatDate(doc.uploaded_at) : '') +
            '</div>' +
            '</div>' +
            actions +
            '</div>';
    }

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    function infoBlock(label, value) {
        return '<div><div class="eq-label">' + utils.escapeHtml(label) + '</div>' +
               '<div class="eq-value">' + utils.escapeHtml(value) + '</div></div>';
    }

    function kpiCard(label, value, icon, color) {
        return '<div class="col-6 col-md-3"><div class="cart-kpi bg-grad-' + color + '">' +
            '<i class="bi ' + icon + ' kpi-icon"></i>' +
            '<div class="kpi-value">' + value + '</div>' +
            '<div class="kpi-label">' + utils.escapeHtml(label) + '</div>' +
            '</div></div>';
    }

    function emptyState(icon, text) {
        return '<div class="eq-empty"><i class="bi ' + icon + '"></i>' + utils.escapeHtml(text) + '</div>';
    }

    function renderNetworkDevice(d) {
        var btns = '';
        if (canEdit()) {
            btns = '<button class="btn btn-outline-success" onclick="editNetwork(' + d.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                   '<button class="btn btn-outline-danger" onclick="deleteNetwork(' + d.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }
        var ipHtml = d.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'net\', ' + d.id + ', \'' + utils.escapeHtml(d.ip_address) + '\')">' + utils.escapeHtml(d.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'net\', ' + d.id + ', \'\')">— не задан —</span>';

        return '<div class="eq-device">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name"><i class="bi bi-hdd-network"></i> ' + utils.escapeHtml(d.device_type) + ': ' + utils.escapeHtml(d.model) + '</div>' +
            '<div class="eq-actions">' + btns + '</div>' +
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

        var btns = '';
        if (canEdit()) {
            btns = '<button class="btn btn-outline-success" onclick="editComputer(' + p.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                   '<button class="btn btn-outline-danger" onclick="deleteComputer(' + p.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }

        var ipHtml = p.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'pc\', ' + p.id + ', \'' + utils.escapeHtml(p.ip_address) + '\')">' + utils.escapeHtml(p.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'pc\', ' + p.id + ', \'\')">— не задан —</span>';

        var ramHtml = '';
        if (p.ram && p.ram.length > 0) {
            ramHtml = '<div class="eq-chips">';
            p.ram.forEach(function(r) { ramHtml += '<span class="eq-chip">' + utils.escapeHtml((r.size || '') + ' ' + (r.type || '')) + '</span>'; });
            ramHtml += '</div>';
        }

        var storageHtml = '';
        if (p.storage && p.storage.length > 0) {
            storageHtml = '<div class="eq-chips">';
            p.storage.forEach(function(s) { storageHtml += '<span class="eq-chip">' + utils.escapeHtml((s.capacity || '') + ' ' + (s.type || '')) + '</span>'; });
            storageHtml += '</div>';
        }

        var softwareHtml = '';
        if (p.software && p.software.length > 0) {
            softwareHtml = '<div class="eq-meta"><i class="bi bi-window-stack"></i> ПО: ' + p.software.length + ' наим.</div>';
        }

        var pingCount = p.ping_count || 0;
        var pingSuccess = p.ping_success_count || 0;
        var pingFail = pingCount - pingSuccess;
        var lastPingAt = p.last_ping_at ? utils.formatDate(p.last_ping_at) : '—';

        var statsHtml = '';
        if (pingCount > 0) {
            statsHtml = '<div class="eq-ping-stats">' +
                '<i class="bi bi-activity"></i> ' +
                '<span title="Всего проверок">' + pingCount + '</span>' +
                ' · <span class="ping-ok" title="Успешных">✓ ' + pingSuccess + '</span>' +
                ' · <span class="ping-fail" title="Неудачных">✗ ' + pingFail + '</span>' +
                '<small class="d-block text-muted">Последняя: ' + lastPingAt + '</small></div>';
        } else {
            statsHtml = '<div class="eq-ping-stats"><i class="bi bi-activity"></i> Проверок ещё не было</div>';
        }

        return '<div class="eq-device" data-pc-id="' + p.id + '">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" onclick="viewComputer(' + p.id + ')">' +
            '<i class="bi bi-pc-display"></i> ' + utils.escapeHtml(p.name || 'Без названия') + '</div>' +
            '<div class="eq-actions">' + btns + '</div></div>' +
            '<div class="eq-meta">' +
            '<span class="eq-status ' + statusCls + '" data-pc-status>' +
            '<i class="bi ' + statusIcon + '"></i> ' + statusText + '</span>' +
            (p.inventory_number ? ' <span class="eq-inv">' + utils.escapeHtml(p.inventory_number) + '</span>' : '') +
            '</div>' +
            (p.motherboard ? '<div class="eq-meta"><i class="bi bi-cpu"></i> ' + utils.escapeHtml(p.motherboard) + (p.motherboard_socket ? ' (' + utils.escapeHtml(p.motherboard_socket) + ')' : '') + '</div>' : '') +
            (p.cpu ? '<div class="eq-meta"><i class="bi bi-cpu-fill"></i> ' + utils.escapeHtml(p.cpu) + '</div>' : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' + ipHtml + '</div>' +
            (ramHtml ? '<div class="eq-meta"><i class="bi bi-memory"></i> ОЗУ: ' + ramHtml + '</div>' : '') +
            (storageHtml ? '<div class="eq-meta"><i class="bi bi-device-hdd"></i> Диски: ' + storageHtml + '</div>' : '') +
            softwareHtml + statsHtml +
            '<div class="eq-meta mt-2">' +
            '<button class="btn btn-sm btn-outline-primary" onclick="pingPc(' + p.id + ', this)" data-ping-btn>' +
            '<i class="bi bi-wifi"></i> Проверить сейчас</button>' +
            '</div></div>';
    }

    function renderPrinter(pr, pcs) {
        var btns = '';
        if (canEdit()) {
            btns = '<button class="btn btn-outline-success" onclick="editPrinter(' + pr.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                   '<button class="btn btn-outline-danger" onclick="deletePrinter(' + pr.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
        }
        var ipHtml = pr.ip_address
            ? '<span class="eq-ip" onclick="editIp(\'pr\', ' + pr.id + ', \'' + utils.escapeHtml(pr.ip_address) + '\')">' + utils.escapeHtml(pr.ip_address) + '</span>'
            : '<span class="eq-ip empty" onclick="editIp(\'pr\', ' + pr.id + ', \'\')">— не задан —</span>';

        var connectHtml = '';
        if (canEdit()) {
            connectHtml = '<div class="eq-meta mt-2">🔗 Подключен к: <select class="eq-connect-select" onchange="connectPrinter(' + pr.id + ', this.value)">' +
                '<option value="">— не подключен —</option>';
            pcs.forEach(function(pc) {
                var sel = (pr.connected_to_pc_id === pc.id) ? ' selected' : '';
                connectHtml += '<option value="' + pc.id + '"' + sel + '>' + utils.escapeHtml(pc.name || 'ПК #' + pc.id) + '</option>';
            });
            connectHtml += '</select></div>';
        } else {
            var connected = pcs.find(function(pc) { return pc.id === pr.connected_to_pc_id; });
            if (connected) connectHtml = '<div class="eq-meta mt-2"><i class="bi bi-link-45deg"></i> Подключен к: <strong>' + utils.escapeHtml(connected.name || 'ПК #' + connected.id) + '</strong></div>';
        }

        return '<div class="eq-device">' +
            '<div class="eq-device-title">' +
            '<div class="eq-device-name clickable" onclick="viewPrinter(' + pr.id + ')">' +
            '<i class="bi bi-printer"></i> ' + utils.escapeHtml(pr.model || 'Принтер') + '</div>' +
            '<div class="eq-actions">' + btns + '</div></div>' +
            (pr.inventory_number ? '<div class="eq-meta"><span class="eq-inv">' + utils.escapeHtml(pr.inventory_number) + '</span></div>' : '') +
            (pr.cartridge ? '<div class="eq-meta"><i class="bi bi-droplet"></i> Картридж: ' + utils.escapeHtml(pr.cartridge) + '</div>' : '') +
            '<div class="eq-meta"><i class="bi bi-globe"></i> IP: ' + ipHtml + '</div>' +
            connectHtml +
            (pr.notes ? '<div class="eq-meta"><i class="bi bi-chat-left-text"></i> ' + utils.escapeHtml(pr.notes) + '</div>' : '') +
            '</div>';
    }

    // ============================================================
    // ЗАГРУЗКА ДОКУМЕНТА
    // ============================================================
    function showUploadDocument() {
        // Список ПО из лицензий кабинета для селекта
        var swOptions = '<option value="">— без привязки к ПО —</option>';
        availableSoftwareCache.forEach(function(a) {
            swOptions += '<option value="' + utils.escapeHtml(a.name) + '">' +
                utils.escapeHtml(a.name) + (a.type ? ' (' + utils.escapeHtml(a.type) + ')' : '') + '</option>';
        });

        Swal.fire({
            title: '<i class="bi bi-upload"></i> Загрузить документ',
            html:
                '<div class="text-start">' +
                '<div class="mb-3">' +
                '<label class="form-label">Программное обеспечение</label>' +
                '<select id="doc-sw" class="form-select">' + swOptions + '</select>' +
                '<small class="text-muted">Можно не привязывать</small>' +
                '</div>' +
                '<div class="mb-3">' +
                '<label class="form-label">Файл</label>' +
                '<input type="file" id="doc-file" class="form-control" ' +
                'accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.zip,.rar,.7z">' +
                '<small class="text-muted">PDF, DOC, XLS, изображения, архивы. Макс. 20 МБ.</small>' +
                '</div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-upload"></i> Загрузить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() {
                var f = document.getElementById('doc-file');
                if (!f.files || !f.files[0]) {
                    Swal.showValidationMessage('Выберите файл');
                    return false;
                }
                return {
                    file: f.files[0],
                    software_name: document.getElementById('doc-sw').value
                };
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;

            var fd = new FormData();
            fd.append('file', result.value.file);
            fd.append('software_name', result.value.software_name);

            Swal.fire({
                title: 'Загрузка...',
                html: 'Загрузка файла <strong>' + utils.escapeHtml(result.value.file.name) + '</strong>',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); }
            });

            fetch('/api/cabinets/' + currentCabinetId + '/documents', {
                method: 'POST',
                body: fd
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        utils.showSuccessMessage('Документ загружен');
                        loadData();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function() {
                    Swal.close();
                    utils.showErrorMessage('Ошибка загрузки');
                });
        });
    }

    function deleteDocument(docId) {
        Swal.fire({
            title: 'Удалить документ?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/documents/' + docId, { method: 'DELETE' })
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
    // IP / PING / ПРИВЯЗКА ПРИНТЕРА
    // ============================================================
    function editIp(type, id, currentIp) {
        if (!canEdit()) { utils.showErrorMessage('Недостаточно прав'); return; }
        Swal.fire({
            title: 'Изменить IP-адрес',
            input: 'text',
            inputValue: currentIp || '',
            inputPlaceholder: '192.168.1.100',
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var newIp = (result.value || '').trim();
            var url, body;
            if (type === 'net') { url = '/api/network/' + id; body = { ip_address: newIp }; }
            else if (type === 'pc') { url = '/api/computers/' + id; body = { ip_address: newIp }; }
            else if (type === 'pr') { url = '/api/printers/' + id; body = { ip_address: newIp }; }
            else return;

            fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('IP сохранён'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    function pingPc(pcId, btn) {
        var $btn = $(btn);
        var oldHtml = $btn.html();
        $btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span> Проверка...');

        fetch('/api/computers/' + pcId + '/ping', { method: 'POST' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                $btn.prop('disabled', false).html(oldHtml);
                if (data.success) {
                    utils.showSuccessMessage(data.message || 'Проверено');
                    var $card = $('.eq-device[data-pc-id="' + pcId + '"]');
                    var $status = $card.find('[data-pc-status]');
                    if (data.status === 'online') {
                        $status.removeClass('offline').addClass('online').html('<i class="bi bi-circle-fill"></i> Онлайн');
                    } else {
                        $status.removeClass('online').addClass('offline').html('<i class="bi bi-circle"></i> Офлайн');
                    }
                    updatePcStats($card, data);
                    if (currentData) {
                        var pc = currentData.computers.find(function(p) { return p.id === pcId; });
                        if (pc) {
                            pc.status = data.status;
                            pc.ping_count = data.ping_count;
                            pc.ping_success_count = data.ping_success_count;
                            pc.last_ping_at = data.last_ping_at;
                        }
                    }
                } else {
                    utils.showErrorMessage(data.error);
                }
            })
            .catch(function() {
                $btn.prop('disabled', false).html(oldHtml);
                utils.showErrorMessage('Ошибка соединения');
            });
    }

    function pingAllInCabinet() {
        Swal.fire({
            title: 'Проверка всех ПК?', icon: 'question',
            showCancelButton: true, confirmButtonText: '<i class="bi bi-wifi"></i> Проверить', cancelButtonText: 'Отмена'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            Swal.fire({ title: 'Проверка...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
            fetch('/api/cabinets/' + currentCabinetId + '/ping-all', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        utils.showSuccessMessage(data.message || 'Проверено');
                        refreshPingStatuses();
                        setTimeout(loadData, 500);
                    } else utils.showErrorMessage(data.error);
                });
        });
    }

    function updatePcStats($card, data) {
        var pingCount = data.ping_count || 0;
        var pingSuccess = data.ping_success_count || 0;
        var pingFail = pingCount - pingSuccess;
        var lastPingAt = data.last_ping_at ? utils.formatDate(data.last_ping_at) : '—';
        var $stats = $card.find('.eq-ping-stats');
        if ($stats.length === 0) {
            $stats = $('<div class="eq-ping-stats"></div>');
            $card.find('.eq-meta').last().after($stats);
        }
        $stats.html(
            '<i class="bi bi-activity"></i> ' +
            '<span title="Всего проверок">' + pingCount + '</span>' +
            ' · <span class="ping-ok" title="Успешных">✓ ' + pingSuccess + '</span>' +
            ' · <span class="ping-fail" title="Неудачных">✗ ' + pingFail + '</span>' +
            '<small class="d-block text-muted">Последняя: ' + lastPingAt + '</small>'
        );
    }

    function connectPrinter(printerId, pcId) {
        fetch('/api/printers/' + printerId + '/connect', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pc_id: pcId || null })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) utils.showSuccessMessage('Привязка обновлена');
                else utils.showErrorMessage(data.error);
            });
    }

    function importPrintersFromCartridges() {
        Swal.fire({
            title: 'Импорт принтеров',
            html: '<div class="text-start">' +
                '<p>Будут добавлены принтеры из модуля <strong>«Картриджи»</strong>.</p>' +
                '<p class="text-muted small">Дубликаты будут пропущены.</p></div>',
            icon: 'question', showCancelButton: true,
            confirmButtonText: '<i class="bi bi-download"></i> Импортировать', cancelButtonText: 'Отмена'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            Swal.fire({ title: 'Импорт...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
            fetch('/api/cabinets/' + currentCabinetId + '/printers/import-from-cartridges', { method: 'POST' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        Swal.fire({
                            icon: data.imported > 0 ? 'success' : 'info',
                            title: data.imported > 0 ? 'Импорт завершён' : 'Нечего импортировать',
                            html: '<div class="text-start"><p><strong>Импортировано:</strong> ' + data.imported + '</p>' +
                                '<p><strong>Пропущено:</strong> ' + data.skipped + '</p></div>',
                            timer: 2500
                        });
                        if (data.imported > 0) loadData();
                    } else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============================================================
    // ПРОСМОТР
    // ============================================================
    function viewComputer(pcId) {
        var p = currentData.computers.find(function(x) { return x.id === pcId; });
        if (!p) return;

        var ramList = (p.ram || []).map(function(r) { return '<li>' + utils.escapeHtml((r.size || '') + ' ' + (r.type || '')) + '</li>'; }).join('') || '<li class="text-muted">не указано</li>';
        var storageList = (p.storage || []).map(function(s) { return '<li>' + utils.escapeHtml((s.capacity || '') + ' ' + (s.type || '')) + '</li>'; }).join('') || '<li class="text-muted">не указано</li>';
        var softwareList = (p.software || []).map(function(s) { return '<li>' + utils.escapeHtml(s) + '</li>'; }).join('') || '<li class="text-muted">не указано</li>';

        var statusBadge = p.status === 'online'
            ? '<span class="eq-status online">Онлайн</span>'
            : '<span class="eq-status offline">Офлайн</span>';

        var pingCount = p.ping_count || 0;
        var pingSuccess = p.ping_success_count || 0;
        var pingFail = pingCount - pingSuccess;

        Swal.fire({
            title: '<i class="bi bi-pc-display"></i> ' + utils.escapeHtml(p.name || 'ПК'),
            html: '<div class="text-start">' +
                '<p><strong>Инв. номер:</strong> ' + utils.escapeHtml(p.inventory_number || '—') + '</p>' +
                '<p><strong>Статус:</strong> ' + statusBadge + '</p>' +
                (pingCount > 0 ? '<p><strong>Проверок:</strong> ' + pingCount + ' (✓ ' + pingSuccess + ' / ✗ ' + pingFail + ')</p>' : '') +
                '<hr>' +
                '<p><strong>Материнская плата:</strong> ' + utils.escapeHtml(p.motherboard || '—') + (p.motherboard_socket ? ' (' + utils.escapeHtml(p.motherboard_socket) + ')' : '') + '</p>' +
                '<p><strong>Процессор:</strong> ' + utils.escapeHtml(p.cpu || '—') + '</p>' +
                '<p><strong>IP-адрес:</strong> ' + utils.escapeHtml(p.ip_address || '—') + '</p>' +
                '<p><strong>ОЗУ:</strong></p><ul>' + ramList + '</ul>' +
                '<p><strong>Диски:</strong></p><ul>' + storageList + '</ul>' +
                '<p><strong>Установленное ПО:</strong></p><ul>' + softwareList + '</ul>' +
                (p.notes ? '<p><strong>Примечание:</strong> ' + utils.escapeHtml(p.notes) + '</p>' : '') +
                '</div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: canEdit(),
            cancelButtonText: '<i class="bi bi-pencil"></i> Редактировать',
            cancelButtonColor: '#28a745',
            customClass: { popup: 'swal-wide' }
        }).then(function(r) {
            if (r.dismiss === Swal.DismissReason.cancel && canEdit()) editComputer(pcId);
        });
    }

    function viewPrinter(prId) {
        var pr = currentData.printers.find(function(x) { return x.id === prId; });
        if (!pr) return;
        var connectedPc = currentData.computers.find(function(pc) { return pc.id === pr.connected_to_pc_id; });
        Swal.fire({
            title: '<i class="bi bi-printer"></i> ' + utils.escapeHtml(pr.model || 'Принтер'),
            html: '<div class="text-start">' +
                '<p><strong>Инв. номер:</strong> ' + utils.escapeHtml(pr.inventory_number || '—') + '</p>' +
                '<p><strong>Картридж:</strong> ' + utils.escapeHtml(pr.cartridge || '—') + '</p>' +
                '<p><strong>IP-адрес:</strong> ' + utils.escapeHtml(pr.ip_address || '—') + '</p>' +
                '<p><strong>Подключен к:</strong> ' + (connectedPc ? utils.escapeHtml(connectedPc.name) : '— не подключен —') + '</p>' +
                (pr.notes ? '<p><strong>Примечание:</strong> ' + utils.escapeHtml(pr.notes) + '</p>' : '') +
                '</div>',
            confirmButtonText: 'Закрыть',
            showCancelButton: canEdit(),
            cancelButtonText: '<i class="bi bi-pencil"></i> Редактировать',
            cancelButtonColor: '#28a745'
        }).then(function(r) {
            if (r.dismiss === Swal.DismissReason.cancel && canEdit()) editPrinter(prId);
        });
    }

    // ============================================================
    // СЕТЬ
    // ============================================================
    function showAddNetwork() { editNetwork(null); }

    function editNetwork(deviceId) {
        var d = deviceId ? currentData.network_devices.find(function(x) { return x.id === deviceId; }) : {};
        d = d || {};
        Swal.fire({
            title: deviceId ? 'Редактировать устройство' : 'Добавить сетевое устройство',
            html: '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Тип *</label>' +
                '<select id="eq-net-type" class="form-select">' +
                ['Свитч','Маршрутизатор','Коммутатор','Точка доступа','Модем','Прочее'].map(function(t) {
                    return '<option value="' + t + '"' + (t === d.device_type ? ' selected' : '') + '>' + t + '</option>';
                }).join('') + '</select></div>' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-net-model" class="form-control" value="' + utils.escapeHtml(d.model || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-net-inv" class="form-control" value="' + utils.escapeHtml(d.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-net-ip" class="form-control" value="' + utils.escapeHtml(d.ip_address || '') + '" placeholder="192.168.1.1"></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-net-notes" class="form-control" rows="2">' + utils.escapeHtml(d.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true, confirmButtonText: 'Сохранить', cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
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
            fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.value) })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Сохранено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    function deleteNetwork(id) {
        Swal.fire({ title: 'Удалить устройство?', icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/network/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Удалено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============================================================
    // ПК
    // ============================================================
    function showAddComputer() { editComputer(null); }

    function editComputer(pcId) {
        var p = pcId ? currentData.computers.find(function(x) { return x.id === pcId; }) : {};
        p = p || {};

        var ram = (p.ram && p.ram.length > 0) ? p.ram : [{ size: '', type: 'DDR4' }];
        var storage = (p.storage && p.storage.length > 0) ? p.storage : [{ capacity: '', type: 'SSD' }];
        var software = (p.software || []).slice();
        var available = availableSoftwareCache || [];

        function ramRows() {
            return ram.map(function(r) {
                var numVal = (r.size || '').replace(/\s*(GB|TB|MB)\s*$/i, '');
                return '<div class="eq-ram-row">' +
                    '<input class="form-control form-control-sm eq-ram-size" value="' + utils.escapeHtml(numVal) + '" placeholder="8" type="number" min="1" max="999">' +
                    '<span class="eq-unit-label">GB</span>' +
                    '<select class="form-select form-select-sm eq-ram-type">' +
                    ['DDR3','DDR4','DDR5','LPDDR4','LPDDR5'].map(function(t) {
                        return '<option value="' + t + '"' + (t === r.type ? ' selected' : '') + '>' + t + '</option>';
                    }).join('') +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>' +
                    '</div>';
            }).join('');
        }

        function storageRows() {
            return storage.map(function(s) {
                var val = (s.capacity || '').trim();
                var suffix = 'GB';
                if (/\s*TB/i.test(val)) { suffix = 'TB'; val = val.replace(/\s*TB/i, ''); }
                else { val = val.replace(/\s*GB/i, ''); }
                return '<div class="eq-storage-row">' +
                    '<input class="form-control form-control-sm eq-storage-cap" value="' + utils.escapeHtml(val) + '" placeholder="512" type="number" min="1" max="9999">' +
                    '<select class="form-select form-select-sm eq-storage-unit" style="max-width:80px">' +
                    '<option value="GB"' + (suffix === 'GB' ? ' selected' : '') + '>GB</option>' +
                    '<option value="TB"' + (suffix === 'TB' ? ' selected' : '') + '>TB</option></select>' +
                    '<select class="form-select form-select-sm eq-storage-type">' +
                    ['SSD','HDD','NVMe','SSD M.2','eMMC'].map(function(t) {
                        return '<option value="' + t + '"' + (t === s.type ? ' selected' : '') + '>' + t + '</option>';
                    }).join('') +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>' +
                    '</div>';
            }).join('');
        }

        function selectedSoftwareList() {
            if (software.length === 0) return '<div class="text-muted small p-2">— ничего не выбрано —</div>';
            return software.map(function(s, i) {
                return '<div class="d-flex justify-content-between align-items-center mb-1 eq-software-item">' +
                    '<span><i class="bi bi-window"></i> ' + utils.escapeHtml(s) + '</span>' +
                    '<button type="button" class="btn btn-sm btn-outline-danger" onclick="removeSoftwareAt(' + i + ')"><i class="bi bi-x"></i></button></div>';
            }).join('');
        }

        function availableSoftwareList() {
            if (available.length === 0) return '<div class="text-muted small p-2">В лицензиях кабинета нет ПО.</div>';
            return available.map(function(a) {
                var checked = (software.indexOf(a.name) !== -1) ? ' checked' : '';
                return '<label class="eq-software-check">' +
                    '<input type="checkbox" ' + checked +
                    ' onchange="toggleSoftwareCheckbox(\'' + utils.escapeHtml(a.name).replace(/'/g, "\\'") + '\', this.checked)">' +
                    '<span>' + utils.escapeHtml(a.name) + (a.type ? ' <small class="text-muted">(' + utils.escapeHtml(a.type) + ')</small>' : '') + '</span></label>';
            }).join('');
        }

        Swal.fire({
            title: pcId ? 'Редактировать ПК' : 'Добавить компьютер',
            width: 780,
            html:
                '<div class="text-start"><div class="row g-2">' +
                '<div class="col-md-6"><label class="form-label">Название *</label>' +
                '<input id="eq-pc-name" class="form-control" value="' + utils.escapeHtml(p.name || '') + '"></div>' +
                '<div class="col-md-6"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pc-inv" class="form-control" value="' + utils.escapeHtml(p.inventory_number || '') + '"></div>' +
                '<div class="col-md-6"><label class="form-label">Материнская плата</label>' +
                '<input id="eq-pc-mb" class="form-control" value="' + utils.escapeHtml(p.motherboard || '') + '"></div>' +
                '<div class="col-md-6"><label class="form-label">Сокет материнской платы</label>' +
                '<input id="eq-pc-socket" class="form-control" value="' + utils.escapeHtml(p.motherboard_socket || '') + '" list="socket-list">' +
                '<datalist id="socket-list"><option value="LGA1151"><option value="LGA1200"><option value="LGA1700"><option value="AM4"><option value="AM5"></datalist></div>' +
                '<div class="col-md-6"><label class="form-label">Процессор</label>' +
                '<input id="eq-pc-cpu" class="form-control" value="' + utils.escapeHtml(p.cpu || '') + '"></div>' +
                '<div class="col-md-6"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-pc-ip" class="form-control" value="' + utils.escapeHtml(p.ip_address || '') + '"></div>' +
                '<div class="col-12 mt-2"><label class="form-label">ОЗУ <small class="text-muted">(в GB)</small></label>' +
                '<div id="eq-ram-container">' + ramRows() + '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-1" onclick="addRamRow()"><i class="bi bi-plus"></i> Добавить планку</button></div>' +
                '<div class="col-12 mt-2"><label class="form-label">Диски</label>' +
                '<div id="eq-storage-container">' + storageRows() + '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary w-100 mt-1" onclick="addStorageRow()"><i class="bi bi-plus"></i> Добавить диск</button></div>' +
                '<div class="col-12 mt-3"><label class="form-label"><i class="bi bi-window-stack"></i> Установленное ПО</label>' +
                '<div id="eq-software-selected" class="border rounded p-2 mb-2" style="max-height:120px;overflow-y:auto;background:var(--hover-bg)">' +
                selectedSoftwareList() + '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-primary w-100 mb-2" onclick="toggleAvailableSoftware()">' +
                '<i class="bi bi-list-check"></i> <span id="eq-toggle-soft-label">Показать доступные ПО</span></button>' +
                '<div id="eq-software-available" class="border rounded p-2 mb-2" style="display:none;max-height:180px;overflow-y:auto">' +
                availableSoftwareList() + '</div>' +
                '<div class="input-group input-group-sm">' +
                '<input id="eq-manual-soft" class="form-control" placeholder="Или введите название вручную">' +
                '<button type="button" class="btn btn-outline-primary" onclick="addManualSoftware()"><i class="bi bi-plus"></i> Добавить</button></div>' +
                '</div>' +
                '<div class="col-12 mt-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-pc-notes" class="form-control" rows="2">' + utils.escapeHtml(p.notes || '') + '</textarea></div>' +
                '</div></div>',
            showCancelButton: true, confirmButtonText: 'Сохранить', cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            didOpen: function() {
                window.addRamRow = function() {
                    var c = document.getElementById('eq-ram-container');
                    var div = document.createElement('div');
                    div.className = 'eq-ram-row';
                    div.innerHTML = '<input class="form-control form-control-sm eq-ram-size" placeholder="8" type="number" min="1" max="999">' +
                        '<span class="eq-unit-label">GB</span>' +
                        '<select class="form-select form-select-sm eq-ram-type"><option>DDR3</option><option selected>DDR4</option><option>DDR5</option></select>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };
                window.addStorageRow = function() {
                    var c = document.getElementById('eq-storage-container');
                    var div = document.createElement('div');
                    div.className = 'eq-storage-row';
                    div.innerHTML = '<input class="form-control form-control-sm eq-storage-cap" placeholder="512" type="number" min="1" max="9999">' +
                        '<select class="form-select form-select-sm eq-storage-unit" style="max-width:80px">' +
                        '<option value="GB" selected>GB</option><option value="TB">TB</option></select>' +
                        '<select class="form-select form-select-sm eq-storage-type"><option selected>SSD</option><option>HDD</option><option>NVMe</option></select>' +
                        '<button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentNode.remove()"><i class="bi bi-x"></i></button>';
                    c.appendChild(div);
                };

                function refreshSelectedSoftware() {
                    var cont = document.getElementById('eq-software-selected');
                    if (cont) cont.innerHTML = selectedSoftwareList();
                }

                window.removeSoftwareAt = function(idx) {
                    software.splice(idx, 1);
                    refreshSelectedSoftware();
                    refreshAvailableCheckboxes();
                };

                window.toggleAvailableSoftware = function() {
                    var block = document.getElementById('eq-software-available');
                    var label = document.getElementById('eq-toggle-soft-label');
                    if (!block) return;
                    if (block.style.display === 'none') { block.style.display = 'block'; if (label) label.textContent = 'Скрыть доступные ПО'; }
                    else { block.style.display = 'none'; if (label) label.textContent = 'Показать доступные ПО'; }
                };

                window.toggleSoftwareCheckbox = function(name, checked) {
                    var idx = software.indexOf(name);
                    if (checked && idx === -1) software.push(name);
                    else if (!checked && idx !== -1) software.splice(idx, 1);
                    refreshSelectedSoftware();
                };

                function refreshAvailableCheckboxes() {
                    var list = document.getElementById('eq-software-available');
                    if (!list) return;
                    var checkboxes = list.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(function(cb) {
                        var m = cb.getAttribute('onchange').match(/'([^']+)'/);
                        if (m) {
                            var n = m[1].replace(/\\'/g, "'");
                            cb.checked = (software.indexOf(n) !== -1);
                        }
                    });
                }

                window.addManualSoftware = function() {
                    var input = document.getElementById('eq-manual-soft');
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
                var name = document.getElementById('eq-pc-name').value.trim();
                if (!name) { Swal.showValidationMessage('Введите название ПК'); return false; }

                var ramArr = [];
                document.querySelectorAll('#eq-ram-container .eq-ram-row').forEach(function(row) {
                    var val = row.querySelector('.eq-ram-size').value.trim();
                    var type = row.querySelector('.eq-ram-type').value;
                    if (val) ramArr.push({ size: val + ' GB', type: type });
                });

                var storageArr = [];
                document.querySelectorAll('#eq-storage-container .eq-storage-row').forEach(function(row) {
                    var cap = row.querySelector('.eq-storage-cap').value.trim();
                    var unitEl = row.querySelector('.eq-storage-unit');
                    var unit = unitEl ? unitEl.value : 'GB';
                    var type = row.querySelector('.eq-storage-type').value;
                    if (cap) storageArr.push({ capacity: cap + ' ' + unit, type: type });
                });

                return {
                    name: name,
                    motherboard: document.getElementById('eq-pc-mb').value.trim(),
                    motherboard_socket: document.getElementById('eq-pc-socket').value.trim(),
                    cpu: document.getElementById('eq-pc-cpu').value.trim(),
                    inventory_number: document.getElementById('eq-pc-inv').value.trim(),
                    ip_address: document.getElementById('eq-pc-ip').value.trim(),
                    ram: ramArr,
                    storage: storageArr,
                    software: software.slice(),
                    notes: document.getElementById('eq-pc-notes').value.trim()
                };
            }
        }).then(function(r) {
            if (!r.isConfirmed) return;
            var url = pcId ? '/api/computers/' + pcId : '/api/cabinets/' + currentCabinetId + '/computers';
            var method = pcId ? 'PUT' : 'POST';
            fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.value) })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Сохранено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    function deleteComputer(id) {
        Swal.fire({ title: 'Удалить ПК?', text: 'Привязанные принтеры будут отключены',
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена', confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/computers/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Удалено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============================================================
    // ПРИНТЕРЫ
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
            html: '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="eq-pr-model" class="form-control" value="' + utils.escapeHtml(pr.model || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Картридж</label>' +
                '<input id="eq-pr-cart" class="form-control" value="' + utils.escapeHtml(pr.cartridge || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Инвентарный номер</label>' +
                '<input id="eq-pr-inv" class="form-control" value="' + utils.escapeHtml(pr.inventory_number || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">IP-адрес</label>' +
                '<input id="eq-pr-ip" class="form-control" value="' + utils.escapeHtml(pr.ip_address || '') + '"></div>' +
                '<div class="mb-2"><label class="form-label">Подключен к ПК</label>' +
                '<select id="eq-pr-pc" class="form-select"><option value="">— не подключен —</option>' + pcOptions + '</select></div>' +
                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="eq-pr-notes" class="form-control" rows="2">' + utils.escapeHtml(pr.notes || '') + '</textarea></div>' +
                '</div>',
            showCancelButton: true, confirmButtonText: 'Сохранить', cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
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
            fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.value) })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Сохранено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    function deletePrinter(id) {
        Swal.fire({ title: 'Удалить принтер?', icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Удалить', cancelButtonText: 'Отмена', confirmButtonColor: '#dc3545'
        }).then(function(r) {
            if (!r.isConfirmed) return;
            fetch('/api/printers/' + id, { method: 'DELETE' })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    if (data.success) { utils.showSuccessMessage('Удалено'); loadData(); }
                    else utils.showErrorMessage(data.error);
                });
        });
    }

    // ============================================================
    // ПЕЧАТЬ КАРТОЧКИ КАБИНЕТА
    // ============================================================
    function printCabinet() {
        if (!currentCabinetId) return;

        Swal.fire({
            title: 'Подготовка к печати...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); }
        });

        fetch('/api/cabinets/' + currentCabinetId + '/print-data')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                Swal.close();
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }
                openPrintWindow(data);
            })
            .catch(function(err) {
                Swal.close();
                console.error('[cabinet_details] print error:', err);
                utils.showErrorMessage('Ошибка подготовки к печати');
            });
    }

    function escapeForPrint(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function openPrintWindow(data) {
        var cab = data.cabinet || {};
        var pcs = data.computers || [];
        var licenses = data.licenses || [];
        var printers = data.printers || [];
        var network = data.network || [];
        var documents = data.documents || [];
        var printDate = data.print_date || '';

        var w = window.open('', '_blank', 'width=1000,height=800');

        if (!w) {
            utils.showErrorMessage('Разрешите всплывающие окна для печати');
            return;
        }

        var html = '<!DOCTYPE html><html lang="ru"><head>';
        html += '<meta charset="UTF-8"><title>Карточка кабинета ' + escapeForPrint(cab.cabinet_number) + '</title>';
        html += '<style>';
        html += '* { margin: 0; padding: 0; box-sizing: border-box; }';
        html += 'body { font-family: "Times New Roman", Times, serif; font-size: 12pt; padding: 20px 30px; color: #000; background: #fff; }';
        html += 'h1 { font-size: 18pt; text-align: center; margin-bottom: 6px; }';
        html += 'h2 { font-size: 14pt; margin: 20px 0 10px; border-bottom: 2px solid #000; padding-bottom: 4px; }';
        html += 'h3 { font-size: 12pt; margin: 12px 0 6px; }';
        html += '.header-info { text-align: center; margin-bottom: 20px; font-size: 10pt; color: #555; }';
        html += '.meta-block { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px; margin-bottom: 20px; padding: 10px 15px; border: 1px solid #999; background: #f9f9f9; }';
        html += '.meta-item { min-width: 180px; }';
        html += '.meta-item strong { display: block; font-size: 9pt; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }';
        html += '.meta-item span { font-size: 12pt; }';
        html += 'table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt; }';
        html += 'th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: top; }';
        html += 'th { background: #e8e8e8; font-weight: bold; }';
        html += 'tr:nth-child(even) td { background: #fafafa; }';
        html += '.small { font-size: 9pt; color: #555; }';
        html += '.chips { display: flex; flex-wrap: wrap; gap: 4px; }';
        html += '.chip { display: inline-block; padding: 1px 6px; background: #eee; border-radius: 3px; font-size: 9pt; }';
        html += '.footer { margin-top: 30px; text-align: center; font-size: 9pt; color: #666; border-top: 1px dashed #999; padding-top: 10px; }';
        html += '.no-data { text-align: center; color: #888; font-style: italic; padding: 15px; font-size: 10pt; }';
        html += '.print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 14pt; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.2); }';
        html += '@media print {';
        html += '  body { padding: 0; font-size: 11pt; }';
        html += '  .print-btn { display: none !important; }';
        html += '  h2 { page-break-after: avoid; }';
        html += '  table { page-break-inside: auto; }';
        html += '  tr { page-break-inside: avoid; }';
        html += '}';
        html += '</style></head><body>';

        html += '<button class="print-btn" onclick="window.print()">🖨️ Печать</button>';

        // Заголовок
        html += '<h1>Карточка кабинета ' + escapeForPrint(cab.cabinet_number) + '</h1>';
        html += '<div class="header-info">';
        html += 'Сформировано: ' + escapeForPrint(printDate);
        html += '</div>';

        // Инфо о кабинете
        html += '<div class="meta-block">';
        if (cab.floor) html += '<div class="meta-item"><strong>Этаж</strong><span>' + escapeForPrint(cab.floor) + '</span></div>';
        if (cab.building) html += '<div class="meta-item"><strong>Корпус</strong><span>' + escapeForPrint(cab.building) + '</span></div>';
        if (cab.description) html += '<div class="meta-item"><strong>Назначение</strong><span>' + escapeForPrint(cab.description) + '</span></div>';
        if (cab.responsible_person) html += '<div class="meta-item"><strong>Ответственный</strong><span>' + escapeForPrint(cab.responsible_person) + '</span></div>';
        if (cab.phone) html += '<div class="meta-item"><strong>Телефон</strong><span>' + escapeForPrint(cab.phone) + '</span></div>';
        html += '</div>';

        // Сводка
        html += '<h2>Сводка</h2>';
        html += '<table>';
        html += '<tr><th style="width:60%">Показатель</th><th>Количество</th></tr>';
        html += '<tr><td>Компьютеров</td><td><strong>' + pcs.length + '</strong></td></tr>';
        html += '<tr><td>Принтеров</td><td><strong>' + printers.length + '</strong></td></tr>';
        html += '<tr><td>Сетевых устройств</td><td><strong>' + network.length + '</strong></td></tr>';
        html += '<tr><td>Наименований ПО (лицензий)</td><td><strong>' + licenses.length + '</strong></td></tr>';
        html += '<tr><td>Документов ПО</td><td><strong>' + documents.length + '</strong></td></tr>';
        html += '</table>';

        // Компьютеры
        html += '<h2>Компьютеры (' + pcs.length + ')</h2>';
        if (pcs.length === 0) {
            html += '<div class="no-data">Нет компьютеров</div>';
        } else {
            pcs.forEach(function(p, idx) {
                html += '<h3>' + (idx + 1) + '. ' + escapeForPrint(p.name || 'Без названия') + '</h3>';
                html += '<table>';
                html += '<tr><th style="width:30%">Параметр</th><th>Значение</th></tr>';
                if (p.inventory_number) html += '<tr><td>Инв. номер</td><td>' + escapeForPrint(p.inventory_number) + '</td></tr>';
                if (p.ip_address) html += '<tr><td>IP-адрес</td><td>' + escapeForPrint(p.ip_address) + '</td></tr>';
                if (p.motherboard) {
                    var mb = escapeForPrint(p.motherboard);
                    if (p.motherboard_socket) mb += ' (сокет: ' + escapeForPrint(p.motherboard_socket) + ')';
                    html += '<tr><td>Материнская плата</td><td>' + mb + '</td></tr>';
                }
                if (p.cpu) html += '<tr><td>Процессор</td><td>' + escapeForPrint(p.cpu) + '</td></tr>';
                if (p.ram && p.ram.length > 0) {
                    var ramText = p.ram.map(function(r) { return escapeForPrint((r.size || '') + ' ' + (r.type || '')); }).join(', ');
                    html += '<tr><td>ОЗУ</td><td>' + ramText + '</td></tr>';
                }
                if (p.storage && p.storage.length > 0) {
                    var stText = p.storage.map(function(s) { return escapeForPrint((s.capacity || '') + ' ' + (s.type || '')); }).join(', ');
                    html += '<tr><td>Диски</td><td>' + stText + '</td></tr>';
                }
                if (p.software && p.software.length > 0) {
                    var swList = p.software.map(function(s) { return escapeForPrint(s); }).join('<br>');
                    html += '<tr><td>Установленное ПО</td><td>' + swList + '</td></tr>';
                }
                if (p.notes) html += '<tr><td>Примечание</td><td>' + escapeForPrint(p.notes) + '</td></tr>';
                html += '</table>';
            });
        }

        // ПО и лицензии
        html += '<h2>Программное обеспечение и лицензии (' + licenses.length + ')</h2>';
        if (licenses.length === 0) {
            html += '<div class="no-data">Нет данных о ПО</div>';
        } else {
            html += '<table>';
            html += '<tr><th style="width:50%">Наименование ПО</th><th style="width:30%">Тип лицензии</th><th>Примечание</th></tr>';
            licenses.forEach(function(l) {
                html += '<tr>' +
                    '<td>' + escapeForPrint(l.software_name || '—') + '</td>' +
                    '<td>' + escapeForPrint(l.license_type || '—') + '</td>' +
                    '<td>' + escapeForPrint(l.notes || '—') + '</td>' +
                    '</tr>';
            });
            html += '</table>';
        }

        // Принтеры
        if (printers.length > 0) {
            html += '<h2>Принтеры (' + printers.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>Модель</th><th>Картридж</th><th>Инв. номер</th><th>IP-адрес</th></tr>';
            printers.forEach(function(pr) {
                html += '<tr>' +
                    '<td>' + escapeForPrint(pr.model || '—') + '</td>' +
                    '<td>' + escapeForPrint(pr.cartridge || '—') + '</td>' +
                    '<td>' + escapeForPrint(pr.inventory_number || '—') + '</td>' +
                    '<td>' + escapeForPrint(pr.ip_address || '—') + '</td>' +
                    '</tr>';
            });
            html += '</table>';
        }

        // Сетевое оборудование
        if (network.length > 0) {
            html += '<h2>Сетевое оборудование (' + network.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>Тип</th><th>Модель</th><th>Инв. номер</th><th>IP-адрес</th></tr>';
            network.forEach(function(n) {
                html += '<tr>' +
                    '<td>' + escapeForPrint(n.device_type || '—') + '</td>' +
                    '<td>' + escapeForPrint(n.model || '—') + '</td>' +
                    '<td>' + escapeForPrint(n.inventory_number || '—') + '</td>' +
                    '<td>' + escapeForPrint(n.ip_address || '—') + '</td>' +
                    '</tr>';
            });
            html += '</table>';
        }

        // Документы ПО
        if (documents.length > 0) {
            html += '<h2>Документы ПО (' + documents.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>ПО</th><th>Файл</th><th>Загружено</th></tr>';
            documents.forEach(function(d) {
                html += '<tr>' +
                    '<td>' + escapeForPrint(d.software_name || '—') + '</td>' +
                    '<td>' + escapeForPrint(d.original_name || '—') + '</td>' +
                    '<td>' + escapeForPrint(d.uploaded_at ? utils.formatDate(d.uploaded_at) : '—') + '</td>' +
                    '</tr>';
            });
            html += '</table>';
        }

        // Подвал
        html += '<div class="footer">';
        html += 'Support Active — Система управления заявками';
        html += '</div>';

        html += '</body></html>';

        w.document.open();
        w.document.write(html);
        w.document.close();

        setTimeout(function() {
            try { w.focus(); } catch (e) {}
        }, 200);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.open = open;
    api.reload = loadData;
    api.stopAutoRefresh = stopAutoRefresh;
    api.refreshPingStatuses = refreshPingStatuses;
    api.print = printCabinet;

    window.openCabinetDetails = open;
    window.showAddNetwork = showAddNetwork;
    window.editNetwork = editNetwork;
    window.deleteNetwork = deleteNetwork;
    window.showAddComputer = showAddComputer;
    window.editComputer = editComputer;
    window.deleteComputer = deleteComputer;
    window.viewComputer = viewComputer;
    window.pingPc = pingPc;
    window.pingAllInCabinet = pingAllInCabinet;
    window.showAddPrinter = showAddPrinter;
    window.editPrinter = editPrinter;
    window.deletePrinter = deletePrinter;
    window.viewPrinter = viewPrinter;
    window.connectPrinter = connectPrinter;
    window.editIp = editIp;
    window.importPrintersFromCartridges = importPrintersFromCartridges;
    window.showUploadDocument = showUploadDocument;
    window.deleteDocument = deleteDocument;
    window.printCabinet = printCabinet;

    $(window).on('beforeunload', function() { stopAutoRefresh(); });

    console.log('[cabinet_details] Загружено (v5, документы + печать)');
})();