// static/sw.js — Service Worker для Support Active PWA
const CACHE_NAME = 'support-active-v1';
const STATIC_ASSETS = [
    '/static/logo.png',
    '/static/logo.ico'
];

// Установка — кешируем базовые ассеты
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
    );
    self.skipWaiting();
});

// Активация — удаляем старые кеши
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Только GET
    if (request.method !== 'GET') return;

    // API, HTML-навигация и авторизация — только сеть
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/login') ||
        url.pathname.startsWith('/logout') ||
        request.mode === 'navigate') {
        return;
    }

    // Всё, что в /static/ — cache-first
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    if (response.status === 200 && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => cached);
            })
        );
    }
});