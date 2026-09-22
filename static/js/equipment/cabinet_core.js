// static/js/cabinet_core.js
// Ядро страницы кабинета: состояние, загрузка, рендер, ping, DnD.
// Регистрирует App.Cabinet — общее пространство для devices/documents.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_core] App не инициализирован');
        return;
    }

    const api = window.App.api;
    const utils = window.App.utils;

    // ============================================================
    // ОБЩЕЕ СОСТОЯНИЕ (доступно другим модулям)
    // ============================================================
    const Cabinet = window.App.Cabinet = window.App.Cabinet || {};

    Cabinet.currentId = null;
    Cabinet.data = null;
    Cabinet.software = [];
    Cabinet.documents = [];
    Cabinet.pingTimer = null;
    Cabinet.sortables = {};

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    Cabinet.canEdit = function() {
        const role = window.currentUserRole;
        return role === 'Администратор' || role === 'Техник';
    };

    Cabinet.getVal = function(id) {
        const el = document.getElementById(id);
        return (el && typeof el.value === 'string') ? el.value : '';
    };

    Cabinet.getTrimmed = function(id) {
        return Cabinet.getVal(id).trim();
    };

    // ============================================================
    // ОТКРЫТИЕ
    // ============================================================
    function open(cabinetId) {
        Cabinet.currentId = cabinetId;

        const $b = $('#otherPagesBlock');
        $b.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка...</p></div>'
        );
        $('#tasksBlock').hide();
        $b.show();
        $('.sidebar .nav-link').removeClass('active');

        destroySortables();
        loadData();
        startAutoRefresh();
    }

    async function loadData() {
        try {
            const [data, software, documents] = await Promise.all([
                api.get('/api/cabinets/' + Cabinet.currentId + '/details'),
                api.get('/api/cabinets/' + Cabinet.currentId + '/available-software'),
                api.get('/api/cabinets/' + Cabinet.currentId + '/documents'),
            ]);

            if (data && data.error) {
                $('#otherPagesBlock').html(
                    '<div class="alert alert-danger">' +
                    utils.escapeHtml(data.error) + '</div>'
                );
                return;
            }

            Cabinet.data = data;
            Cabinet.software = Array.isArray(software) ? software : [];
            Cabinet.documents = Array.isArray(documents) ? documents : [];

            render();
            setTimeout(refreshPingStatuses, 500);
        } catch (err) {
            console.error('[cabinet_core] load error:', err);
            $('#otherPagesBlock').html(
                '<div class="alert alert-danger">' +
                'Не удалось загрузить кабинет</div>'
            );
        }
    }

    Cabinet.reload = loadData;

    // ============================================================
    // АВТООБНОВЛЕНИЕ ПИНГА
    // ============================================================
    function startAutoRefresh() {
        stopAutoRefresh();
        Cabinet.pingTimer = setInterval(refreshPingStatuses, 5 * 60 * 1000);
        setTimeout(refreshPingStatuses, 5000);
    }

    function stopAutoRefresh() {
        if (Cabinet.pingTimer) {
            clearInterval(Cabinet.pingTimer);
            Cabinet.pingTimer = null;
        }
    }

    async function refreshPingStatuses() {
        if (!Cabinet.currentId) return;
        if (!$('#otherPagesBlock').is(':visible')) return;

        try {
            const data = await api.get(
                '/api/cabinets/' + Cabinet.currentId + '/ping-status'
            );
            if (data.error) return;

            const pcs = data.computers || [];
            pcs.forEach(function(pc) {
                const $card = $('.eq-device[data-pc-id="' + pc.id + '"]');
                if ($card.length === 0) return;

                const $status = $card.find('[data-pc-status]');
                if (pc.status === 'online') {
                    $status.removeClass('offline').addClass('online')
                        .html('<i class="bi bi-circle-fill"></i> Онлайн');
                } else {
                    $status.removeClass('online').addClass('offline')
                        .html('<i class="bi bi-circle"></i> Офлайн');
                }

                updatePcStats($card, pc);

                if (Cabinet.data) {
                    const cached = Cabinet.data.computers.find(function(p) {
                        return p.id === pc.id;
                    });
                    if (cached) {
                        cached.status = pc.status;
                        cached.ping_count = pc.ping_count;
                        cached.ping_success_count = pc.ping_success_count;
                        cached.last_ping_at = pc.last_ping_at;
                    }
                }
            });

            if (data.last_ping_at) {
                const $hint = $('#eq-last-ping-hint');
                const hintHtml = '<i class="bi bi-clock-history"></i> ' +
                    'Последняя автопроверка: ' + utils.formatDate(data.last_ping_at);
                if ($hint.length === 0) {
                    $('.eq-grid').before(
                        '<div id="eq-last-ping-hint" ' +
                        'class="text-muted small mb-3 text-center">' +
                        hintHtml + '</div>'
                    );
                } else {
                    $hint.html(hintHtml);
                }
            }
        } catch (err) {
            console.warn('[cabinet_core] auto-refresh:', err);
        }
    }

    function updatePcStats($card, data) {
        const pingCount = data.ping_count || 0;
        const pingSuccess = data.ping_success_count || 0;
        const pingFail = pingCount - pingSuccess;
        const lastPingAt = data.last_ping_at
            ? utils.formatDate(data.last_ping_at)
            : '—';

        let $stats = $card.find('.eq-ping-stats');
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

    // ============================================================
    // РЕНДЕР
    // ============================================================
    function render() {
        const c = Cabinet.data.cabinet;
        const net = Cabinet.data.network_devices || [];
        const pcs = Cabinet.data.computers || [];
        const printers = Cabinet.data.printers || [];
        const docs = Cabinet.documents;

        let html = '';

        // Шапка
        html += '<div class="eq-header">';
        html += '<div>';
        html += '<h4><i class="bi bi-door-closed"></i> ' +
                utils.escapeHtml(c.cabinet_number || 'Кабинет') + '</h4>';
        if (c.description) {
            html += '<small style="opacity:.85">' +
                    utils.escapeHtml(c.description) + '</small>';
        }
        html += '</div>';
        html += '<div class="d-flex gap-2 flex-wrap">';
        html += '<button class="btn btn-light" ' +
                'onclick="printCabinet()" ' +
                'title="Печать карточки кабинета">' +
                '<i class="bi bi-printer"></i> Печать</button>';
        html += '<button class="btn eq-back-btn" onclick="loadCabinetsManagePage()">' +
                '<i class="bi bi-arrow-left"></i> К списку</button>';
        html += '</div></div>';

        // Инфо
        html += '<div class="eq-cabinet-info">';
        if (c.floor) html += infoBlock('Этаж', c.floor);
        if (c.building) html += infoBlock('Корпус', c.building);
        if (c.responsible_person) html += infoBlock('Ответственный', c.responsible_person);
        if (c.phone) html += infoBlock('Телефон', c.phone);
        html += '</div>';

        // KPI
        const onlineCount = pcs.filter(function(p) {
            return p.status === 'online';
        }).length;

        html += '<div class="row mb-3 g-3">';
        html += kpiCard('Сетевых устройств', net.length, 'bi-hdd-network', 'info');
        html += kpiCard(
            'Компьютеров',
            pcs.length + (onlineCount > 0
                ? ' <small style="font-size:.55em;opacity:.75">(' +
                  onlineCount + ' online)</small>'
                : ''),
            'bi-pc-display', 'primary'
        );
        html += kpiCard('Принтеров', printers.length, 'bi-printer', 'success');
        html += kpiCard('Документов ПО', docs.length, 'bi-file-earmark-text', 'warning');
        html += '</div>';

        // Секции оборудования — их рендерят соответствующие модули
        html += '<div class="eq-grid">';

        html += App.CabinetDevices.renderNetworkSection(net);
        html += App.CabinetDevices.renderComputersSection(pcs);
        html += App.CabinetDevices.renderPrintersSection(printers, pcs);
        html += App.CabinetDocuments.renderSection(docs);

        html += '</div>';

        $('#otherPagesBlock').html(html);

        if (Cabinet.canEdit()) {
            initSortables();
        }
    }

    Cabinet.render = render;

    // ============================================================
    // ХЕЛПЕРЫ РЕНДЕРА (используются модулями)
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

    Cabinet.infoBlock = infoBlock;
    Cabinet.kpiCard = kpiCard;

    // ============================================================
    // DRAG-N-DROP
    // ============================================================
    function initSortables() {
        if (typeof Sortable === 'undefined') {
            console.warn('[cabinet_core] SortableJS не загружен');
            return;
        }
        destroySortables();

        $('.eq-sortable').each(function() {
            const el = this;
            const entity = el.getAttribute('data-entity');
            if (!entity) return;

            Cabinet.sortables[entity] = Sortable.create(el, {
                animation: 150,
                handle: '.eq-drag-handle',
                ghostClass: 'eq-device-ghost',
                dragClass: 'eq-device-dragging',
                onEnd: function() {
                    const ids = Array.from(el.querySelectorAll('.eq-device'))
                        .map(function(node) {
                            return node.getAttribute('data-entity-id');
                        })
                        .filter(Boolean)
                        .map(Number);

                    api.post('/api/' + entity + '/reorder', { order: ids })
                        .then(function(res) {
                            if (res.success) {
                                utils.showSuccessMessage('Порядок сохранён');
                            } else {
                                utils.showErrorMessage(
                                    res.error || 'Не удалось сохранить порядок'
                                );
                            }
                        })
                        .catch(function() {
                            utils.showErrorMessage('Ошибка сохранения порядка');
                        });
                },
            });
        });
    }

    function destroySortables() {
        Object.keys(Cabinet.sortables).forEach(function(k) {
            try { Cabinet.sortables[k].destroy(); } catch (e) {}
        });
        Cabinet.sortables = {};
    }

    Cabinet.initSortables = initSortables;
    Cabinet.destroySortables = destroySortables;

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    const mod = window.App.register('CabinetCore');
    mod.open = open;
    mod.reload = loadData;
    mod.stopAutoRefresh = stopAutoRefresh;
    mod.refreshPingStatuses = refreshPingStatuses;

    window.openCabinetDetails = open;

    $(window).on('beforeunload', function() {
        stopAutoRefresh();
        destroySortables();
    });

    console.log('[cabinet_core] Загружено');
})();