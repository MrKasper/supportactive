// static/js/csrf.js
// Автоматически добавляет CSRF-токен во все POST/PUT/DELETE запросы

(function() {
    'use strict';

    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    var originalFetch = window.fetch;

    window.fetch = function(url, options) {
        options = options || {};
        var method = (options.method || 'GET').toUpperCase();

        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
            options.headers = options.headers || {};

            // Если headers — обычный объект
            if (options.headers instanceof Object && !(options.headers instanceof Headers)) {
                if (!options.headers['X-CSRFToken']) {
                    options.headers['X-CSRFToken'] = getCsrfToken();
                }
            } else if (options.headers instanceof Headers) {
                if (!options.headers.has('X-CSRFToken')) {
                    options.headers.set('X-CSRFToken', getCsrfToken());
                }
            }

            // Всегда отправляем cookies
            options.credentials = options.credentials || 'same-origin';
        }

        return originalFetch(url, options);
    };

    console.log('CSRF fetch wrapper installed');
})();