// static/js/dev/dev_console_logs.js
// Вкладка «Логи».

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    var currentLogName = null;

    DC.loadLogsList = function() {
        api.get('/api/dev/logs')
            .then(function(d) {
                if (d.error) {
                    $('#logs-list').html(
                        '<div class="p-3 text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var files = d.files || [];
                if (files.length === 0) {
                    $('#logs-list').html(
                        '<div class="p-3 text-muted">Логов нет</div>'
                    );
                    return;
                }

                var html = '<div class="list-group list-group-flush">';
                files.forEach(function(f) {
                    var isActive = (f.name === currentLogName);
                    html += '<a href="#" class="list-group-item list-group-item-action' +
                        (isActive ? ' active' : '') + '" ' +
                        'data-log-name="' + utils.escapeHtml(f.name) + '" ' +
                        'onclick="DevConsole.selectLog(\'' +
                        utils.escapeHtml(f.name) + '\'); return false;">' +
                        '<div class="d-flex justify-content-between">' +
                        '<div><i class="bi bi-file-text"></i> <strong>' +
                        utils.escapeHtml(f.name) + '</strong></div>' +
                        '<small class="' + (isActive ? '' : 'text-muted') + '">' +
                        f.size_human + '</small>' +
                        '</div>' +
                        '<small class="' + (isActive ? '' : 'text-muted') + '">' +
                        utils.formatDate(f.modified_at) + '</small>' +
                        '</a>';
                });
                html += '</div>';
                $('#logs-list').html(html);

                if (!currentLogName) {
                    var preferred = files.find(function(f) {
                        return f.name === 'app.log';
                    }) || files[0];
                    if (preferred) {
                        DC.selectLog(preferred.name);
                    }
                }
            });
    };

    DC.selectLog = function(name) {
        currentLogName = name;

        $('#logs-list .list-group-item').removeClass('active');
        $('#logs-list .list-group-item[data-log-name="' +
            name.replace(/"/g, '\\"') + '"]').addClass('active');

        $('#log-title').html(
            '<i class="bi bi-file-text"></i> ' + utils.escapeHtml(name) +
            ' <a href="/api/dev/logs/' + encodeURIComponent(name) +
            '/download" class="btn btn-sm btn-outline-light ms-2" ' +
            'title="Скачать"><i class="bi bi-download"></i></a>'
        );
        $('#log-lines').show();
        DC.reloadLog();
    };

    DC.reloadLog = function() {
        if (!currentLogName) return;

        var lines = parseInt($('#log-lines').val(), 10) || 500;

        $('#log-viewer').html(
            '<div class="text-center py-4">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.get('/api/dev/logs/' + encodeURIComponent(currentLogName) +
                '?lines=' + lines)
            .then(function(d) {
                if (d.error) {
                    $('#log-viewer').html(
                        '<div class="log-hint text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var arr = d.lines || [];
                if (arr.length === 0) {
                    $('#log-viewer').html(
                        '<div class="log-hint">Файл пуст</div>'
                    );
                    return;
                }

                var startNum = (d.total_lines || arr.length) -
                    arr.length + 1;

                var html = '';

                if (d.total_lines > d.shown_lines) {
                    html += '<span class="log-hint">' +
                        '... показаны последние ' + d.shown_lines +
                        ' из ' + d.total_lines + ' строк' +
                        '</span>\n\n';
                }

                arr.forEach(function(line, i) {
                    var lineNum = startNum + i;
                    var cls = 'log-INFO';
                    if (line.indexOf('[ERROR]') !== -1) cls = 'log-ERROR';
                    else if (line.indexOf('[WARNING]') !== -1) cls = 'log-WARNING';
                    else if (line.indexOf('[DEBUG]') !== -1) cls = 'log-DEBUG';

                    var text = line.replace(/\n$/, '');
                    html += '<span class="log-line ' + cls + '">' +
                        '<span class="log-line-num">' + lineNum + '</span>' +
                        utils.escapeHtml(text) +
                        '</span>';
                });

                $('#log-viewer').html(html);
                $('#log-viewer').scrollTop($('#log-viewer')[0].scrollHeight);
            });
    };

    console.log('[dev_console_logs] Загружено');
})();