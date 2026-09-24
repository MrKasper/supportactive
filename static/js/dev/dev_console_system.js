// static/js/dev/dev_console_system.js
// Вкладка «Система».

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    DC.loadSystemInfo = function() {
        api.get('/api/dev/system-info')
            .then(function(d) {
                if (d.error) {
                    $('#sys-python').html(
                        '<div class="text-danger">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                var html = '<table class="table table-sm mb-0">';
                html += '<tr><td>Python</td><td><strong>' +
                    utils.escapeHtml(d.python.version) + '</strong></td></tr>';
                html += '<tr><td>Платформа</td><td><small>' +
                    utils.escapeHtml(d.python.platform) + '</small></td></tr>';
                html += '<tr><td>Flask</td><td>' +
                    utils.escapeHtml(d.flask.version) + '</td></tr>';
                html += '<tr><td>Debug</td><td>' +
                    (d.flask.debug ? 'Да' : 'Нет') + '</td></tr>';
                html += '<tr><td>Сессии</td><td>' +
                    utils.escapeHtml(d.flask.session_type || '—') + '</td></tr>';
                html += '<tr><td>Кеш</td><td>' +
                    utils.escapeHtml(d.flask.cache_type || '—') + '</td></tr>';
                html += '</table>';
                $('#sys-python').html(html);

                var env = '<table class="table table-sm mb-0">';
                Object.keys(d.env || {}).forEach(function(k) {
                    env += '<tr><td><code>' + utils.escapeHtml(k) +
                        '</code></td><td>' +
                        utils.escapeHtml(d.env[k]) + '</td></tr>';
                });
                env += '</table>';
                $('#sys-env').html(env);

                var pkgs = '';
                (d.packages || []).forEach(function(p) {
                    pkgs += '<tr><td>' + utils.escapeHtml(p.name) + '</td>' +
                        '<td><code>' + utils.escapeHtml(p.version) +
                        '</code></td></tr>';
                });
                if (!pkgs) {
                    pkgs = '<tr><td colspan="2" class="text-muted">' +
                        'Пакеты не найдены</td></tr>';
                }
                $('#sys-packages').html(pkgs);
            });
    };

    console.log('[dev_console_system] Загружено');
})();