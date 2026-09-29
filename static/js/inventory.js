// static/js/inventory.js
// Инвентаризация оборудования.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[inventory] App не инициализирован');
        return;
    }

    var mod = window.App.register('Inventory');
    var http = window.App.api;
    var utils = window.App.utils;

    var STATUS_LABELS = {
        pending: 'Не проверено',
        found:   'Найдено',
        missing: 'Отсутствует',
        moved:   'Перемещено',
        damaged: 'Повреждено',
        extra:   'Лишнее',
    };

    var EQ_TYPE_LABELS = {
        computer: 'ПК',
        printer:  'Принтер',
        network:  'Сеть',
    };

    var EQ_ICONS = {
        computer: 'bi-pc-display',
        printer:  'bi-printer',
        network:  'bi-hdd-network',
    };

    var sessionsCache = [];
    var currentSession = null;

    // ============================================================
    // СПИСОК СЕССИЙ
    // ============================================================
    function load() {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка сессий...</p></div>'
        );

        http.get('/api/inventory/sessions')
            .then(function(list) {
                if (!list || list.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml((list && list.error) || 'Ошибка') + '</div>');
                    return;
                }
                sessionsCache = Array.isArray(list) ? list : [];
                currentSession = null;
                renderList();
            })
            .catch(function(err) {
                $block.html('<div class="alert alert-danger">' +
                    'Ошибка: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function renderList() {
        var html = '';

        html += '<div class="mc-toolbar">';
        html += '<div>';
        html += '<span class="cabinets-count">Сессий: <strong>' +
                sessionsCache.length + '</strong></span>';
        html += '</div>';
        html += '<div class="d-flex gap-2">';
        html += '<button class="btn-ghost" onclick="App.Inventory.load()">' +
                '<i class="bi bi-arrow-clockwise"></i> Обновить</button>';
        html += '<button class="btn-primary" onclick="App.Inventory.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Новая инвентаризация</button>';
        html += '</div></div>';

        if (sessionsCache.length === 0) {
            html += '<div class="cabinets-empty">' +
                '<i class="bi bi-clipboard-check" style="font-size:3rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">Сессий ещё нет</p>' +
                '<button class="btn-primary mt-3" onclick="App.Inventory.showAdd()">' +
                '<i class="bi bi-plus-circle"></i> Создать первую</button></div>';
        } else {
            html += '<div class="cabinets-grid">';
            sessionsCache.forEach(function(s) { html += renderSessionCard(s); });
            html += '</div>';
        }

        $('#otherPagesBlock').html(html);
    }

    function renderSessionCard(s) {
        var statusMap = {
            'draft':       { label: 'Черновик', cls: 'inactive' },
            'in_progress': { label: 'В работе', cls: 'active' },
            'completed':   { label: 'Завершена', cls: 'inactive' },
        };
        var st = statusMap[s.status] || statusMap.draft;
        var statusBadge = '<span class="cabinet-card-status ' + st.cls + '">' +
                          st.label + '</span>';

        var progress = 0;
        if (s.total_items > 0) {
            progress = Math.round((s.checked_items / s.total_items) * 100);
        }

        var scopeLabel = s.scope_type === 'cabinet'
            ? 'Кабинет: ' + (s.scope_value || '—')
            : (s.scope_type === 'building'
                ? 'Корпус: ' + (s.scope_value || '—')
                : 'Всё оборудование');

        return '<div class="cabinet-card schedule-card" data-session-id="' + s.id + '">' +
            '<div class="cabinet-card-head">' +
            '<div class="cabinet-card-title">' + utils.escapeHtml(s.name) + '</div>' +
            statusBadge + '</div>' +

            '<div class="cabinet-card-subtitle">' +
            utils.escapeHtml(scopeLabel) + '</div>' +

            (s.responsible_person
                ? '<div class="schedule-meta">👤 ' +
                  utils.escapeHtml(s.responsible_person) + '</div>'
                : '') +

            '<div class="cabinet-card-divider"></div>' +

            '<div class="schedule-dates">' +
            '<div><span class="schedule-date-label">Позиций:</span> ' +
            '<strong>' + (s.total_items || 0) + '</strong>' +
            ' · проверено: ' + (s.checked_items || 0) +
            (s.issue_items > 0
                ? ' · <span class="text-danger">проблем: ' + s.issue_items + '</span>'
                : '') +
            '</div>' +
            '<div class="lc-warranty-bar ' + (progress === 100 ? '' : (progress > 50 ? 'warn' : 'danger')) + '">' +
            '<span style="width:' + progress + '%"></span></div>' +
            '<div class="mt-1"><span class="schedule-date-label">Создана:</span> ' +
            utils.formatDate(s.created_at) + '</div>' +
            '</div>' +

            '<div class="schedule-actions">' +
            '<button class="btn-ghost" onclick="App.Inventory.openSession(' + s.id + ')" title="Открыть">' +
            '<i class="bi bi-box-arrow-in-right"></i></button>' +
            '<button class="btn-ghost danger" onclick="App.Inventory.removeSession(' + s.id + ')" title="Удалить">' +
            '<i class="bi bi-trash"></i></button>' +
            '</div></div>';
    }

    // ============================================================
    // СОЗДАНИЕ СЕССИИ
    // ============================================================
    function showAdd() {
        Promise.all([
            http.get('/api/cabinets').catch(function() { return []; }),
        ]).then(function(results) {
            var cabinets = results[0] || [];
            var cabOpts = cabinets.map(function(c) {
                return '<option value="' + utils.escapeHtml(c.cabinet_number) + '">' +
                       utils.escapeHtml(c.cabinet_number +
                           (c.description ? ' — ' + c.description : '')) +
                       '</option>';
            }).join('');

            var html =
                '<div class="text-start">' +
                '<div class="mb-2"><label class="form-label">Название *</label>' +
                '<input id="inv-name" class="form-control" ' +
                'placeholder="Инвентаризация Q1 2026"></div>' +

                '<div class="mb-2"><label class="form-label">Описание</label>' +
                '<textarea id="inv-desc" class="form-control" rows="2"></textarea></div>' +

                '<div class="mb-2"><label class="form-label">Охват *</label>' +
                '<select id="inv-scope" class="form-select" ' +
                'onchange="App.Inventory.onScopeChange()">' +
                '<option value="all">Всё оборудование</option>' +
                '<option value="cabinet">Один кабинет</option>' +
                '<option value="building">Корпус целиком</option>' +
                '</select></div>' +

                '<div class="mb-2" id="inv-scope-value-wrap" style="display:none;">' +
                '<label class="form-label">Кабинет</label>' +
                '<select id="inv-scope-value" class="form-select">' +
                '<option value="">— выберите —</option>' + cabOpts + '</select></div>' +

                '<div class="mb-2"><label class="form-label">Ответственный</label>' +
                '<input id="inv-resp" class="form-control" value="' +
                utils.escapeHtml(window.currentUserFullName || '') + '"></div>' +

                '<div class="mb-2"><label class="form-label">Примечание</label>' +
                '<textarea id="inv-notes" class="form-control" rows="2"></textarea></div>' +
                '</div>';

            Swal.fire({
                title: '<i class="bi bi-clipboard-plus"></i> Новая инвентаризация',
                html: html,
                width: 560,
                showCancelButton: true,
                confirmButtonText: 'Создать',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                preConfirm: function() {
                    var name = ($('#inv-name').val() || '').trim();
                    if (!name) {
                        Swal.showValidationMessage('Введите название');
                        return false;
                    }
                    var scope = $('#inv-scope').val();
                    var scopeVal = $('#inv-scope-value').val() || '';
                    if (scope !== 'all' && !scopeVal) {
                        Swal.showValidationMessage('Укажите кабинет');
                        return false;
                    }
                    return {
                        name: name,
                        description: ($('#inv-desc').val() || '').trim(),
                        scope_type: scope,
                        scope_value: scope === 'all' ? '' : scopeVal,
                        responsible_person: ($('#inv-resp').val() || '').trim(),
                        notes: ($('#inv-notes').val() || '').trim(),
                    };
                },
            }).then(function(r) {
                if (!r.isConfirmed) return;
                http.post('/api/inventory/sessions', r.value).then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Создано');
                        load();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
            });
        });
    }

    function onScopeChange() {
        var v = $('#inv-scope').val();
        $('#inv-scope-value-wrap').toggle(v !== 'all');
    }

    // ============================================================
    // ОТКРЫТИЕ СЕССИИ (чек-лист)
    // ============================================================
    function openSession(sid) {
        var $block = $('#otherPagesBlock');
        $block.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div></div>'
        );

        http.get('/api/inventory/sessions/' + sid)
            .then(function(data) {
                if (data.error) {
                    $block.html('<div class="alert alert-danger">' +
                        utils.escapeHtml(data.error) + '</div>');
                    return;
                }
                currentSession = data;
                renderSessionPage(data.session, data.items || []);
            })
            .catch(function(err) {
                $block.html('<div class="alert alert-danger">' +
                    'Ошибка: ' + utils.escapeHtml(err.message) + '</div>');
            });
    }

    function renderSessionPage(session, items) {
        var isCompleted = session.status === 'completed';
        var isDraft = session.status === 'draft';
        var isInProgress = session.status === 'in_progress';

        var html = '';

        // Шапка
        html += '<div class="mc-toolbar">';
        html += '<div class="d-flex align-items-center gap-2 flex-wrap">';
        html += '<button class="btn-ghost" onclick="App.Inventory.load()">' +
                '<i class="bi bi-arrow-left"></i> К списку</button>';
        html += '<h5 class="mb-0 ms-2">' +
                utils.escapeHtml(session.name) + '</h5>';
        var statusLabel = session.status === 'in_progress' ? 'В работе'
            : (session.status === 'completed' ? 'Завершена' : 'Черновик');
        html += '<span class="cabinet-card-status ' +
                (session.status === 'in_progress' ? 'active' : 'inactive') +
                '">' + statusLabel + '</span>';
        html += '</div>';
        html += '<div class="d-flex gap-2">';
        if (isDraft) {
            html += '<button class="btn-primary" onclick="App.Inventory.startSession(' +
                    session.id + ')">' +
                    '<i class="bi bi-play-fill"></i> Начать</button>';
        }
        if (isInProgress) {
            html += '<button class="btn-primary" onclick="App.Inventory.finishSession(' +
                    session.id + ')">' +
                    '<i class="bi bi-check-circle"></i> Завершить</button>';
        }
        if (isCompleted) {
            html += '<button class="btn-ghost" onclick="App.Inventory.showReport(' +
                    session.id + ')">' +
                    '<i class="bi bi-file-text"></i> Отчёт</button>';
        }
        html += '</div></div>';

        // KPI
        var counts = { pending: 0, found: 0, missing: 0, moved: 0, damaged: 0, extra: 0 };
        items.forEach(function(it) { counts[it.status] = (counts[it.status] || 0) + 1; });
        var issues = counts.missing + counts.moved + counts.damaged + counts.extra;

        html += '<div class="inv-kpi-row">';
        html += kpi('Всего', items.length, 'accent');
        html += kpi('Проверено', counts.found, 'success');
        html += kpi('Ожидает', counts.pending, 'warning');
        html += kpi('Проблем', issues, 'danger');
        html += '</div>';

        // Список позиций
        if (items.length === 0) {
            html += '<div class="cabinets-empty">' +
                '<i class="bi bi-inbox" style="font-size:3rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">Нет позиций</p></div>';
        } else {
            html += '<div class="inv-items-list">';
            items.forEach(function(it) {
                html += renderItem(it, isCompleted);
            });
            html += '</div>';
        }

        $('#otherPagesBlock').html(html);
    }

    function kpi(label, value, cls) {
        return '<div class="inv-kpi k-' + cls + '">' +
            '<div class="inv-kpi-value">' + (value || 0) + '</div>' +
            '<div class="inv-kpi-label">' + label + '</div>' +
            '</div>';
    }

    function renderItem(it, isCompleted) {
        var icon = EQ_ICONS[it.equipment_type] || 'bi-box';
        var eqTypeLabel = EQ_TYPE_LABELS[it.equipment_type] || 'Оборудование';
        var readOnly = isCompleted;

        var html = '<div class="inv-item inv-status-' + it.status + '" ' +
                   'data-item-id="' + it.id + '">';

        html += '<i class="bi ' + icon + ' inv-item-icon"></i>';

        html += '<div class="inv-item-body">';
        html += '<div class="inv-item-name">' +
                utils.escapeHtml(it.equipment_name || '#' + it.equipment_id) +
                '</div>';
        html += '<div class="inv-item-meta">';
        html += '<span>' + eqTypeLabel + ' #' + it.equipment_id + '</span>';
        if (it.expected_location) {
            html += '<span>📍 ' + utils.escapeHtml(it.expected_location) + '</span>';
        }
        if (it.actual_location) {
            html += '<span>↳ ' + utils.escapeHtml(it.actual_location) + '</span>';
        }
        if (it.checked_at) {
            html += '<span>' + utils.formatDate(it.checked_at) + '</span>';
        }
        html += '</div>';
        if (it.notes) {
            html += '<div class="inv-item-meta text-muted">' +
                    utils.escapeHtml(it.notes) + '</div>';
        }
        html += '</div>';

        // Статус + действия
        if (!readOnly) {
            html += '<div class="inv-item-actions">';
            html += '<button type="button" class="inv-btn-check found" ' +
                    'title="Найдено" onclick="App.Inventory.mark(' + it.id +
                    ', \'found\')"><i class="bi bi-check-lg"></i></button>';
            html += '<button type="button" class="inv-btn-check missing" ' +
                    'title="Отсутствует" onclick="App.Inventory.mark(' + it.id +
                    ', \'missing\')"><i class="bi bi-x-lg"></i></button>';
            html += '<button type="button" class="inv-btn-check moved" ' +
                    'title="Перемещено" onclick="App.Inventory.mark(' + it.id +
                    ', \'moved\')"><i class="bi bi-arrow-left-right"></i></button>';
            html += '<button type="button" class="inv-btn-check damaged" ' +
                    'title="Повреждено" onclick="App.Inventory.mark(' + it.id +
                    ', \'damaged\')"><i class="bi bi-exclamation-triangle"></i></button>';
            html += '</div>';
        } else {
            html += '<span class="inv-status-select">' +
                    utils.escapeHtml(STATUS_LABELS[it.status] || it.status) +
                    '</span>';
        }

        html += '</div>';
        return html;
    }

    // ============================================================
    // СТАТУСЫ
    // ============================================================
    function mark(itemId, status) {
        http.post('/api/inventory/items/' + itemId + '/mark', { status: status })
            .then(function(res) {
                if (res.success) {
                    // Обновляем локально
                    if (currentSession) {
                        var it = currentSession.items.find(function(x) {
                            return x.id === itemId;
                        });
                        if (it) it.status = status;
                        renderSessionPage(currentSession.session,
                                          currentSession.items);
                    }
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
    }

    // ============================================================
    // СТАРТ / ФИНИШ / УДАЛЕНИЕ / ОТЧЁТ
    // ============================================================
    function startSession(sid) {
        http.post('/api/inventory/sessions/' + sid + '/start', {})
            .then(function(res) {
                if (res.success) {
                    utils.showSuccessMessage(res.message || 'Начато');
                    openSession(sid);
                } else {
                    utils.showErrorMessage(res.error);
                }
            });
    }

    function finishSession(sid) {
        Swal.fire({
            title: 'Завершить инвентаризацию?',
            text: 'После завершения позиции нельзя будет изменить.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Завершить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.post('/api/inventory/sessions/' + sid + '/finish', {})
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage(res.message || 'Завершено');
                        openSession(sid);
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
        });
    }

    function removeSession(sid) {
        Swal.fire({
            title: 'Удалить сессию?',
            text: 'Все позиции будут удалены безвозвратно.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            http.delete('/api/inventory/sessions/' + sid)
                .then(function(res) {
                    if (res.success) {
                        utils.showSuccessMessage('Удалено');
                        load();
                    } else {
                        utils.showErrorMessage(res.error);
                    }
                });
        });
    }

    function showReport(sid) {
        http.get('/api/inventory/sessions/' + sid + '/report')
            .then(function(data) {
                if (data.error) {
                    utils.showErrorMessage(data.error);
                    return;
                }
                renderReport(data);
            });
    }

    function renderReport(data) {
        var by = data.by_status || {};
        var issues = data.issues || [];

        var html = '<div class="text-start">';

        html += '<div class="inv-kpi-row">';
        html += kpi('Всего', data.total || 0, 'accent');
        html += kpi('Найдено', by.found || 0, 'success');
        html += kpi('Отсутствует', by.missing || 0, 'danger');
        html += kpi('Перемещено', by.moved || 0, 'warning');
        html += kpi('Повреждено', by.damaged || 0, 'danger');
        html += '</div>';

        if (issues.length > 0) {
            html += '<div class="section-mini-title">Проблемные позиции (' +
                    issues.length + ')</div>';
            html += '<div class="inv-items-list">';
            issues.forEach(function(it) {
                var icon = EQ_ICONS[it.equipment_type] || 'bi-box';
                html += '<div class="inv-item inv-status-' + it.status + '">' +
                    '<i class="bi ' + icon + ' inv-item-icon"></i>' +
                    '<div class="inv-item-body">' +
                    '<div class="inv-item-name">' +
                    utils.escapeHtml(it.equipment_name || '#' + it.equipment_id) +
                    '</div>' +
                    '<div class="inv-item-meta">' +
                    '<span>' + (STATUS_LABELS[it.status] || it.status) + '</span>' +
                    (it.expected_location
                        ? '<span>ожидалось: ' + utils.escapeHtml(it.expected_location) + '</span>'
                        : '') +
                    (it.actual_location
                        ? '<span>факт: ' + utils.escapeHtml(it.actual_location) + '</span>'
                        : '') +
                    '</div></div></div>';
            });
            html += '</div>';
        } else {
            html += '<div class="empty-mini">Расхождений нет — все позиции в порядке</div>';
        }

        html += '</div>';

        Swal.fire({
            title: '<i class="bi bi-file-text"></i> Отчёт по инвентаризации',
            html: html,
            width: 680,
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'swal-wide' },
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.load = load;
    mod.showAdd = showAdd;
    mod.onScopeChange = onScopeChange;
    mod.openSession = openSession;
    mod.startSession = startSession;
    mod.finishSession = finishSession;
    mod.removeSession = removeSession;
    mod.mark = mark;
    mod.showReport = showReport;

    window.loadInventoryPage = load;

    console.log('[inventory] Загружено');
})();