// static/js/equipment_lifecycle.js
// Жизненный цикл оборудования: метаданные + история событий.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[equipment_lifecycle] App не инициализирован');
        return;
    }

    var mod = window.App.register('EquipmentLifecycle');
    var http = window.App.api;
    var utils = window.App.utils;

    var STATUS_LABELS = {
        active:         { label: 'В работе',  cls: 'lc-active' },
        repair:         { label: 'В ремонте', cls: 'lc-repair' },
        reserve:        { label: 'Резерв',    cls: 'lc-reserve' },
        decommissioned: { label: 'Списано',   cls: 'lc-decommissioned' },
    };

    var EVENT_LABELS = {
        purchase:          'Покупка',
        commission:        'Ввод в эксплуатацию',
        repair:            'Ремонт',
        return_to_service: 'Возврат в работу',
        move:              'Перемещение',
        decommission:      'Списание',
        other:             'Прочее',
    };

    // ============================================================
    // ХЕЛПЕРЫ
    // ============================================================
    function statusBadge(status) {
        var s = STATUS_LABELS[status] || STATUS_LABELS.active;
        return '<span class="lc-badge ' + s.cls + '">' +
               '<i class="bi bi-circle-fill" style="font-size:7px;"></i> ' +
               utils.escapeHtml(s.label) +
               '</span>';
    }

    function eventTypeLabel(type) {
        return EVENT_LABELS[type] || type || 'Событие';
    }

    function fmtDate(s) {
        if (!s) return '—';
        return utils.formatDateOnly(s);
    }

    function canEdit() {
        if (window.App.Cabinet && typeof window.App.Cabinet.canEdit === 'function') {
            return window.App.Cabinet.canEdit();
        }
        var role = window.currentUserRole;
        return role === 'Администратор' || role === 'Техник';
    }

    // ============================================================
    // ОТКРЫТИЕ МОДАЛКИ
    // ============================================================
    function open(etype, eqId, eqName, cabinet) {
        if (!etype || !eqId) {
            utils.showErrorMessage('Оборудование не определено');
            return;
        }

        Swal.fire({
            title: 'Загрузка...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        http.get('/api/equipment/' + etype + '/' + eqId + '/lifecycle')
            .then(function(data) {
                if (data.error) {
                    Swal.close();
                    utils.showErrorMessage(data.error);
                    return;
                }
                renderModal(etype, eqId, eqName, cabinet, data);
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка загрузки');
            });
    }

    function renderModal(etype, eqId, eqName, cabinet, data) {
        var meta = data.meta || {};
        var events = data.events || [];
        var warrantyDays = data.warranty_days_left;

        var editor = canEdit();

        // -------- Метаданные --------
        var html = '<div class="text-start">';

        html += '<div class="mb-3 d-flex align-items-center gap-2 flex-wrap">';
        html += '<span class="text-muted small">Текущий статус:</span> ';
        html += statusBadge(meta.life_status || 'active');
        if (cabinet && cabinet.cabinet_number) {
            html += '<span class="badge bg-secondary ms-auto">' +
                    utils.escapeHtml(cabinet.cabinet_number) + '</span>';
        }
        html += '</div>';

        html += '<div class="lc-meta-grid">';
        html += metaItem('Дата покупки', fmtDate(meta.purchase_date));
        html += metaItem('Поставщик', meta.supplier || null);

        // Гарантия + полоска
        var warrantyHtml = '—';
        var barClass = '';
        if (meta.warranty_until) {
            warrantyHtml = fmtDate(meta.warranty_until);
            if (warrantyDays != null) {
                if (warrantyDays < 0) {
                    warrantyHtml += ' <span class="text-danger small">(истекла)</span>';
                    barClass = 'danger';
                } else if (warrantyDays <= 30) {
                    warrantyHtml += ' <span class="text-warning small">(' + warrantyDays + ' дн.)</span>';
                    barClass = 'warn';
                } else {
                    warrantyHtml += ' <span class="text-muted small">(' + warrantyDays + ' дн.)</span>';
                }
            }
        }
        html += metaItem('Гарантия до', warrantyHtml, barClass);

        html += metaItem('Введён в эксплуатацию', fmtDate(meta.commissioned_at));
        html += metaItem('Дата списания', fmtDate(meta.decommissioned_at));
        html += metaItem('Серийный номер', meta.serial_number || null);

        var costHtml = '—';
        if (meta.cost != null && meta.cost !== '') {
            costHtml = Number(meta.cost).toLocaleString('ru-RU') + ' ₽';
        }
        html += metaItem('Стоимость', costHtml);
        html += '</div>';

        // -------- События --------
        html += '<div class="section-mini-title">История событий (' + events.length + ')</div>';
        if (events.length === 0) {
            html += '<div class="empty-mini">Событий пока нет</div>';
        } else {
            html += '<div class="lc-timeline">';
            events.forEach(function(ev) {
                html += renderEvent(ev, editor);
            });
            html += '</div>';
        }

        // -------- Кнопки --------
        if (editor) {
            html += '<div class="lc-actions">';
            html += '<button type="button" class="btn btn-primary" ' +
                    'onclick="App.EquipmentLifecycle.editMeta(\'' +
                    etype + '\', ' + eqId + ')">' +
                    '<i class="bi bi-pencil"></i> Редактировать метаданные</button>';
            html += '<button type="button" class="btn btn-outline-primary" ' +
                    'onclick="App.EquipmentLifecycle.addEvent(\'' +
                    etype + '\', ' + eqId + ')" ' +
                    'id="lc-add-event-btn">' +
                    '<i class="bi bi-plus-circle"></i> Добавить событие</button>';
            html += '</div>';
        }

        html += '</div>';

        Swal.fire({
            title: '<i class="bi bi-clock-history"></i> Жизненный цикл',
            html: html,
            width: 680,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
            didOpen: function() {
                // Делегирование для кнопок удаления события
                if (editor) {
                    $(Swal.getHtmlContainer())
                        .off('click.lc-del')
                        .on('click.lc-del', '[data-lc-del]', function() {
                            var id = parseInt($(this).attr('data-lc-del'), 10);
                            deleteEvent(id, etype, eqId, eqName, cabinet);
                        });
                }
            },
        });
    }

    function metaItem(label, value, barClass) {
        var val = value;
        if (val == null || val === '') {
            val = '<span class="muted">— не указано —</span>';
        }
        var html = '<div class="lc-meta-item">' +
            '<div class="label">' + utils.escapeHtml(label) + '</div>' +
            '<div class="value">' + (val || '—') + '</div>';

        if (barClass) {
            html += '<div class="lc-warranty-bar ' + barClass + '"><span style="width:100%"></span></div>';
        }
        html += '</div>';
        return html;
    }

    function renderEvent(ev, editor) {
        var cls = 'lc-event lc-ev-' + (ev.event_type || 'other');
        var desc = ev.description || eventTypeLabel(ev.event_type);
        var metaBits = [];
        if (ev.old_status && ev.new_status && ev.old_status !== ev.new_status) {
            metaBits.push(ev.old_status + ' → ' + ev.new_status);
        }
        if (ev.user_name) metaBits.push(ev.user_name);

        return '<div class="' + cls + '">' +
            (editor
                ? '<div class="lc-event-actions">' +
                  '<button type="button" data-lc-del="' + ev.id + '" title="Удалить">' +
                  '<i class="bi bi-trash"></i></button></div>'
                : '') +
            '<div class="lc-event-head">' +
            '<span class="lc-event-type">' +
            utils.escapeHtml(eventTypeLabel(ev.event_type)) + '</span>' +
            '<span class="lc-event-date">' +
            fmtDate(ev.event_date) + '</span>' +
            '</div>' +
            (desc
                ? '<div class="lc-event-desc">' +
                  utils.escapeHtml(desc) + '</div>'
                : '') +
            (metaBits.length
                ? '<div class="lc-event-meta">' +
                  metaBits.map(utils.escapeHtml).join(' · ') +
                  '</div>'
                : '') +
            '</div>';
    }

    // ============================================================
    // РЕДАКТИРОВАНИЕ МЕТАДАННЫХ
    // ============================================================
    function editMeta(etype, eqId) {
        http.get('/api/equipment/' + etype + '/' + eqId + '/lifecycle')
            .then(function(data) {
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }
                var meta = data.meta || {};

                var statusOpts = Object.keys(STATUS_LABELS).map(function(k) {
                    return '<option value="' + k + '"' +
                        (k === (meta.life_status || 'active') ? ' selected' : '') +
                        '>' + STATUS_LABELS[k].label + '</option>';
                }).join('');

                var html =
                    '<div class="text-start">' +
                    '<div class="row g-2">' +

                    '<div class="col-md-6"><label class="form-label">Статус</label>' +
                    '<select id="lc-status" class="form-select">' +
                    statusOpts + '</select></div>' +

                    '<div class="col-md-6"><label class="form-label">Серийный номер</label>' +
                    '<input id="lc-serial" class="form-control" value="' +
                    utils.escapeHtml(meta.serial_number || '') + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Дата покупки</label>' +
                    '<input type="date" id="lc-purchase" class="form-control" value="' +
                    utils.escapeHtml((meta.purchase_date || '').substring(0, 10)) + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Гарантия до</label>' +
                    '<input type="date" id="lc-warranty" class="form-control" value="' +
                    utils.escapeHtml((meta.warranty_until || '').substring(0, 10)) + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Введён в эксплуатацию</label>' +
                    '<input type="date" id="lc-commission" class="form-control" value="' +
                    utils.escapeHtml((meta.commissioned_at || '').substring(0, 10)) + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Дата списания</label>' +
                    '<input type="date" id="lc-decommission" class="form-control" value="' +
                    utils.escapeHtml((meta.decommissioned_at || '').substring(0, 10)) + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Поставщик</label>' +
                    '<input id="lc-supplier" class="form-control" value="' +
                    utils.escapeHtml(meta.supplier || '') + '"></div>' +

                    '<div class="col-md-6"><label class="form-label">Стоимость, ₽</label>' +
                    '<input type="number" step="0.01" id="lc-cost" class="form-control" value="' +
                    (meta.cost != null && meta.cost !== '' ? meta.cost : '') + '"></div>' +

                    '</div></div>';

                Swal.fire({
                    title: '<i class="bi bi-pencil-square"></i> Метаданные',
                    html: html,
                    width: 680,
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#4e73df',
                    customClass: { popup: 'swal-wide' },
                    preConfirm: function() {
                        return {
                            life_status:       $('#lc-status').val(),
                            serial_number:     ($('#lc-serial').val() || '').trim(),
                            purchase_date:     $('#lc-purchase').val() || null,
                            warranty_until:    $('#lc-warranty').val() || null,
                            commissioned_at:   $('#lc-commission').val() || null,
                            decommissioned_at: $('#lc-decommission').val() || null,
                            supplier:          ($('#lc-supplier').val() || '').trim(),
                            cost:              $('#lc-cost').val() || null,
                        };
                    },
                }).then(function(r) {
                    if (!r.isConfirmed) return;
                    saveMeta(etype, eqId, r.value);
                });
            });
    }

    function saveMeta(etype, eqId, payload) {
        Swal.fire({
            title: 'Сохранение...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        http.put('/api/equipment/' + etype + '/' + eqId + '/lifecycle', payload)
            .then(function(res) {
                Swal.close();
                if (res.success) {
                    utils.showSuccessMessage('Сохранено');
                    reloadCabinetIfVisible();
                } else {
                    utils.showErrorMessage(res.error || 'Ошибка');
                }
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка');
            });
    }

    // ============================================================
    // СОБЫТИЯ
    // ============================================================
    function addEvent(etype, eqId) {
        var typeOpts = Object.keys(EVENT_LABELS).map(function(k) {
            return '<option value="' + k + '">' +
                   utils.escapeHtml(EVENT_LABELS[k]) + '</option>';
        }).join('');

        var statusOpts = '<option value="">— не менять —</option>' +
            Object.keys(STATUS_LABELS).map(function(k) {
                return '<option value="' + k + '">' +
                       utils.escapeHtml(STATUS_LABELS[k].label) + '</option>';
            }).join('');

        var today = new Date().toISOString().substring(0, 10);

        var html =
            '<div class="text-start">' +
            '<div class="mb-2"><label class="form-label">Тип события *</label>' +
            '<select id="lc-ev-type" class="form-select">' + typeOpts + '</select></div>' +

            '<div class="mb-2"><label class="form-label">Дата</label>' +
            '<input type="date" id="lc-ev-date" class="form-control" value="' + today + '"></div>' +

            '<div class="mb-2"><label class="form-label">Новый статус оборудования</label>' +
            '<select id="lc-ev-status" class="form-select">' + statusOpts + '</select>' +
            '<small class="text-muted">Если выбрать — статус оборудования изменится.</small></div>' +

            '<div class="mb-2"><label class="form-label">Описание</label>' +
            '<textarea id="lc-ev-desc" class="form-control" rows="2" ' +
            'placeholder="Например: замена вентилятора"></textarea></div>' +
            '</div>';

        Swal.fire({
            title: '<i class="bi bi-plus-circle"></i> Новое событие',
            html: html,
            width: 560,
            showCancelButton: true,
            confirmButtonText: 'Добавить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: function() {
                return {
                    event_type: $('#lc-ev-type').val(),
                    event_date: $('#lc-ev-date').val() || null,
                    new_status: $('#lc-ev-status').val() || null,
                    description: ($('#lc-ev-desc').val() || '').trim(),
                };
            },
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/equipment/' + etype + '/' + eqId + '/events', r.value)
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage('Событие добавлено');
                        reloadCabinetIfVisible();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
        });
    }

    function deleteEvent(eventId, etype, eqId, eqName, cabinet) {
        Swal.fire({
            title: 'Удалить событие?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/equipment/events/' + eventId)
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage('Удалено');
                        // Переоткрываем модалку
                        open(etype, eqId, eqName, cabinet);
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
        });
    }

    // ============================================================
    // БЫСТРАЯ ИНТЕГРАЦИЯ (кнопка в карточке устройства)
    // ============================================================
    function openForComputer(pc, cabinet) {
        open('computer', pc.id, pc.name || 'ПК', cabinet);
    }

    function openForPrinter(pr, cabinet) {
        open('printer', pr.id, pr.model || 'Принтер', cabinet);
    }

    function reloadCabinetIfVisible() {
        if (window.App.Cabinet &&
            typeof window.App.Cabinet.reload === 'function' &&
            $('#otherPagesBlock').is(':visible')) {
            window.App.Cabinet.reload();
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.open = open;
    mod.editMeta = editMeta;
    mod.addEvent = addEvent;
    mod.openForComputer = openForComputer;
    mod.openForPrinter = openForPrinter;
    mod.statusBadge = statusBadge;

    window.openEquipmentLifecycle = open;

    console.log('[equipment_lifecycle] Загружено');
})();