// static/js/cabinet_device_actions.js
// Действия с устройствами кабинета: удаление, ping, QR, connect,
// редактирование IP, импорт из «Картриджей», просмотр карточек.
// Экспортирует глобальные функции для onclick-обработчиков.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_device_actions] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    function Cabinet() { return window.App.Cabinet; }

    // ============================================================
    // ПРОСМОТР КАРТОЧЕК
    // ============================================================
    function viewComputer(pcId) {
        var p = Cabinet().data.computers.find(function(x) { return x.id === pcId; });
        if (!p) {
            utils.showErrorMessage('ПК не найден');
            return;
        }

        // Используем модуль карточки ПК
        if (window.App.ComputerCard &&
            typeof window.App.ComputerCard.show === 'function') {
            window.App.ComputerCard.show(p, Cabinet().data.cabinet);
        } else {
            utils.showErrorMessage('Модуль карточки ПК не загружен');
        }
    }

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
            utils.showErrorMessage('Модуль карточки принтера не загружен');
        }
    }

    // ============================================================
    // QR-КОДЫ
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
    // УДАЛЕНИЕ
    // ============================================================
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

    // ============================================================
    // ИМПОРТ ПРИНТЕРОВ ИЗ КАРТРИДЖЕЙ
    // ============================================================
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
    var mod = window.App.register('CabinetDeviceActions');
    mod.viewComputer = viewComputer;
    mod.viewPrinter = viewPrinter;
    mod.showComputerQR = showComputerQR;
    mod.showPrinterQR = showPrinterQR;
    mod.editIp = editIp;
    mod.pingPc = pingPc;
    mod.pingAllInCabinet = pingAllInCabinet;
    mod.connectPrinter = connectPrinter;
    mod.deleteNetwork = deleteNetwork;
    mod.deleteComputer = deleteComputer;
    mod.deletePrinter = deletePrinter;
    mod.importPrintersFromCartridges = importPrintersFromCartridges;

    window.viewComputer = viewComputer;
    window.viewPrinter = viewPrinter;
    window.showComputerQR = showComputerQR;
    window.showPrinterQR = showPrinterQR;
    window.editIp = editIp;
    window.pingPc = pingPc;
    window.pingAllInCabinet = pingAllInCabinet;
    window.connectPrinter = connectPrinter;
    window.deleteNetwork = deleteNetwork;
    window.deleteComputer = deleteComputer;
    window.deletePrinter = deletePrinter;
    window.importPrintersFromCartridges = importPrintersFromCartridges;

    console.log('[cabinet_device_actions] Загружено');
})();