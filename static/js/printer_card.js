// static/js/printer_card.js
// Карточка принтера: рендер в Swal + замена принтера / картриджа + драйверы.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[printer_card] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    var mod = window.App.register('PrinterCard');

    // Кеш списка картриджей — чтобы не дёргать API на каждое открытие карточки
    var cartridgesCache = null;
    var cartridgesCacheTs = 0;
    var CARTRIDGES_CACHE_TTL = 30000; // 30 сек

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    function formatDate(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso.replace(' ', 'T'));
            if (isNaN(d.getTime())) return iso;
            var day = String(d.getDate()).padStart(2, '0');
            var month = String(d.getMonth() + 1).padStart(2, '0');
            var year = d.getFullYear();
            var hh = String(d.getHours()).padStart(2, '0');
            var mm = String(d.getMinutes()).padStart(2, '0');
            return day + '.' + month + '.' + year + ' ' + hh + ':' + mm;
        } catch (e) { return iso; }
    }

    function connLabel(type) {
        return type === 'usb' ? 'USB' : 'Сетевой';
    }

    function connBadgeClass(type) {
        return type === 'usb' ? 'pc-badge-usb' : 'pc-badge-network';
    }

    function fileIcon(filename) {
        var ext = (filename || '').split('.').pop().toLowerCase();
        if (['pdf'].indexOf(ext) !== -1) return 'bi-file-earmark-pdf';
        if (['zip', 'rar', '7z', 'tar', 'gz'].indexOf(ext) !== -1) {
            return 'bi-file-earmark-zip';
        }
        if (['exe', 'msi'].indexOf(ext) !== -1) {
            return 'bi-file-earmark-binary';
        }
        if (['doc', 'docx'].indexOf(ext) !== -1) {
            return 'bi-file-earmark-word';
        }
        if (['txt', 'inf', 'md'].indexOf(ext) !== -1) {
            return 'bi-file-earmark-text';
        }
        return 'bi-file-earmark';
    }

    function pickLatest(a, b) {
        if (!a) return b;
        if (!b) return a;
        return a > b ? a : b;
    }

    function canEdit() {
        if (window.App.Cabinet && typeof window.App.Cabinet.canEdit === 'function') {
            return window.App.Cabinet.canEdit();
        }
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Техник';
    }

    // ============================================================
    // КАРТРИДЖИ — кешированный список
    // ============================================================
    function getCartridgesList() {
        var now = Date.now();
        if (cartridgesCache && (now - cartridgesCacheTs) < CARTRIDGES_CACHE_TTL) {
            return Promise.resolve(cartridgesCache);
        }
        return api.get('/api/cartridges')
            .then(function(list) {
                cartridgesCache = Array.isArray(list) ? list : [];
                cartridgesCacheTs = Date.now();
                return cartridgesCache;
            })
            .catch(function() {
                return cartridgesCache || [];
            });
    }

    // ============================================================
    // ПОСЛЕДНЯЯ ЗАМЕНА КАРТРИДЖА (из модуля «Картриджи»)
    // ============================================================
    function loadLastCartridgeDate(printer, cabinet) {
        if (!cabinet || !cabinet.cabinet_number) return Promise.resolve(null);

        var cabNum = String(cabinet.cabinet_number).trim().toLowerCase();
        var printerModel = String(printer.model || '').trim().toLowerCase();
        if (!printerModel) return Promise.resolve(null);

        var cartridgeModel = String(printer.cartridge || '').trim().toLowerCase();

        return getCartridgesList().then(function(list) {
            // 1. Точное совпадение: кабинет + принтер + картридж
            var matches = list.filter(function(c) {
                var cabOk = String(c.cabinet || '').trim().toLowerCase() === cabNum;
                var prOk = String(c.printer || '').trim().toLowerCase() === printerModel;
                if (!cabOk || !prOk) return false;
                if (cartridgeModel) {
                    return String(c.cartridge || '').trim().toLowerCase() === cartridgeModel;
                }
                return true;
            });

            // 2. Фолбэк: только кабинет + принтер
            if (matches.length === 0) {
                matches = list.filter(function(c) {
                    return String(c.cabinet || '').trim().toLowerCase() === cabNum
                        && String(c.printer || '').trim().toLowerCase() === printerModel;
                });
            }

            if (matches.length === 0) return null;

            var dates = matches
                .map(function(c) { return c.latest_date; })
                .filter(Boolean)
                .sort();

            return dates.length ? dates[dates.length - 1] : null;
        });
    }

    // ============================================================
    // РЕНДЕР КАРТОЧКИ
    // ============================================================
    function buildCardHtml(printer, cabinet) {
        var model = printer.model || 'Принтер';
        var cartridge = printer.cartridge || '';
        var inventory = printer.inventory_number || '';
        var cabinetNum = cabinet ? (cabinet.cabinet_number || '') : '';
        var cabinetDesc = cabinet ? (cabinet.description || '') : '';
        var ipAddress = printer.ip_address || '';
        var connType = printer.connection_type || 'network';

        var lastPrinter = printer.last_printer_replaced_at;
        var lastCartridge = printer.last_cartridge_replaced_at;

        var cabinetStr = cabinetNum;
        if (cabinetDesc) {
            cabinetStr += cabinetNum ? ' / ' + cabinetDesc : cabinetDesc;
        }

        var html = '<div class="pc-card">';

        // Изображение / иконка
        html += '<div class="pc-image">';
        html += '<div class="pc-badge ' + connBadgeClass(connType) + '">' +
                connLabel(connType) + '</div>';
        html += '<div class="pc-image-wrapper">' +
                '<i class="bi bi-printer"></i>' +
                '</div>';
        html += '</div>';

        // Контент
        html += '<div class="pc-content">';
        html += '<h4 class="pc-title">' + utils.escapeHtml(model) + '</h4>';

        // Картридж
        html += '<div class="pc-info-row">' +
                '<div class="pc-info-label">Картридж</div>' +
                '<div class="pc-info-value">' +
                (cartridge
                    ? utils.escapeHtml(cartridge)
                    : '<span class="text-muted">— не указан —</span>') +
                '</div></div>';

        // Кабинет
        html += '<div class="pc-info-row">' +
                '<div class="pc-info-label">Кабинет</div>' +
                '<div class="pc-info-value">' +
                (cabinetStr
                    ? utils.escapeHtml(cabinetStr)
                    : '<span class="text-muted">— не указан —</span>') +
                '</div></div>';

        // Инв. номер
        html += '<div class="pc-info-row">' +
                '<div class="pc-info-label">Инвентарный номер</div>' +
                '<div class="pc-info-value">' +
                (inventory
                    ? '<span class="pc-inv">' +
                      utils.escapeHtml(inventory) + '</span>'
                    : '<span class="text-muted">— не указан —</span>') +
                '</div></div>';

        // Подключение
        if (connType === 'usb') {
            var connectedPcId = printer.connected_to_pc_id;
            var connectedPcName = '';
            if (connectedPcId && window.App.Cabinet &&
                window.App.Cabinet.data &&
                window.App.Cabinet.data.computers) {
                var pc = window.App.Cabinet.data.computers.find(function(p) {
                    return p.id === connectedPcId;
                });
                if (pc) {
                    connectedPcName = pc.name || ('ПК #' + pc.id);
                }
            }
            html += '<div class="pc-info-row">' +
                    '<div class="pc-info-label">Подключён к ПК</div>' +
                    '<div class="pc-info-value">' +
                    (connectedPcName
                        ? utils.escapeHtml(connectedPcName)
                        : '<span class="text-muted">— не подключён —</span>') +
                    '</div></div>';
        } else {
            html += '<div class="pc-info-row">' +
                    '<div class="pc-info-label">IP-адрес</div>' +
                    '<div class="pc-info-value">' +
                    (ipAddress
                        ? '<code>' + utils.escapeHtml(ipAddress) + '</code>'
                        : '<span class="text-muted">— не указан —</span>') +
                    '</div></div>';
        }

        // Даты — со стабильными id, чтобы можно было обновить дату картриджа асинхронно
        html += '<div class="pc-dates">';
        html += '<div class="pc-date-badge">' +
                '<span class="pc-date-label">🔄 Принтер:</span>' +
                '<span class="pc-date-value ' +
                (lastPrinter ? '' : 'empty') +
                '" id="pc-date-printer">' +
                formatDate(lastPrinter) + '</span></div>';
        html += '<div class="pc-date-badge">' +
                '<span class="pc-date-label">🧴 Картридж:</span>' +
                '<span class="pc-date-value ' +
                (lastCartridge ? '' : 'empty') +
                '" id="pc-date-cartridge">' +
                formatDate(lastCartridge) + '</span></div>';
        html += '</div>';

        // Кнопки замен
        html += '<div class="pc-actions">' +
                '<button type="button" class="btn btn-primary" ' +
                'onclick="App.PrinterCard.openReplacePrinter(' +
                printer.id + ')">' +
                '<i class="bi bi-arrow-repeat"></i> ' +
                'Заменить принтер</button>' +
                '<button type="button" class="btn btn-success" ' +
                'onclick="App.PrinterCard.openReplaceCartridge(' +
                printer.id + ')">' +
                '<i class="bi bi-droplet"></i> ' +
                'Заменить картридж</button>' +
                '</div>';

        // Драйверы
        html += '<div class="pc-actions pc-actions-secondary">' +
                '<button type="button" class="btn btn-outline-primary" ' +
                'onclick="App.PrinterCard.openDriversModal(' +
                printer.id + ')">' +
                '<i class="bi bi-download"></i> ' +
                'Драйверы принтера</button>' +
                '</div>';

        html += '</div></div>';
        return html;
    }

    // ============================================================
    // ПОКАЗ КАРТОЧКИ
    // ============================================================
    function show(printer, cabinet) {
        if (!printer) {
            utils.showErrorMessage('Принтер не найден');
            return;
        }

        var lastCartridgeFromPrinter = printer.last_cartridge_replaced_at;

        Swal.fire({
            html: buildCardHtml(printer, cabinet),
            width: 620,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
            padding: 0,
            didOpen: function() {
                // Подгружаем дату из модуля «Картриджи» и показываем максимум
                loadLastCartridgeDate(printer, cabinet).then(function(dateFromCartridges) {
                    var latest = pickLatest(lastCartridgeFromPrinter, dateFromCartridges);
                    if (!latest) return;
                    if (latest === lastCartridgeFromPrinter) return;

                    var el = document.getElementById('pc-date-cartridge');
                    if (el) {
                        el.textContent = formatDate(latest);
                        el.classList.remove('empty');
                    }
                }).catch(function() { /* тихо игнорируем */ });
            },
        });
    }

    // ============================================================
    // ПОИСК ПРИНТЕРА В КЭШЕ
    // ============================================================
    function findPrinter(printerId) {
        var cab = window.App.Cabinet;
        if (!cab || !cab.data) return null;
        return cab.data.printers.find(function(p) {
            return p.id === printerId;
        }) || null;
    }

    // ============================================================
    // ЗАМЕНА ПРИНТЕРА
    // ============================================================
    function openReplacePrinter(printerId) {
        var pr = findPrinter(printerId);
        if (!pr) {
            utils.showErrorMessage('Принтер не найден');
            return;
        }

        var connType = pr.connection_type || 'network';

        var pcs = (window.App.Cabinet && window.App.Cabinet.data &&
                   window.App.Cabinet.data.computers) || [];
        var pcOptions = '<option value="">— не подключен —</option>';
        pcs.forEach(function(pc) {
            var sel = (pr.connected_to_pc_id === pc.id) ? ' selected' : '';
            pcOptions += '<option value="' + pc.id + '"' + sel + '>' +
                utils.escapeHtml(pc.name || 'ПК #' + pc.id) + '</option>';
        });

        Swal.fire({
            title: '<i class="bi bi-arrow-repeat"></i> Замена принтера',
            html:
                '<div class="text-start">' +
                '<div class="mb-3">' +
                '<label class="form-label">Тип подключения</label>' +
                '<div class="btn-group w-100" role="group">' +
                    '<input type="radio" class="btn-check" name="rc-type" ' +
                    'id="rc-type-net" value="network"' +
                    (connType === 'network' ? ' checked' : '') + '>' +
                    '<label class="btn btn-outline-primary" for="rc-type-net">' +
                    '<i class="bi bi-globe"></i> Сетевой</label>' +
                    '<input type="radio" class="btn-check" name="rc-type" ' +
                    'id="rc-type-usb" value="usb"' +
                    (connType === 'usb' ? ' checked' : '') + '>' +
                    '<label class="btn btn-outline-primary" for="rc-type-usb">' +
                    '<i class="bi bi-usb-symbol"></i> USB (к ПК)</label>' +
                '</div></div>' +

                '<div class="mb-2">' +
                '<label class="form-label">Модель *</label>' +
                '<input id="rc-model" class="form-control" value="' +
                utils.escapeHtml(pr.model || '') + '"></div>' +

                '<div class="mb-2">' +
                '<label class="form-label">Картридж</label>' +
                '<input id="rc-cartridge" class="form-control" value="' +
                utils.escapeHtml(pr.cartridge || '') + '"></div>' +

                '<div class="mb-2">' +
                '<label class="form-label">Инвентарный номер</label>' +
                '<input id="rc-inventory" class="form-control" value="' +
                utils.escapeHtml(pr.inventory_number || '') + '"></div>' +

                '<div class="mb-2" id="rc-ip-block">' +
                '<label class="form-label">IP-адрес</label>' +
                '<input id="rc-ip" class="form-control" value="' +
                utils.escapeHtml(pr.ip_address || '') + '"></div>' +

                '<div class="mb-2" id="rc-pc-block">' +
                '<label class="form-label">Подключен к ПК</label>' +
                '<select id="rc-pc" class="form-select">' +
                pcOptions + '</select></div>' +

                '<div class="alert alert-info small mb-0 mt-2">' +
                '<i class="bi bi-info-circle"></i> ' +
                'Дата замены принтера будет установлена автоматически.' +
                '</div>' +
                '</div>',
            width: 620,
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-check"></i> Заменить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#4e73df',
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                function updateConnFields() {
                    var checked = document.querySelector(
                        'input[name="rc-type"]:checked'
                    );
                    var v = checked ? checked.value : 'network';
                    var isNet = (v === 'network');
                    var ipBlock = document.getElementById('rc-ip-block');
                    var pcBlock = document.getElementById('rc-pc-block');
                    if (ipBlock) ipBlock.style.display = isNet ? '' : 'none';
                    if (pcBlock) pcBlock.style.display = isNet ? 'none' : '';
                }
                document.querySelectorAll('input[name="rc-type"]')
                    .forEach(function(r) {
                        r.addEventListener('change', updateConnFields);
                    });
                updateConnFields();
            },
            preConfirm: function() {
                var model = (
                    document.getElementById('rc-model').value || ''
                ).trim();
                if (!model) {
                    Swal.showValidationMessage('Введите модель');
                    return false;
                }
                var checked = document.querySelector(
                    'input[name="rc-type"]:checked'
                );
                var conn = checked ? checked.value : 'network';

                var result = {
                    model: model,
                    cartridge: (
                        document.getElementById('rc-cartridge').value || ''
                    ).trim(),
                    inventory_number: (
                        document.getElementById('rc-inventory').value || ''
                    ).trim(),
                    connection_type: conn,
                };
                if (conn === 'network') {
                    result.ip_address = (
                        document.getElementById('rc-ip').value || ''
                    ).trim();
                    result.connected_to_pc_id = null;
                } else {
                    result.ip_address = '';
                    result.connected_to_pc_id =
                        document.getElementById('rc-pc').value || null;
                }
                return result;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            submitReplacePrinter(printerId, r.value);
        });
    }

    function submitReplacePrinter(printerId, data) {
        Swal.fire({
            title: 'Замена...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.post('/api/printers/' + printerId + '/replace', data)
            .then(function(res) {
                if (res.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Принтер заменён',
                        timer: 1500,
                        showConfirmButton: false,
                    });
                    reloadCabinet();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error || 'Не удалось заменить',
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось заменить',
                });
            });
    }

    // ============================================================
    // ЗАМЕНА КАРТРИДЖА
    // ============================================================
    function openReplaceCartridge(printerId) {
        var pr = findPrinter(printerId);
        if (!pr) {
            utils.showErrorMessage('Принтер не найден');
            return;
        }

        var suggestions = [
            'HP 26X (CF226X)', 'HP 26A (CF226A)',
            'Canon 057 Black (CRG-057)',
            'Brother TN-431BK',
            'Xerox 106R03478',
            'Epson 502 Black',
            'Kyocera TK-1160', 'Kyocera TK-1161',
            'Pantum TL-419H',
            'Ricoh 841296',
            'Samsung MLT-D203L',
            'OKI 45539820',
        ];
        var datalist = suggestions.map(function(s) {
            return '<option value="' + utils.escapeHtml(s) + '">';
        }).join('');

        Swal.fire({
            title: '<i class="bi bi-droplet"></i> Замена картриджа',
            html:
                '<div class="text-start">' +
                '<p class="text-muted small mb-2">' +
                'Принтер: <strong>' +
                utils.escapeHtml(pr.model || '') + '</strong></p>' +
                '<div class="mb-2">' +
                '<label class="form-label">Новый картридж *</label>' +
                '<input id="rc-cart-new" class="form-control" ' +
                'list="rc-cart-suggestions" ' +
                'value="' + utils.escapeHtml(pr.cartridge || '') + '">' +
                '<datalist id="rc-cart-suggestions">' + datalist +
                '</datalist>' +
                '</div>' +
                '<div class="alert alert-info small mb-0">' +
                '<i class="bi bi-info-circle"></i> ' +
                'Дата замены картриджа будет установлена автоматически.' +
                '</div>' +
                '</div>',
            width: 520,
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-check"></i> Заменить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                var v = (
                    document.getElementById('rc-cart-new').value || ''
                ).trim();
                if (!v) {
                    Swal.showValidationMessage('Введите картридж');
                    return false;
                }
                return v;
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            submitReplaceCartridge(printerId, r.value);
        });
    }

    function submitReplaceCartridge(printerId, cartridge) {
        Swal.fire({
            title: 'Замена...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.post('/api/printers/' + printerId + '/replace-cartridge',
                 { cartridge: cartridge })
            .then(function(res) {
                if (res.success) {
                    // Сбрасываем кеш картриджей — вдруг добавили новую дату
                    cartridgesCache = null;
                    cartridgesCacheTs = 0;

                    Swal.fire({
                        icon: 'success',
                        title: 'Картридж заменён',
                        timer: 1500,
                        showConfirmButton: false,
                    });
                    reloadCabinet();
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Ошибка',
                        text: res.error || 'Не удалось заменить',
                    });
                }
            })
            .catch(function(err) {
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка',
                    text: err.message || 'Не удалось заменить',
                });
            });
    }

    // ============================================================
    // ДРАЙВЕРЫ ПРИНТЕРА
    // ============================================================
    function openDriversModal(printerId) {
        Swal.fire({
            title: 'Загрузка драйверов...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.get('/api/printers/' + printerId + '/drivers')
            .then(function(data) {
                if (data.error) {
                    Swal.close();
                    utils.showErrorMessage(data.error);
                    return;
                }
                renderDriversModal(printerId, data);
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка загрузки');
            });
    }

    function renderDriversModal(printerId, data) {
        var drivers = data.drivers || [];
        var model = data.model || '';
        var editor = canEdit();

        var html = '<div class="text-start">';

        // Модель
        html += '<p class="text-muted small mb-2">Модель: <strong>' +
                utils.escapeHtml(model) + '</strong></p>';

        // Тулбар: счётчик + кнопка загрузки
        html += '<div class="d-flex justify-content-between ' +
                'align-items-center mb-2 flex-wrap gap-2">';
        html += '<span class="text-muted small">Всего: ' + drivers.length +
                '</span>';
        if (editor) {
            html += '<button type="button" class="btn btn-sm btn-success" ' +
                    'id="driver-upload-btn">' +
                    '<i class="bi bi-upload"></i> Загрузить драйвер' +
                    '</button>';
        }
        html += '</div>';

        // Скрытый file input + контейнер статуса
        if (editor) {
            html += '<input type="file" id="driver-upload-input" ' +
                    'style="display:none" ' +
                    'accept=".exe,.msi,.zip,.rar,.7z,.tar,.gz,.pdf,.txt,' +
                    '.inf,.cab,.dmg,.pkg,.deb,.rpm,.doc,.docx,.chm,' +
                    '.bat,.cmd,.ps1,.sh">';
            html += '<div id="driver-upload-status"></div>';
        }

        // Список
        if (drivers.length === 0) {
            html += '<div class="alert alert-info mb-0">' +
                    '<i class="bi bi-info-circle"></i> ' +
                    (editor
                        ? 'Драйверов пока нет. Нажмите «Загрузить драйвер».'
                        : 'Для этой модели драйверы не найдены.') +
                    '</div>';
        } else {
            html += '<div class="drivers-list">';
            drivers.forEach(function(d) {
                var icon = fileIcon(d.name);

                html += '<div class="driver-item">';

                // Скачивание — ссылка
                html += '<a class="driver-main" ' +
                        'href="/api/printers/' + printerId +
                        '/drivers/download?path=' +
                        encodeURIComponent(d.path) + '" download>' +
                        '<div class="driver-icon">' +
                        '<i class="bi ' + icon + '"></i>' +
                        '</div>' +
                        '<div class="driver-info">' +
                        '<div class="driver-name">' +
                        utils.escapeHtml(d.name) + '</div>' +
                        '<div class="driver-meta">' +
                        (d.is_common
                            ? '<span class="badge-common">общий</span> '
                            : '') +
                        utils.escapeHtml(d.group || '') +
                        (d.group ? ' · ' : '') +
                        d.size_human +
                        '</div></div>' +
                        '<div class="driver-action">' +
                        '<i class="bi bi-download"></i>' +
                        '</div>' +
                        '</a>';

                // Кнопка удаления — только для файлов этого принтера
                if (editor && d.can_delete) {
                    html += '<button type="button" class="driver-delete-btn" ' +
                            'data-driver-path="' +
                            utils.escapeHtml(d.path) + '" ' +
                            'title="Удалить драйвер">' +
                            '<i class="bi bi-trash"></i>' +
                            '</button>';
                }

                html += '</div>';
            });
            html += '</div>';
        }

        html += '</div>';

        Swal.fire({
            title: '<i class="bi bi-download"></i> Драйверы (' +
                   drivers.length + ')',
            html: html,
            width: 640,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                if (!editor) return;

                // Загрузка
                var btn = document.getElementById('driver-upload-btn');
                var input = document.getElementById('driver-upload-input');
                if (btn && input) {
                    btn.addEventListener('click', function() { input.click(); });
                    input.addEventListener('change', function() {
                        if (this.files && this.files[0]) {
                            uploadDriver(printerId, this.files[0]);
                            this.value = '';
                        }
                    });
                }

                // Удаление
                var container = Swal.getHtmlContainer();
                if (container) {
                    container
                        .querySelectorAll('.driver-delete-btn')
                        .forEach(function(el) {
                            el.addEventListener('click', function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                var path = this.getAttribute('data-driver-path');
                                deleteDriver(printerId, path);
                            });
                        });
                }
            },
        });
    }

    function uploadDriver(printerId, file) {
        var $status = $('#driver-upload-status');
        $status.html(
            '<div class="alert alert-info py-2 small mb-2">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>' +
            'Загрузка: <strong>' + utils.escapeHtml(file.name) + '</strong> ' +
            '<span class="text-muted">(' +
            utils.formatSize(file.size) + ')</span>' +
            '</div>'
        );

        var fd = new FormData();
        fd.append('file', file);

        api.upload('/api/printers/' + printerId + '/drivers/upload', fd)
            .then(function(res) {
                if (res && res.success) {
                    $status.html(
                        '<div class="alert alert-success py-2 small mb-2">' +
                        '<i class="bi bi-check-circle"></i> ' +
                        'Драйвер загружен. Обновляем список…' +
                        '</div>'
                    );
                    setTimeout(function() {
                        openDriversModal(printerId);
                    }, 500);
                } else {
                    var err = (res && res.error) || 'Ошибка загрузки';
                    $status.html(
                        '<div class="alert alert-danger py-2 small mb-2">' +
                        '<i class="bi bi-x-circle"></i> ' +
                        utils.escapeHtml(err) +
                        '</div>'
                    );
                }
            })
            .catch(function(err) {
                $status.html(
                    '<div class="alert alert-danger py-2 small mb-2">' +
                    '<i class="bi bi-x-circle"></i> ' +
                    utils.escapeHtml(err.message || 'Ошибка загрузки') +
                    '</div>'
                );
            });
    }

    function deleteDriver(printerId, path) {
        Swal.fire({
            title: 'Удалить драйвер?',
            html: '<p class="small mb-0">Файл: <strong>' +
                  utils.escapeHtml(path) + '</strong></p>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;

            api.post('/api/printers/' + printerId + '/drivers/delete',
                     { path: path })
                .then(function(res) {
                    if (res && res.success) {
                        utils.showSuccessMessage('Драйвер удалён');
                        openDriversModal(printerId);
                    } else {
                        utils.showErrorMessage(
                            (res && res.error) || 'Ошибка удаления'
                        );
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка удаления');
                });
        });
    }

    // ============================================================
    // ПЕРЕЗАГРУЗКА ДАННЫХ КАБИНЕТА
    // ============================================================
    function reloadCabinet() {
        var cab = window.App.Cabinet;
        if (cab && typeof cab.reload === 'function') {
            cab.reload();
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.show = show;
    mod.openReplacePrinter = openReplacePrinter;
    mod.openReplaceCartridge = openReplaceCartridge;
    mod.openDriversModal = openDriversModal;

    // Глобальные алиасы для inline onclick
    window.openPrinterCard = show;

    console.log('[printer_card] Загружено');
})();