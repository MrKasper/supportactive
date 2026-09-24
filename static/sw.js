// static/sw.js — Service Worker для Support Active PWA
const CACHE_NAME = 'support-active-v5';
const STATIC_ASSETS = [
    '/static/logo.png',
    '/static/logo.ico',
];

// ============= INSTALL =============
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
    );
    self.skipWaiting();
});

// ============= ACTIVATE =============
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

// ============= FETCH =============
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Только GET
    if (request.method !== 'GET') return;

    // API, авторизация, навигация — не перехватываем
    if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/login') ||
        url.pathname.startsWith('/logout') ||
        request.mode === 'navigate'
    ) {
        return;
    }

    // Только /static/
    if (!url.pathname.startsWith('/static/')) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request)
                .then((response) => {
                    // Кэшируем только успешные same-origin GET-ответы
                    if (response.status === 200 && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, clone))
                            .catch(() => {});
                    }
                    return response;
                })
                .catch(() => {
                    // ИСПРАВЛЕНО: не возвращаем null — отдаём 504
                    if (cached) return cached;
                    return new Response('', {
                        status: 504,
                        statusText: 'Offline',
                    });
                });
        })
    );
});

// ============= PUSH =============
self.addEventListener('push', function(event) {
    console.log('[SW] Push received');

    let data = {
        title: 'Support Active',
        body: 'Новое уведомление',
        url: '/',
        tag: 'support-active',
    };

    if (event.data) {
        try {
            data = Object.assign(data, event.data.json());
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/static/logo.png',
        badge: '/static/logo.png',
        tag: data.tag,
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: data.url || '/' },
        actions: [
            { action: 'open', title: 'Открыть' },
            { action: 'close', title: 'Закрыть' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ============= NOTIFICATION CLICK =============
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification click:', event.action);
    event.notification.close();

    if (event.action === 'close') return;

    const urlToOpen = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(windowClients) {
                for (const client of windowClients) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});