// static/js/cabinet_documents.js
// Документы ПО + печать карточки кабинета.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[cabinet_documents] App не инициализирован');
        return;
    }

    const api = window.App.api;
    const utils = window.App.utils;

    const Docs = window.App.CabinetDocuments =
        window.App.CabinetDocuments || {};

    function Cabinet() { return window.App.Cabinet; }

    // ============================================================
    // СЕКЦИЯ: ДОКУМЕНТЫ ПО
    // ============================================================
    Docs.renderSection = function(documents) {
        let html = '<div class="eq-section">';
        html += '<div class="eq-section-header">';
        html += '<h6 class="eq-section-title">' +
                '<i class="bi bi-file-earmark-text"></i> Документы ПО ' +
                '<span class="badge bg-secondary">' + documents.length + '</span></h6>';
        if (Cabinet().canEdit()) {
            html += '<button class="btn btn-sm btn-success" ' +
                    'onclick="showUploadDocument()">' +
                    '<i class="bi bi-upload"></i> Загрузить</button>';
        }
        html += '</div>';
        html += '<div class="eq-section-body">';

        if (documents.length === 0) {
            html += '<div class="eq-empty">' +
                    '<i class="bi bi-file-earmark-text"></i>' +
                    'Документов нет</div>';
        } else {
            // Группировка по software_name
            const grouped = {};
            documents.forEach(function(d) {
                const key = d.software_name || 'Прочее';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(d);
            });

            Object.keys(grouped).sort().forEach(function(swName) {
                html += '<div class="eq-doc-group">';
                html += '<div class="eq-doc-group-title">' +
                        '<i class="bi bi-window"></i> ' +
                        utils.escapeHtml(swName) + '</div>';
                grouped[swName].forEach(function(doc) {
                    html += renderDocument(doc);
                });
                html += '</div>';
            });
        }

        html += '</div></div>';
        return html;
    };

    function renderDocument(doc) {
        const ext = (doc.original_name || '').split('.').pop().toLowerCase();
        let icon = 'bi-file-earmark';
        if (ext === 'pdf') icon = 'bi-file-earmark-pdf';
        else if (['doc','docx'].indexOf(ext) !== -1) icon = 'bi-file-earmark-word';
        else if (['xls','xlsx','csv'].indexOf(ext) !== -1) icon = 'bi-file-earmark-excel';
        else if (['png','jpg','jpeg','gif','webp','bmp'].indexOf(ext) !== -1) {
            icon = 'bi-file-earmark-image';
        }
        else if (['zip','rar','7z','tar','gz'].indexOf(ext) !== -1) {
            icon = 'bi-file-earmark-zip';
        }

        const sizeText = doc.file_size ? utils.formatSize(doc.file_size) : '';
        const exists = doc.file_exists !== false;

        let actions = '<div class="eq-doc-actions">';
        if (exists) {
            actions += '<a class="btn btn-sm btn-outline-primary" ' +
                'href="/api/documents/' + doc.id + '/download" ' +
                'title="Скачать"><i class="bi bi-download"></i></a>';
        }
        if (Cabinet().canEdit()) {
            actions += '<button class="btn btn-sm btn-outline-danger" ' +
                'onclick="deleteDocument(' + doc.id + ')" ' +
                'title="Удалить"><i class="bi bi-trash"></i></button>';
        }
        actions += '</div>';

        return '<div class="eq-doc-item' +
            (exists ? '' : ' eq-doc-missing') + '">' +
            '<div class="eq-doc-icon"><i class="bi ' + icon + '"></i></div>' +
            '<div class="eq-doc-info">' +
            '<div class="eq-doc-name" title="' +
            utils.escapeHtml(doc.original_name) + '">' +
            utils.escapeHtml(doc.original_name) + '</div>' +
            '<div class="eq-doc-meta">' + sizeText +
            (doc.uploaded_by_name
                ? ' · ' + utils.escapeHtml(doc.uploaded_by_name) : '') +
            (doc.uploaded_at
                ? ' · ' + utils.formatDate(doc.uploaded_at) : '') +
            '</div></div>' + actions + '</div>';
    }

    // ============================================================
    // ЗАГРУЗКА ДОКУМЕНТА
    // ============================================================
    function showUploadDocument() {
        let swOptions = '<option value="">— без привязки к ПО —</option>';
        (Cabinet().software || []).forEach(function(a) {
            swOptions += '<option value="' + utils.escapeHtml(a.name) + '">' +
                utils.escapeHtml(a.name) +
                (a.type ? ' (' + utils.escapeHtml(a.type) + ')' : '') +
                '</option>';
        });

        Swal.fire({
            title: '<i class="bi bi-upload"></i> Загрузить документ',
            html:
                '<div class="text-start">' +
                '<div class="mb-3">' +
                '<label class="form-label">Программное обеспечение</label>' +
                '<select id="doc-sw" class="form-select">' + swOptions + '</select>' +
                '<small class="text-muted">Можно не привязывать</small></div>' +
                '<div class="mb-3">' +
                '<label class="form-label">Файл</label>' +
                '<input type="file" id="doc-file" class="form-control" ' +
                'accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,' +
                '.png,.jpg,.jpeg,.gif,.webp,.bmp,.zip,.rar,.7z">' +
                '<small class="text-muted">PDF, DOC, XLS, изображения, архивы. ' +
                'Макс. 20 МБ.</small></div>' +
                '</div>',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-upload"></i> Загрузить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#0d6efd',
            customClass: { popup: 'swal-wide' },
            preConfirm: function() {
                const f = document.getElementById('doc-file');
                if (!f || !f.files || !f.files[0]) {
                    Swal.showValidationMessage('Выберите файл');
                    return false;
                }
                return {
                    file: f.files[0],
                    software_name: Cabinet().getVal('doc-sw'),
                };
            },
        }).then(function(result) {
            if (!result.isConfirmed) return;

            const fd = new FormData();
            fd.append('file', result.value.file);
            fd.append('software_name', result.value.software_name);

            Swal.fire({
                title: 'Загрузка...',
                html: 'Загрузка файла <strong>' +
                      utils.escapeHtml(result.value.file.name) + '</strong>',
                allowOutsideClick: false,
                didOpen: function() { Swal.showLoading(); },
            });

            api.upload('/api/cabinets/' + Cabinet().currentId + '/documents', fd)
                .then(function(data) {
                    Swal.close();
                    if (data.success) {
                        utils.showSuccessMessage('Документ загружен');
                        Cabinet().reload();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                })
                .catch(function(err) {
                    Swal.close();
                    utils.showErrorMessage(err.message || 'Ошибка загрузки');
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
            confirmButtonColor: '#dc3545',
        }).then(function(r) {
            if (!r.isConfirmed) return;
            api.delete('/api/documents/' + docId)
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
    // ПЕЧАТЬ КАРТОЧКИ КАБИНЕТА
    // ============================================================
    function printCabinet() {
        if (!Cabinet().currentId) {
            utils.showErrorMessage('Кабинет не открыт');
            return;
        }

        Swal.fire({
            title: 'Подготовка к печати...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.get('/api/cabinets/' + Cabinet().currentId + '/print-data')
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
                console.error('[cabinet_documents] print error:', err);
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
        const cab = data.cabinet || {};
        const pcs = data.computers || [];
        const licenses = data.licenses || [];
        const printers = data.printers || [];
        const network = data.network || [];
        const documents = data.documents || [];
        const printDate = data.print_date || '';

        const w = window.open('', '_blank', 'width=1000,height=800');
        if (!w) {
            utils.showErrorMessage('Разрешите всплывающие окна для печати');
            return;
        }

        function esc(s) { return escapeForPrint(s); }

        let html = '<!DOCTYPE html><html lang="ru"><head>';
        html += '<meta charset="UTF-8">';
        html += '<title>Карточка кабинета ' + esc(cab.cabinet_number) + '</title>';
        html += '<style>';
        html += '*{margin:0;padding:0;box-sizing:border-box}';
        html += 'body{font-family:"Times New Roman",serif;font-size:12pt;';
        html += 'padding:20px 30px;color:#000;background:#fff}';
        html += 'h1{font-size:18pt;text-align:center;margin-bottom:6px}';
        html += 'h2{font-size:14pt;margin:20px 0 10px;border-bottom:2px solid #000;padding-bottom:4px}';
        html += 'h3{font-size:12pt;margin:12px 0 6px}';
        html += '.header-info{text-align:center;margin-bottom:20px;font-size:10pt;color:#555}';
        html += '.meta-block{display:flex;justify-content:space-between;flex-wrap:wrap;';
        html += 'gap:20px;margin-bottom:20px;padding:10px 15px;border:1px solid #999;background:#f9f9f9}';
        html += '.meta-item{min-width:180px}';
        html += '.meta-item strong{display:block;font-size:9pt;text-transform:uppercase;color:#666}';
        html += '.meta-item span{font-size:12pt}';
        html += 'table{width:100%;border-collapse:collapse;margin-bottom:15px;font-size:10pt}';
        html += 'th,td{border:1px solid #000;padding:6px 8px;text-align:left;vertical-align:top}';
        html += 'th{background:#e8e8e8;font-weight:bold}';
        html += 'tr:nth-child(even) td{background:#fafafa}';
        html += '.footer{margin-top:30px;text-align:center;font-size:9pt;color:#666;border-top:1px dashed #999;padding-top:10px}';
        html += '.no-data{text-align:center;color:#888;font-style:italic;padding:15px;font-size:10pt}';
        html += '.print-btn{position:fixed;top:10px;right:10px;padding:10px 20px;';
        html += 'background:#667eea;color:white;border:none;border-radius:6px;font-size:14pt;cursor:pointer}';
        html += '@media print{body{padding:0;font-size:11pt}.print-btn{display:none!important}';
        html += 'h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}';
        html += '</style></head><body>';

        html += '<button class="print-btn" onclick="window.print()">🖨️ Печать</button>';

        html += '<h1>Карточка кабинета ' + esc(cab.cabinet_number) + '</h1>';
        html += '<div class="header-info">Сформировано: ' + esc(printDate) + '</div>';

        // Инфо
        html += '<div class="meta-block">';
        if (cab.floor) html += '<div class="meta-item"><strong>Этаж</strong><span>' + esc(cab.floor) + '</span></div>';
        if (cab.building) html += '<div class="meta-item"><strong>Корпус</strong><span>' + esc(cab.building) + '</span></div>';
        if (cab.description) html += '<div class="meta-item"><strong>Назначение</strong><span>' + esc(cab.description) + '</span></div>';
        if (cab.responsible_person) html += '<div class="meta-item"><strong>Ответственный</strong><span>' + esc(cab.responsible_person) + '</span></div>';
        if (cab.phone) html += '<div class="meta-item"><strong>Телефон</strong><span>' + esc(cab.phone) + '</span></div>';
        html += '</div>';

        // Сводка
        html += '<h2>Сводка</h2><table>';
        html += '<tr><th style="width:60%">Показатель</th><th>Количество</th></tr>';
        html += '<tr><td>Компьютеров</td><td><strong>' + pcs.length + '</strong></td></tr>';
        html += '<tr><td>Принтеров</td><td><strong>' + printers.length + '</strong></td></tr>';
        html += '<tr><td>Сетевых устройств</td><td><strong>' + network.length + '</strong></td></tr>';
        html += '<tr><td>Наименований ПО (лицензий)</td><td><strong>' + licenses.length + '</strong></td></tr>';
        html += '<tr><td>Документов ПО</td><td><strong>' + documents.length + '</strong></td></tr>';
        html += '</table>';

        // ПК
        html += '<h2>Компьютеры (' + pcs.length + ')</h2>';
        if (pcs.length === 0) {
            html += '<div class="no-data">Нет компьютеров</div>';
        } else {
            pcs.forEach(function(p, idx) {
                html += '<h3>' + (idx + 1) + '. ' + esc(p.name || 'Без названия') + '</h3>';
                html += '<table>';
                html += '<tr><th style="width:30%">Параметр</th><th>Значение</th></tr>';
                if (p.inventory_number) html += '<tr><td>Инв. номер</td><td>' + esc(p.inventory_number) + '</td></tr>';
                if (p.ip_address) html += '<tr><td>IP-адрес</td><td>' + esc(p.ip_address) + '</td></tr>';
                if (p.motherboard) {
                    let mb = esc(p.motherboard);
                    if (p.motherboard_socket) mb += ' (сокет: ' + esc(p.motherboard_socket) + ')';
                    html += '<tr><td>Материнская плата</td><td>' + mb + '</td></tr>';
                }
                if (p.cpu) html += '<tr><td>Процессор</td><td>' + esc(p.cpu) + '</td></tr>';
                if (p.ram && p.ram.length > 0) {
                    const ramText = p.ram.map(function(r) {
                        return esc((r.size || '') + ' ' + (r.type || ''));
                    }).join(', ');
                    html += '<tr><td>ОЗУ</td><td>' + ramText + '</td></tr>';
                }
                if (p.storage && p.storage.length > 0) {
                    const stText = p.storage.map(function(s) {
                        return esc((s.capacity || '') + ' ' + (s.type || ''));
                    }).join(', ');
                    html += '<tr><td>Диски</td><td>' + stText + '</td></tr>';
                }
                if (p.software && p.software.length > 0) {
                    const swList = p.software.map(function(s) {
                        return esc(s);
                    }).join('<br>');
                    html += '<tr><td>Установленное ПО</td><td>' + swList + '</td></tr>';
                }
                if (p.notes) html += '<tr><td>Примечание</td><td>' + esc(p.notes) + '</td></tr>';
                html += '</table>';
            });
        }

        // ПО
        html += '<h2>Программное обеспечение и лицензии (' + licenses.length + ')</h2>';
        if (licenses.length === 0) {
            html += '<div class="no-data">Нет данных о ПО</div>';
        } else {
            html += '<table>';
            html += '<tr><th style="width:50%">Наименование ПО</th><th style="width:30%">Тип лицензии</th><th>Примечание</th></tr>';
            licenses.forEach(function(l) {
                html += '<tr>' +
                    '<td>' + esc(l.software_name || '—') + '</td>' +
                    '<td>' + esc(l.license_type || '—') + '</td>' +
                    '<td>' + esc(l.notes || '—') + '</td></tr>';
            });
            html += '</table>';
        }

        // Принтеры
        if (printers.length > 0) {
            html += '<h2>Принтеры (' + printers.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>Модель</th><th>Тип</th><th>Картридж</th><th>Инв. номер</th><th>IP / Подключен к</th></tr>';
            printers.forEach(function(pr) {
                const connType = pr.connection_type || 'network';
                const connLabel = connType === 'network' ? 'Сетевой' : 'USB';
                const connTarget = connType === 'network'
                    ? (pr.ip_address || '—')
                    : (pr.connected_to_pc_id ? ('ПК #' + pr.connected_to_pc_id) : '—');
                html += '<tr>' +
                    '<td>' + esc(pr.model || '—') + '</td>' +
                    '<td>' + connLabel + '</td>' +
                    '<td>' + esc(pr.cartridge || '—') + '</td>' +
                    '<td>' + esc(pr.inventory_number || '—') + '</td>' +
                    '<td>' + esc(connTarget) + '</td></tr>';
            });
            html += '</table>';
        }

        // Сеть
        if (network.length > 0) {
            html += '<h2>Сетевое оборудование (' + network.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>Тип</th><th>Модель</th><th>Инв. номер</th><th>IP-адрес</th></tr>';
            network.forEach(function(n) {
                html += '<tr>' +
                    '<td>' + esc(n.device_type || '—') + '</td>' +
                    '<td>' + esc(n.model || '—') + '</td>' +
                    '<td>' + esc(n.inventory_number || '—') + '</td>' +
                    '<td>' + esc(n.ip_address || '—') + '</td></tr>';
            });
            html += '</table>';
        }

        // Документы
        if (documents.length > 0) {
            html += '<h2>Документы ПО (' + documents.length + ')</h2>';
            html += '<table>';
            html += '<tr><th>ПО</th><th>Файл</th><th>Загружено</th></tr>';
            documents.forEach(function(d) {
                html += '<tr>' +
                    '<td>' + esc(d.software_name || '—') + '</td>' +
                    '<td>' + esc(d.original_name || '—') + '</td>' +
                    '<td>' + esc(d.uploaded_at ? utils.formatDate(d.uploaded_at) : '—') + '</td></tr>';
            });
            html += '</table>';
        }

        html += '<div class="footer">Support Active — Система управления заявками</div>';
        html += '</body></html>';

        w.document.open();
        w.document.write(html);
        w.document.close();

        setTimeout(function() {
            try { w.focus(); } catch (e) {}
            setTimeout(function() {
                try { if (!w.closed) w.print(); } catch (e) {}
            }, 400);
        }, 200);
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    const mod = window.App.register('CabinetDocumentsAPI');
    mod.renderSection = Docs.renderSection;
    mod.print = printCabinet;

    window.showUploadDocument = showUploadDocument;
    window.deleteDocument = deleteDocument;
    window.printCabinet = printCabinet;

    console.log('[cabinet_documents] Загружено');
})();