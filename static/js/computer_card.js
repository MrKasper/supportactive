// static/js/computer_card.js
// Карточка ПК: RAM/диски с историей замен + периферия + мониторы.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[computer_card] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;
    var mod = window.App.register('ComputerCard');

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    function esc(s) { return utils.escapeHtml(s); }

    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso.replace(' ', 'T'));
            if (isNaN(d.getTime())) return iso;
            var p = function(n) { return String(n).padStart(2, '0'); };
            return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' +
                   d.getFullYear() + ' ' + p(d.getHours()) + ':' +
                   p(d.getMinutes());
        } catch (e) { return iso; }
    }

    function canEdit() {
        if (window.App.Cabinet && typeof window.App.Cabinet.canEdit === 'function') {
            return window.App.Cabinet.canEdit();
        }
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Техник';
    }

    // ============================================================
    // ИСТОРИЯ КОМПОНЕНТА
    // ============================================================
    function loadHistory(pcId, type) {
        return api.get('/api/computers/' + pcId + '/history?type=' + type)
            .then(function(res) {
                return (res && res.items) || [];
            })
            .catch(function() { return []; });
    }

    function renderHistoryHtml(items, type) {
        if (!items || items.length === 0) {
            return '<div class="cc-history-empty">' +
                   '<i class="bi bi-clock-history"></i> История пуста' +
                   '</div>';
        }

        var html = '<div class="cc-history-list">';
        items.forEach(function(h) {
            var actionLabel, actionClass;
            if (h.action === 'replace') {
                actionLabel = 'Замена';
                actionClass = 'cc-hist-replace';
            } else if (h.action === 'add') {
                actionLabel = 'Установка';
                actionClass = 'cc-hist-add';
            } else {
                actionLabel = 'Изъятие';
                actionClass = 'cc-hist-remove';
            }

            html += '<div class="cc-history-item ' + actionClass + '">';
            html += '<div class="cc-hist-top">';
            html += '<span class="cc-hist-action">' + actionLabel + '</span>';
            html += '<span class="cc-hist-date">' +
                    esc(fmtDate(h.created_at)) + '</span>';
            html += '</div>';

            html += '<div class="cc-hist-values">';
            if (h.old_value) {
                html += '<div class="cc-hist-val cc-hist-val-old">' +
                        '<i class="bi bi-arrow-right-short"></i> ' +
                        esc(formatComponentValue(h.old_value, type)) +
                        '</div>';
            }
            if (h.new_value) {
                html += '<div class="cc-hist-val cc-hist-val-new">' +
                        '<i class="bi bi-check2"></i> ' +
                        esc(formatComponentValue(h.new_value, type)) +
                        '</div>';
            }
            html += '</div>';

            if (h.user_name) {
                html += '<div class="cc-hist-meta">' +
                        '<i class="bi bi-person"></i> ' + esc(h.user_name);
                if (h.note) {
                    html += ' · <i class="bi bi-chat-left-text"></i> ' + esc(h.note);
                }
                html += '</div>';
            } else if (h.note) {
                html += '<div class="cc-hist-meta">' +
                        '<i class="bi bi-chat-left-text"></i> ' + esc(h.note) +
                        '</div>';
            }

            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function formatComponentValue(v, type) {
        if (!v) return '—';
        if (typeof v === 'string') return v;
        if (type === 'ram') {
            return [v.size, v.type, v.speed].filter(Boolean).join(' ');
        }
        if (type === 'storage') {
            return [v.capacity, v.type].filter(Boolean).join(' ');
        }
        if (type === 'monitors') {
            return [v.model, v.inventory_number ? '(' + v.inventory_number + ')' : '']
                .filter(Boolean).join(' ');
        }
        // Периферия
        if (v.model) return v.model;
        return JSON.stringify(v);
    }

    // ============================================================
    // ПОДГОТОВКА СПИСКОВ КОМПОНЕНТОВ
    // ============================================================
    function normalizeArr(v) {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') {
            try {
                var p = JSON.parse(v);
                return Array.isArray(p) ? p : [];
            } catch (e) { return []; }
        }
        return [];
    }

    function normalizeObj(v) {
        if (!v) return null;
        if (typeof v === 'object') return v;
        if (typeof v === 'string') {
            try { return JSON.parse(v); } catch (e) { return null; }
        }
        return null;
    }

    // ============================================================
    // РЕНДЕР КАРТОЧКИ
    // ============================================================
    function buildCardHtml(pc, cabinet) {
        var ramArr = normalizeArr(pc.ram);
        var storageArr = normalizeArr(pc.storage);
        var monitorsArr = normalizeArr(pc.monitors);
        var speakers = normalizeObj(pc.speakers);
        var webcam = normalizeObj(pc.webcam);
        var headphones = normalizeObj(pc.headphones);
        var microphone = normalizeObj(pc.microphone);
        var editor = canEdit();

        var statusCls = pc.status === 'online' ? 'online' : 'offline';
        var statusText = pc.status === 'online' ? 'Онлайн' : 'Офлайн';
        var lastPing = pc.last_ping_at ? fmtDate(pc.last_ping_at) : '—';

        var html = '<div class="cc-card">';

        // ---------- Шапка ----------
        html += '<div class="cc-header">';
        html += '<div class="cc-title">';
        html += '<i class="bi bi-pc-display"></i> ';
        html += esc(pc.name || 'Без названия');
        if (pc.inventory_number) {
            html += ' <span class="cc-inv">' +
                    esc(pc.inventory_number) + '</span>';
        }
        html += '</div>';
        if (cabinet) {
            html += '<div class="cc-subtitle">';
            html += '<i class="bi bi-door-closed"></i> ' +
                    esc(cabinet.cabinet_number || '');
            if (cabinet.description) {
                html += ' · ' + esc(cabinet.description);
            }
            html += '</div>';
        }
        html += '</div>';

        // ---------- Основные характеристики ----------
        html += '<div class="cc-specs">';
        if (pc.motherboard) {
            html += specRow('cк-mb', 'bi-motherboard',
                'Материнская плата',
                pc.motherboard + (pc.motherboard_socket
                    ? ' (' + pc.motherboard_socket + ')' : ''));
        }
        if (pc.cpu) {
            html += specRow('cpu', 'bi-cpu', 'Процессор', pc.cpu);
        }
        if (pc.ip_address) {
            html += specRow('ip', 'bi-globe', 'IP-адрес',
                '<code>' + esc(pc.ip_address) + '</code>');
        }
        html += '<div class="cc-spec-row">' +
                '<span class="cc-spec-icon"><i class="bi bi-activity"></i></span>' +
                '<span class="cc-spec-label">Статус:</span>' +
                '<span class="cc-status ' + statusCls + '">' +
                '<i class="bi bi-circle' +
                (pc.status === 'online' ? '-fill' : '') + '"></i> ' +
                statusText + '</span>' +
                '<span class="cc-spec-meta">(последняя проверка: ' +
                esc(lastPing) + ')</span>' +
                '</div>';
        html += '</div>';

        // ---------- ОЗУ ----------
        html += renderArraySection({
            title: 'ОЗУ',
            icon: 'bi-memory',
            type: 'ram',
            items: ramArr,
            editor: editor,
            emptyText: 'Модули не установлены',
        });

        // ---------- Хранилища ----------
        html += renderArraySection({
            title: 'Хранилища',
            icon: 'bi-device-hdd',
            type: 'storage',
            items: storageArr,
            editor: editor,
            emptyText: 'Накопители не установлены',
        });

        // ---------- Мониторы ----------
        html += renderMonitorsSection(monitorsArr, editor);

        // ---------- Периферия ----------
        html += '<div class="cc-section" data-cc-section="peripherals">';
        html += '<div class="cc-section-head">';
        html += '<span class="cc-section-title">' +
                '<i class="bi bi-usb-symbol"></i> Периферия</span>';
        html += '</div>';
        html += '<div class="cc-section-body">';
        html += renderPeripheral({
            key: 'speakers', label: 'Колонки', icon: 'bi-speaker',
            value: speakers, editor: editor,
        });
        html += renderPeripheral({
            key: 'webcam', label: 'Веб-камера', icon: 'bi-camera-video',
            value: webcam, editor: editor,
        });
        html += renderPeripheral({
            key: 'headphones', label: 'Наушники', icon: 'bi-headset',
            value: headphones, editor: editor,
        });
        html += renderPeripheral({
            key: 'microphone', label: 'Микрофон', icon: 'bi-mic',
            value: microphone, editor: editor,
        });
        html += '</div></div>';

        html += '</div>';
        return html;
    }

    function specRow(id, icon, label, value) {
        return '<div class="cc-spec-row">' +
               '<span class="cc-spec-icon"><i class="bi ' + icon + '"></i></span>' +
               '<span class="cc-spec-label">' + esc(label) + ':</span>' +
               '<span class="cc-spec-value">' + value + '</span>' +
               '</div>';
    }

    // ============================================================
    // СЕКЦИЯ МАССИВА (RAM / Storage)
    // ============================================================
    function renderArraySection(opts) {
        var html = '<div class="cc-section" data-cc-section="' + opts.type + '">';
        html += '<div class="cc-section-head">';
        html += '<span class="cc-section-title">' +
                '<i class="bi ' + opts.icon + '"></i> ' +
                esc(opts.title) + '</span>';
        if (opts.editor) {
            html += '<button type="button" class="cc-btn cc-btn-add" ' +
                    'data-cc-add="' + opts.type + '">' +
                    '<i class="bi bi-plus-lg"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="cc-section-body">';

        if (opts.items.length === 0) {
            html += '<div class="cc-empty">' +
                    '<i class="bi ' + opts.icon + '"></i> ' +
                    esc(opts.emptyText) + '</div>';
        } else {
            opts.items.forEach(function(item, idx) {
                html += renderArrayItem(opts.type, item, idx, opts.editor);
            });
        }
        html += '</div></div>';
        return html;
    }

    function renderArrayItem(type, item, idx, editor) {
        var label = '';
        if (type === 'ram') {
            label = [item.size, item.type, item.speed].filter(Boolean).join(' ');
        } else if (type === 'storage') {
            label = [item.capacity, item.type].filter(Boolean).join(' ');
        }

        var icon = type === 'ram' ? 'bi-memory' : 'bi-hdd';

        var html = '<div class="cc-item" data-cc-type="' + type +
                   '" data-cc-index="' + idx + '">';

        html += '<div class="cc-item-row">';
        html += '<span class="cc-item-icon"><i class="bi ' + icon + '"></i></span>';
        html += '<span class="cc-item-label">' + esc(label || '—') + '</span>';

        if (editor) {
            html += '<div class="cc-item-actions">';
            html += '<button type="button" class="cc-btn cc-btn-replace" ' +
                    'data-cc-replace="' + type + '" data-cc-index="' + idx + '">' +
                    '<i class="bi bi-arrow-repeat"></i> Заменить</button>';
            html += '<button type="button" class="cc-btn cc-btn-remove" ' +
                    'data-cc-remove="' + type + '" data-cc-index="' + idx + '">' +
                    '<i class="bi bi-x-lg"></i></button>';
            html += '</div>';
        }
        html += '</div>';

        // История
        html += '<div class="cc-history-toggle" ' +
                'data-cc-history="' + type + '">' +
                '<i class="bi bi-clock-history"></i> ' +
                '<span class="cc-history-label">История замен…</span>' +
                '<i class="bi bi-chevron-down cc-history-arrow"></i>' +
                '</div>';
        html += '<div class="cc-history-body" style="display:none"></div>';

        html += '</div>';
        return html;
    }

    // ============================================================
    // СЕКЦИЯ МОНИТОРОВ
    // ============================================================
    function renderMonitorsSection(monitors, editor) {
        var html = '<div class="cc-section" data-cc-section="monitors">';
        html += '<div class="cc-section-head">';
        html += '<span class="cc-section-title">' +
                '<i class="bi bi-display"></i> Мониторы ' +
                (monitors.length > 0
                    ? '<span class="badge bg-secondary">' + monitors.length + '</span>'
                    : '') +
                '</span>';
        if (editor) {
            html += '<button type="button" class="cc-btn cc-btn-add" ' +
                    'data-cc-add="monitors">' +
                    '<i class="bi bi-plus-lg"></i> Добавить</button>';
        }
        html += '</div>';
        html += '<div class="cc-section-body">';

        if (monitors.length === 0) {
            html += '<div class="cc-empty">' +
                    '<i class="bi bi-display"></i> ' +
                    'Мониторы не установлены</div>';
        } else {
            monitors.forEach(function(m, idx) {
                html += renderMonitorItem(m, idx, editor);
            });
        }

        html += '</div></div>';
        return html;
    }

    function renderMonitorItem(monitor, idx, editor) {
        var model = monitor.model || '—';
        var inv = monitor.inventory_number || '';

        var html = '<div class="cc-item" data-cc-type="monitors" ' +
                   'data-cc-index="' + idx + '">';

        html += '<div class="cc-item-row">';
        html += '<span class="cc-item-icon"><i class="bi bi-display"></i></span>';
        html += '<span class="cc-item-label">' + esc(model);
        if (inv) {
            html += ' <span class="cc-inv">' + esc(inv) + '</span>';
        }
        html += '</span>';

        if (editor) {
            html += '<div class="cc-item-actions">';
            html += '<button type="button" class="cc-btn cc-btn-replace" ' +
                    'data-cc-replace="monitors" data-cc-index="' + idx + '">' +
                    '<i class="bi bi-arrow-repeat"></i> Заменить</button>';
            html += '<button type="button" class="cc-btn cc-btn-remove" ' +
                    'data-cc-remove="monitors" data-cc-index="' + idx + '">' +
                    '<i class="bi bi-x-lg"></i></button>';
            html += '</div>';
        }
        html += '</div>';

        // История
        html += '<div class="cc-history-toggle" ' +
                'data-cc-history="monitors">' +
                '<i class="bi bi-clock-history"></i> ' +
                '<span class="cc-history-label">История замен…</span>' +
                '<i class="bi bi-chevron-down cc-history-arrow"></i>' +
                '</div>';
        html += '<div class="cc-history-body" style="display:none"></div>';

        html += '</div>';
        return html;
    }

    // ============================================================
    // ПЕРИФЕРИЯ (одиночные устройства)
    // ============================================================
    function renderPeripheral(opts) {
        var v = opts.value;
        var has = !!(v && (v.model || (typeof v === 'string' && v)));

        var html = '<div class="cc-periph" data-cc-type="' + opts.key + '">';
        html += '<div class="cc-item-row">';
        html += '<span class="cc-item-icon"><i class="bi ' +
                opts.icon + '"></i></span>';
        html += '<span class="cc-periph-label">' + esc(opts.label) + ':</span>';
        html += '<span class="cc-periph-value">';
        if (has) {
            html += esc(typeof v === 'string' ? v : (v.model || '—'));
        } else {
            html += '<span class="cc-muted">— не установлено —</span>';
        }
        html += '</span>';

        if (opts.editor) {
            html += '<div class="cc-item-actions">';
            if (has) {
                html += '<button type="button" class="cc-btn cc-btn-replace" ' +
                        'data-cc-replace-periph="' + opts.key + '">' +
                        '<i class="bi bi-arrow-repeat"></i> Заменить</button>';
                html += '<button type="button" class="cc-btn cc-btn-remove" ' +
                        'data-cc-remove-periph="' + opts.key + '">' +
                        '<i class="bi bi-x-lg"></i></button>';
            } else {
                html += '<button type="button" class="cc-btn cc-btn-add" ' +
                        'data-cc-add-periph="' + opts.key + '">' +
                        '<i class="bi bi-plus-lg"></i> Добавить</button>';
            }
            html += '</div>';
        }
        html += '</div>';

        html += '<div class="cc-history-toggle" ' +
                'data-cc-history="' + opts.key + '">' +
                '<i class="bi bi-clock-history"></i> ' +
                '<span class="cc-history-label">История замен…</span>' +
                '<i class="bi bi-chevron-down cc-history-arrow"></i>' +
                '</div>';
        html += '<div class="cc-history-body" style="display:none"></div>';

        html += '</div>';
        return html;
    }

    // ============================================================
    // ПОКАЗ КАРТОЧКИ
    // ============================================================
    function show(pcIdOrPc, cabinet) {
        var pcId;
        var pcObj = null;

        if (typeof pcIdOrPc === 'object' && pcIdOrPc !== null) {
            pcObj = pcIdOrPc;
            pcId = pcObj.id;
        } else {
            pcId = pcIdOrPc;
        }

        if (!pcId) {
            utils.showErrorMessage('ПК не найден');
            return;
        }

        var resolvePc;
        if (pcObj) {
            resolvePc = Promise.resolve(pcObj);
        } else {
            resolvePc = api.get('/api/computers/' + pcId)
                .then(function(res) {
                    if (res && res.error) throw new Error(res.error);
                    return res;
                });
        }

        var resolveCabinet;
        if (cabinet) {
            resolveCabinet = Promise.resolve(cabinet);
        } else if (window.App.Cabinet && window.App.Cabinet.data) {
            resolveCabinet = Promise.resolve(window.App.Cabinet.data.cabinet);
        } else {
            resolveCabinet = Promise.resolve(null);
        }

        Promise.all([resolvePc, resolveCabinet])
            .then(function(results) {
                var pc = results[0];
                var cab = results[1];

                if (!pc) throw new Error('ПК не найден');

                Swal.fire({
                    html: buildCardHtml(pc, cab),
                    width: 720,
                    showConfirmButton: false,
                    showCloseButton: true,
                    customClass: { popup: 'swal-computer-card' },
                    padding: 0,
                    didOpen: function() {
                        initCardHandlers(pcId, pc);
                    },
                });
            })
            .catch(function(err) {
                utils.showErrorMessage(err.message || 'Не удалось открыть карточку');
            });
    }

    // ============================================================
    // ОБРАБОТЧИКИ ВНУТРИ КАРТОЧКИ
    // ============================================================
    function initCardHandlers(pcId, pc) {
        var $root = $('.swal-computer-card');

        // ----- История: toggle -----
        $root.on('click', '.cc-history-toggle', function() {
            var $toggle = $(this);
            var $body = $toggle.next('.cc-history-body');
            var type = $toggle.data('cc-history');
            var isOpen = $toggle.hasClass('cc-open');

            if (isOpen) {
                $toggle.removeClass('cc-open');
                $body.slideUp(150);
                return;
            }

            $toggle.addClass('cc-open');

            if ($body.data('loaded') !== true) {
                $body.html('<div class="cc-history-loading">' +
                           '<div class="spinner-border spinner-border-sm"></div>' +
                           '</div>');
                loadHistory(pcId, type).then(function(items) {
                    $body.html(renderHistoryHtml(items, type));
                    $body.data('loaded', true);
                    $body.slideDown(180);
                });
            } else {
                $body.slideDown(180);
            }
        });

        // ----- Замена RAM/диска/монитора -----
        $root.on('click', '[data-cc-replace]', function() {
            var type = $(this).data('cc-replace');
            var idx = parseInt($(this).data('cc-index'), 10);

            if (type === 'monitors') {
                openReplaceMonitor(pcId, pc, idx);
            } else {
                openReplaceComponent(pcId, pc, type, idx);
            }
        });

        // ----- Добавление RAM/диска/монитора -----
        $root.on('click', '[data-cc-add]', function() {
            var type = $(this).data('cc-add');
            if (type === 'monitors') {
                openAddMonitor(pcId);
            } else {
                openAddComponent(pcId, type);
            }
        });

        // ----- Удаление RAM/диска/монитора -----
        $root.on('click', '[data-cc-remove]', function() {
            var type = $(this).data('cc-remove');
            var idx = parseInt($(this).data('cc-index'), 10);
            openRemoveComponent(pcId, type, idx);
        });

        // ----- Замена периферии -----
        $root.on('click', '[data-cc-replace-periph]', function() {
            var key = $(this).data('cc-replace-periph');
            openReplacePeripheral(pcId, key);
        });

        // ----- Добавление периферии -----
        $root.on('click', '[data-cc-add-periph]', function() {
            var key = $(this).data('cc-add-periph');
            openReplacePeripheral(pcId, key);
        });

        // ----- Удаление периферии -----
        $root.on('click', '[data-cc-remove-periph]', function() {
            var key = $(this).data('cc-remove-periph');
            openRemovePeripheral(pcId, key);
        });
    }

    // ============================================================
    // МОДАЛКА: ЗАМЕНА RAM / ДИСКА
    // ============================================================
    function openReplaceComponent(pcId, pc, type, index) {
        var arr = normalizeArr(pc[type]);
        var current = arr[index] || {};

        var html = '';
        if (type === 'ram') {
            html += '<div class="mb-2 text-start"><label class="form-label">' +
                    'Объём</label>' +
                    '<input id="cc-ram-size" class="form-control" ' +
                    'value="' + esc(current.size || '') + '" ' +
                    'placeholder="8GB"></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Тип</label>' +
                    '<select id="cc-ram-type" class="form-select">' +
                    ['DDR3','DDR4','DDR5','LPDDR4','LPDDR5']
                        .map(function(t) {
                            return '<option' +
                                (t === current.type ? ' selected' : '') +
                                '>' + t + '</option>';
                        }).join('') +
                    '</select></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Частота</label>' +
                    '<input id="cc-ram-speed" class="form-control" ' +
                    'value="' + esc(current.speed || '') + '" ' +
                    'placeholder="3200MHz"></div>';
        } else {
            html += '<div class="mb-2 text-start"><label class="form-label">' +
                    'Объём</label>' +
                    '<input id="cc-st-cap" class="form-control" ' +
                    'value="' + esc(current.capacity || '') + '" ' +
                    'placeholder="512GB"></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Тип</label>' +
                    '<select id="cc-st-type" class="form-select">' +
                    ['SSD','HDD','NVMe','SSD M.2','eMMC']
                        .map(function(t) {
                            return '<option' +
                                (t === current.type ? ' selected' : '') +
                                '>' + t + '</option>';
                        }).join('') +
                    '</select></div>';
        }

        html += '<div class="mb-2 text-start"><label class="form-label">' +
                'Примечание к замене</label>' +
                '<textarea id="cc-note" class="form-control" rows="2" ' +
                'placeholder="Необязательно"></textarea></div>';

        Swal.fire({
            title: '<i class="bi bi-arrow-repeat"></i> Замена ' +
                   (type === 'ram' ? 'модуля ОЗУ' : 'накопителя'),
            html: html,
            width: 520,
            showCancelButton: true,
            confirmButtonText: 'Заменить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#4e73df',
            preConfirm: function() {
                if (type === 'ram') {
                    var size = ($('#cc-ram-size').val() || '').trim();
                    if (!size) {
                        Swal.showValidationMessage('Укажите объём');
                        return false;
                    }
                    return {
                        value: {
                            size: size,
                            type: $('#cc-ram-type').val(),
                            speed: ($('#cc-ram-speed').val() || '').trim(),
                        },
                        note: ($('#cc-note').val() || '').trim(),
                    };
                } else {
                    var cap = ($('#cc-st-cap').val() || '').trim();
                    if (!cap) {
                        Swal.showValidationMessage('Укажите объём');
                        return false;
                    }
                    return {
                        value: {
                            capacity: cap,
                            type: $('#cc-st-type').val(),
                        },
                        note: ($('#cc-note').val() || '').trim(),
                    };
                }
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/computers/' + pcId + '/components/replace', {
                type: type,
                index: index,
                value: r.value.value,
                note: r.value.note,
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Компонент заменён');
                    reloadAndReopen(pcId);
                } else {
                    utils.showErrorMessage(res.error);
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    }

    // ============================================================
    // МОДАЛКА: ДОБАВЛЕНИЕ RAM / ДИСКА
    // ============================================================
    function openAddComponent(pcId, type) {
        var html = '';
        if (type === 'ram') {
            html += '<div class="mb-2 text-start"><label class="form-label">' +
                    'Объём</label>' +
                    '<input id="cc-ram-size" class="form-control" ' +
                    'placeholder="8GB"></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Тип</label>' +
                    '<select id="cc-ram-type" class="form-select">' +
                    '<option>DDR3</option><option selected>DDR4</option>' +
                    '<option>DDR5</option><option>LPDDR4</option>' +
                    '<option>LPDDR5</option></select></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Частота</label>' +
                    '<input id="cc-ram-speed" class="form-control" ' +
                    'placeholder="3200MHz"></div>';
        } else {
            html += '<div class="mb-2 text-start"><label class="form-label">' +
                    'Объём</label>' +
                    '<input id="cc-st-cap" class="form-control" ' +
                    'placeholder="512GB"></div>' +
                    '<div class="mb-2 text-start"><label class="form-label">' +
                    'Тип</label>' +
                    '<select id="cc-st-type" class="form-select">' +
                    '<option selected>SSD</option><option>HDD</option>' +
                    '<option>NVMe</option><option>SSD M.2</option>' +
                    '<option>eMMC</option></select></div>';
        }

        Swal.fire({
            title: '<i class="bi bi-plus-lg"></i> Добавить ' +
                   (type === 'ram' ? 'модуль ОЗУ' : 'накопитель'),
            html: html,
            width: 520,
            showCancelButton: true,
            confirmButtonText: 'Добавить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                if (type === 'ram') {
                    var size = ($('#cc-ram-size').val() || '').trim();
                    if (!size) {
                        Swal.showValidationMessage('Укажите объём');
                        return false;
                    }
                    return {
                        size: size,
                        type: $('#cc-ram-type').val(),
                        speed: ($('#cc-ram-speed').val() || '').trim(),
                    };
                } else {
                    var cap = ($('#cc-st-cap').val() || '').trim();
                    if (!cap) {
                        Swal.showValidationMessage('Укажите объём');
                        return false;
                    }
                    return {
                        capacity: cap,
                        type: $('#cc-st-type').val(),
                    };
                }
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/computers/' + pcId + '/components/add', {
                type: type,
                value: r.value,
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Компонент добавлен');
                    reloadAndReopen(pcId);
                } else {
                    utils.showErrorMessage(res.error);
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    }

    // ============================================================
    // МОДАЛКА: МОНИТОР — ЗАМЕНА / ДОБАВЛЕНИЕ
    // ============================================================
    function openReplaceMonitor(pcId, pc, index) {
        var arr = normalizeArr(pc.monitors);
        var current = arr[index] || {};

        openMonitorForm(pcId, 'replace', current, index);
    }

    function openAddMonitor(pcId) {
        openMonitorForm(pcId, 'add', {}, null);
    }

    function openMonitorForm(pcId, mode, current, index) {
        var title = mode === 'add'
            ? '<i class="bi bi-plus-lg"></i> Добавить монитор'
            : '<i class="bi bi-arrow-repeat"></i> Замена монитора';

        var html =
            '<div class="text-start">' +
            '<div class="mb-2"><label class="form-label">Модель *</label>' +
            '<input id="cc-mon-model" class="form-control" ' +
            'value="' + esc(current.model || '') + '" ' +
            'placeholder="Например: Dell U2722D"></div>' +
            '<div class="mb-2"><label class="form-label">' +
            'Инвентарный номер</label>' +
            '<input id="cc-mon-inv" class="form-control" ' +
            'value="' + esc(current.inventory_number || '') + '" ' +
            'placeholder="Например: MON-DELL-201"></div>' +
            (mode === 'replace'
                ? '<div class="mb-2"><label class="form-label">' +
                  'Примечание к замене</label>' +
                  '<textarea id="cc-mon-note" class="form-control" rows="2" ' +
                  'placeholder="Необязательно"></textarea></div>'
                : '') +
            '</div>';

        Swal.fire({
            title: title,
            html: html,
            width: 520,
            showCancelButton: true,
            confirmButtonText: mode === 'add' ? 'Добавить' : 'Заменить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: mode === 'add' ? '#28a745' : '#4e73df',
            preConfirm: function() {
                var model = ($('#cc-mon-model').val() || '').trim();
                if (!model) {
                    Swal.showValidationMessage('Введите модель монитора');
                    return false;
                }
                var payload = {
                    model: model,
                    inventory_number: ($('#cc-mon-inv').val() || '').trim(),
                };
                var note = mode === 'replace'
                    ? ($('#cc-mon-note').val() || '').trim()
                    : '';
                return { value: payload, note: note };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;

            var url = mode === 'add'
                ? '/api/computers/' + pcId + '/components/add'
                : '/api/computers/' + pcId + '/components/replace';

            var body = {
                type: 'monitors',
                value: r.value.value,
            };
            if (mode === 'replace') {
                body.index = index;
                body.note = r.value.note;
            }

            api.post(url, body)
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage(
                            mode === 'add' ? 'Монитор добавлен' : 'Монитор заменён'
                        );
                        reloadAndReopen(pcId);
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                })
                .catch(function(err) {
                    utils.showErrorMessage(err.message || 'Ошибка');
                });
        });
    }

    // ============================================================
    // МОДАЛКА: УДАЛЕНИЕ RAM / ДИСКА / МОНИТОРА
    // ============================================================
    function openRemoveComponent(pcId, type, index) {
        var labels = {
            ram: 'модуль ОЗУ',
            storage: 'накопитель',
            monitors: 'монитор',
        };
        var label = labels[type] || 'компонент';

        Swal.fire({
            title: 'Удалить ' + label + '?',
            text: 'Запись попадёт в историю.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            input: 'text',
            inputPlaceholder: 'Примечание (необязательно)',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/computers/' + pcId + '/components/remove', {
                type: type,
                index: index,
                note: (r.value || '').trim(),
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Удалено');
                    reloadAndReopen(pcId);
                } else {
                    utils.showErrorMessage(res.error);
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    }

    // ============================================================
    // МОДАЛКА: ПЕРИФЕРИЯ (замена / добавление)
    // ============================================================
    function openReplacePeripheral(pcId, key) {
        var labels = {
            speakers: 'Колонки',
            webcam: 'Веб-камера',
            headphones: 'Наушники',
            microphone: 'Микрофон',
        };

        Swal.fire({
            title: '<i class="bi bi-arrow-repeat"></i> ' +
                   (labels[key] || key),
            html:
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Модель *</label>' +
                '<input id="cc-periph-model" class="form-control" ' +
                'placeholder="Например: Logitech C920"></div>' +
                '<div class="mb-2"><label class="form-label">' +
                'Примечание</label>' +
                '<textarea id="cc-periph-note" class="form-control" rows="2">' +
                '</textarea></div>' +
                '</div>',
            width: 520,
            showCancelButton: true,
            confirmButtonText: 'Сохранить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                var model = ($('#cc-periph-model').val() || '').trim();
                if (!model) {
                    Swal.showValidationMessage('Введите модель');
                    return false;
                }
                return {
                    model: model,
                    note: ($('#cc-periph-note').val() || '').trim(),
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/computers/' + pcId + '/components/replace', {
                type: key,
                value: { model: r.value.model },
                note: r.value.note,
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Сохранено');
                    reloadAndReopen(pcId);
                } else {
                    utils.showErrorMessage(res.error);
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    }

    function openRemovePeripheral(pcId, key) {
        Swal.fire({
            title: 'Удалить периферию?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-trash"></i> Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            input: 'text',
            inputPlaceholder: 'Примечание (необязательно)',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.post('/api/computers/' + pcId + '/components/remove', {
                type: key,
                note: (r.value || '').trim(),
            }).then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage('Удалено');
                    reloadAndReopen(pcId);
                } else {
                    utils.showErrorMessage(res.error);
                }
            }).catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
        });
    }

    // ============================================================
    // ПЕРЕЗАГРУЗКА КАБИНЕТА И ПЕРЕОТКРЫТИЕ КАРТОЧКИ
    // ============================================================
    function reloadAndReopen(pcId) {
        var cab = window.App.Cabinet;
        if (cab && typeof cab.reload === 'function') {
            Promise.resolve(cab.reload()).then(function() {
                var freshPc = cab.data && cab.data.computers
                    ? cab.data.computers.find(function(p) { return p.id === pcId; })
                    : null;
                if (freshPc) {
                    Swal.close();
                    setTimeout(function() {
                        show(freshPc, cab.data.cabinet);
                    }, 200);
                } else {
                    Swal.close();
                }
            });
        } else {
            Swal.close();
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.show = show;

    window.openComputerCard = show;

    console.log('[computer_card] Загружено');
})();