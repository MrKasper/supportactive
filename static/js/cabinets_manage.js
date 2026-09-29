// static/js/cabinets_manage.js
// Управление кабинетами — карточками (grid).

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinets_manage] App не инициализирован');
        return;
    }

    var api = window.App.register('CabinetsManage');
    var utils = window.App.utils;

    var cabinetsCache = [];

    // ============================================================
    // ЗАГРУЗКА СТРАНИЦЫ
    // ============================================================
    function loadCabinetsManagePage() {
        var $block = $('#otherPagesBlock');

        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка кабинетов...</p>' +
            '</div>'
        );

        fetch('/api/directory/cabinets')
            .then(function(r) { return r.json(); })
            .then(function(cabinets) {
                if (cabinets.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml(cabinets.error) + '</div>');
                    return;
                }

                cabinetsCache = cabinets || [];

                // Параллельно подтягиваем статистику по каждому кабинету
                var promises = cabinetsCache.map(function(cab) {
                    return fetch('/api/cabinets/' + cab.id + '/details')
                        .then(function(r) { return r.json(); })
                        .then(function(d) {
                            return {
                                id: cab.id,
                                computers: (d.computers || []).length,
                                printers: (d.printers || []).length,
                                network: (d.network_devices || []).length,
                            };
                        })
                        .catch(function() {
                            return { id: cab.id, computers: 0, printers: 0, network: 0 };
                        });
                });

                Promise.all(promises)
                    .then(function(stats) {
                        var statsMap = {};
                        stats.forEach(function(s) { statsMap[s.id] = s; });
                        renderCards(statsMap);
                    })
                    .catch(function() {
                        renderCards({});
                    });
            })
            .catch(function(error) {
                console.error('[cabinets_manage] load error:', error);
                $block.html('<div class="alert alert-danger">Ошибка загрузки: ' +
                    utils.escapeHtml(error.message) + '</div>');
            });
    }

    // ============================================================
    // РЕНДЕР
    // ============================================================
    function renderCards(statsMap) {
        var total = cabinetsCache.length;

        var html = '';
        html += '<div class="cabinets-toolbar">';
        html += '<div class="toolbar-left">';
        html += '<div class="search-input">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
        html += '<input type="text" id="cabinetSearchInput" placeholder="Поиск по номеру, этажу, корпусу…" oninput="filterCabinetsCards()">';
        html += '</div>';
        html += '<span class="cabinets-count">Всего: <strong>' + total + '</strong></span>';
        html += '</div>';
        html += '<div class="toolbar-right">';
        html += '<button class="btn-ghost" onclick="loadCabinetsManagePage()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn-primary" onclick="showAddCabinetModal()">' +
                '<i class="bi bi-plus-circle"></i> Добавить кабинет</button>';
        html += '</div>';
        html += '</div>';

        html += '<div class="cabinets-grid" id="cabinetsGrid">';
        if (total === 0) {
            html += '<div class="cabinets-empty">' +
                    '<i class="bi bi-door-closed" style="font-size:3rem;opacity:.3;"></i>' +
                    '<p class="mt-2 mb-0">Кабинетов ещё нет</p>' +
                    '<button class="btn-primary mt-3" onclick="showAddCabinetModal()">' +
                    '<i class="bi bi-plus-circle"></i> Добавить первый</button>' +
                    '</div>';
        } else {
            cabinetsCache.forEach(function(cab) {
                var st = statsMap[cab.id] || { computers: 0, printers: 0, network: 0 };
                html += renderCabinetCard(cab, st);
            });
        }
        html += '</div>';

        $('#otherPagesBlock').html(html);
    }

    function renderCabinetCard(cab, stats) {
        var title = cab.cabinet_number || 'Без номера';

        // Подзаголовок: «IT отдел · 2 этаж · Корпус А»
        var parts = [cab.description, cab.floor, cab.building].filter(Boolean);
        var subtitle = parts.join(' · ');

        var statusBadge = cab.is_active
            ? '<span class="cabinet-card-status active">Активен</span>'
            : '<span class="cabinet-card-status inactive">Неактивен</span>';

        var statsHtml = '';
        if (stats.computers > 0) {
            statsHtml += '<span class="cabinet-card-stat">' +
                '<span class="cabinet-card-stat-icon">💻</span>' +
                '<strong>' + stats.computers + '</strong> ' +
                utils.pluralize(stats.computers, 'ПК', 'ПК', 'ПК') +
                '</span>';
        }
        if (stats.printers > 0) {
            statsHtml += '<span class="cabinet-card-stat">' +
                '<span class="cabinet-card-stat-icon">🖨️</span>' +
                '<strong>' + stats.printers + '</strong> ' +
                utils.pluralize(stats.printers, 'принтер', 'принтера', 'принтеров') +
                '</span>';
        }
        if (stats.network > 0) {
            statsHtml += '<span class="cabinet-card-stat">' +
                '<span class="cabinet-card-stat-icon">🌐</span>' +
                '<strong>' + stats.network + '</strong> ' +
                utils.pluralize(stats.network, 'сеть', 'сети', 'сетей') +
                '</span>';
        }
        if (!statsHtml) {
            statsHtml = '<span class="cabinet-card-stat cabinet-card-stat-empty">' +
                'Оборудование не добавлено</span>';
        }

        return '<div class="cabinet-card" data-cabinet-id="' + cab.id + '" ' +
            'onclick="openCabinetDetails(' + cab.id + ')">' +

            '<div class="cabinet-card-head">' +
                '<div class="cabinet-card-title">' + utils.escapeHtml(title) + '</div>' +
                statusBadge +
            '</div>' +

            (subtitle
                ? '<div class="cabinet-card-subtitle">' + utils.escapeHtml(subtitle) + '</div>'
                : '') +

            '<div class="cabinet-card-divider"></div>' +

            '<div class="cabinet-card-stats">' + statsHtml + '</div>' +

            '<div class="cabinet-card-actions">' +
                '<button type="button" class="btn-ghost" ' +
                'onclick="event.stopPropagation(); editCabinet(' + cab.id + ')" ' +
                'title="Редактировать"><i class="bi bi-pencil"></i></button>' +
                '<button type="button" class="btn-ghost danger" ' +
                'onclick="event.stopPropagation(); deleteCabinet(' + cab.id + ')" ' +
                'title="Удалить"><i class="bi bi-trash"></i></button>' +
            '</div>' +

            '</div>';
    }

    // ============================================================
    // ПОИСК / ФИЛЬТР
    // ============================================================
    function filterCabinetsCards() {
        var q = ($('#cabinetSearchInput').val() || '').toLowerCase().trim();
        var $grid = $('#cabinetsGrid');
        $grid.find('.cabinet-card').each(function() {
            var $card = $(this);
            var id = $card.data('cabinet-id');
            var cab = cabinetsCache.find(function(c) { return c.id === id; });
            if (!cab) { $card.hide(); return; }

            var haystack = [
                cab.cabinet_number, cab.floor, cab.building,
                cab.description, cab.responsible_person, cab.phone,
            ].join(' ').toLowerCase();

            $card.toggle(!q || haystack.indexOf(q) !== -1);
        });
    }

    // ============================================================
    // МОДАЛКА
    // ============================================================
    function showAddCabinetModal() {
        $('#cabinetId').val('');
        $('#cabinetNumber').val('');
        $('#cabinetFloor').val('');
        $('#cabinetBuilding').val('');
        $('#cabinetDescription').val('');
        $('#cabinetResponsible').val('');
        $('#cabinetPhone').val('');
        $('#cabinetIsActive').prop('checked', true);
        $('#cabinetActiveField').hide();

        $('#cabinetModalTitle').html(
            '<i class="bi bi-plus-circle"></i> Добавление кабинета'
        );

        if (typeof window.openModal === 'function') {
            window.openModal('cabinetEditModal');
        } else {
            $('#cabinetEditModal').modal('show');
        }
    }

    function editCabinet(cabinetId) {
        var cab = cabinetsCache.find(function(c) { return c.id === cabinetId; });
        if (!cab) { utils.showErrorMessage('Кабинет не найден'); return; }

        $('#cabinetId').val(cab.id);
        $('#cabinetNumber').val(cab.cabinet_number || '');
        $('#cabinetFloor').val(cab.floor || '');
        $('#cabinetBuilding').val(cab.building || '');
        $('#cabinetDescription').val(cab.description || '');
        $('#cabinetResponsible').val(cab.responsible_person || '');
        $('#cabinetPhone').val(cab.phone || '');
        $('#cabinetIsActive').prop('checked', cab.is_active == 1);
        $('#cabinetActiveField').show();

        $('#cabinetModalTitle').html(
            '<i class="bi bi-pencil-square"></i> Редактирование кабинета'
        );

        if (typeof window.openModal === 'function') {
            window.openModal('cabinetEditModal');
        } else {
            $('#cabinetEditModal').modal('show');
        }
    }

    function saveCabinet() {
        var form = document.getElementById('cabinetForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        var id = $('#cabinetId').val();
        var data = {
            cabinet_number: $('#cabinetNumber').val().trim(),
            floor: $('#cabinetFloor').val().trim(),
            building: $('#cabinetBuilding').val().trim(),
            description: $('#cabinetDescription').val().trim(),
            responsible_person: $('#cabinetResponsible').val().trim(),
            phone: $('#cabinetPhone').val().trim(),
            is_active: $('#cabinetIsActive').is(':checked') ? 1 : 0,
        };

        var url = id
            ? ('/api/directory/cabinets/' + id)
            : '/api/directory/cabinets';
        var method = id ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (result.success) {
                    if (typeof window.closeModal === 'function') {
                        window.closeModal('cabinetEditModal');
                    } else {
                        $('#cabinetEditModal').modal('hide');
                    }
                    Swal.fire({
                        icon: 'success', title: 'Сохранено!',
                        timer: 1500, showConfirmButton: false,
                    });
                    if (typeof loadFilters === 'function') loadFilters();
                    loadCabinetsManagePage();
                } else {
                    Swal.fire({ icon: 'error', title: 'Ошибка', text: result.error });
                }
            })
            .catch(function() {
                Swal.fire({
                    icon: 'error', title: 'Ошибка',
                    text: 'Не удалось сохранить кабинет',
                });
            });
    }

    function deleteCabinet(cabinetId) {
        var cab = cabinetsCache.find(function(c) { return c.id === cabinetId; });
        var name = cab ? cab.cabinet_number : ('#' + cabinetId);

        Swal.fire({
            title: 'Удалить кабинет?',
            html: 'Кабинет <strong>' + utils.escapeHtml(name) +
                  '</strong> и всё его оборудование будут удалены.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/directory/cabinets/' + cabinetId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({
                            icon: 'success', title: 'Кабинет удалён',
                            timer: 1500, showConfirmButton: false,
                        });
                        if (typeof loadFilters === 'function') loadFilters();
                        loadCabinetsManagePage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    api.load = loadCabinetsManagePage;
    api.showAdd = showAddCabinetModal;
    api.edit = editCabinet;
    api.save = saveCabinet;
    api.remove = deleteCabinet;
    api.filter = filterCabinetsCards;

    window.loadCabinetsManagePage = loadCabinetsManagePage;
    window.showAddCabinetModal = showAddCabinetModal;
    window.editCabinet = editCabinet;
    window.saveCabinet = saveCabinet;
    window.deleteCabinet = deleteCabinet;
    window.filterCabinetsCards = filterCabinetsCards;

    console.log('[cabinets_manage] Загружено (карточки)');
})();