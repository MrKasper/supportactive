// static/js/api.js
// Единая обёртка над fetch: авто-обработка 401/429/500, JSON.
// Использование:
//   const data = await App.api.get('/api/users');
//   const res  = await App.api.post('/api/users', {full_name: '...'});
//   const file = await App.api.upload('/api/upload_avatar', formData);
//
// ⚠️ CSRF-токен добавляется ГЛОБАЛЬНО через csrf.js, который патчит
//    window.fetch. Здесь мы это НЕ дублируем.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[api] App не инициализирован');
        return;
    }

    const DEFAULT_TIMEOUT = 30000;
    const BASE_HEADERS = {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };

    // ============================================================
    // ОБРАБОТКА ОШИБОК
    // ============================================================
    function handleUnauthorized() {
        if (window.location.pathname === '/login') return;
        console.warn('[api] 401 — перенаправление на /login');
        window.location.href = '/login';
    }

    function handleTooManyRequests(resp) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Слишком много запросов',
                text: 'Подождите немного и попробуйте снова.',
                timer: 3000,
                showConfirmButton: false,
            });
        }
        console.warn('[api] 429', resp.url);
    }

    function handleServerError(resp) {
        console.error('[api] 500', resp.url);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Ошибка сервера',
                text: 'Попробуйте позже или сообщите администратору.',
            });
        }
    }

    // ============================================================
    // ЯДРО
    // ============================================================
    async function request(url, options) {
        options = options || {};
        const method = (options.method || 'GET').toUpperCase();

        // Заголовки. CSRF добавит csrf.js (глобальный патч fetch).
        const headers = Object.assign({}, BASE_HEADERS, options.headers || {});

        // JSON-тело: если объект — сериализуем
        let body = options.body;
        if (
            body !== undefined &&
            body !== null &&
            !(body instanceof FormData) &&
            !(body instanceof Blob) &&
            !(body instanceof URLSearchParams) &&
            typeof body === 'object'
        ) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }

        // Таймаут
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            options.timeout || DEFAULT_TIMEOUT
        );

        let resp;
        try {
            resp = await fetch(url, {
                method: method,
                headers: headers,
                body: body,
                credentials: 'same-origin',
                cache: options.cache || 'no-store',
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Превышено время ожидания ответа');
            }
            console.error('[api] network error', err);
            throw new Error('Ошибка сети');
        }
        clearTimeout(timeoutId);

        // Глобальные обработчики
        if (resp.status === 401) {
            handleUnauthorized();
            throw new Error('Не авторизован');
        }
        if (resp.status === 429) {
            handleTooManyRequests(resp);
            throw new Error('Слишком много запросов');
        }
        if (resp.status >= 500) {
            handleServerError(resp);
            throw new Error('Ошибка сервера');
        }

        // Парсинг ответа
        const contentType = resp.headers.get('content-type') || '';
        let data;

        if (contentType.includes('application/json')) {
            try {
                data = await resp.json();
            } catch (e) {
                throw new Error('Некорректный JSON в ответе');
            }
        } else if (contentType.includes('text/')) {
            data = await resp.text();
        } else {
            data = await resp.blob();
        }

        // 4xx: возвращаем данные — пусть вызывающий решает
        if (!resp.ok) {
            const err = new Error(
                (data && data.error) || `HTTP ${resp.status}`
            );
            err.status = resp.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    // ============================================================
    // ПУБЛИЧНОЕ API
    // ============================================================
    const api = {
        request: request,

        get: function(url, options) {
            return request(url, Object.assign({}, options, { method: 'GET' }));
        },

        post: function(url, body, options) {
            return request(url, Object.assign({}, options, {
                method: 'POST',
                body: body,
            }));
        },

        put: function(url, body, options) {
            return request(url, Object.assign({}, options, {
                method: 'PUT',
                body: body,
            }));
        },

        delete: function(url, options) {
            return request(url, Object.assign({}, options, { method: 'DELETE' }));
        },

        upload: function(url, formData, options) {
            return request(url, Object.assign({}, options, {
                method: 'POST',
                body: formData,
                timeout: 120000, // 2 минуты на загрузку
            }));
        },
    };

    window.App.api = api;

    // Удобные глобальные алиасы (для inline onclick — если остались)
    window.apiGet = api.get;
    window.apiPost = api.post;
    window.apiPut = api.put;
    window.apiDelete = api.delete;

    console.log('[api] Загружено');
})();