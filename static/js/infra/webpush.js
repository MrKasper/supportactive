// static/js/webpush.js
// Web Push + подсказка для iOS.
//
// ⚠️ На iOS push-уведомления работают ТОЛЬКО:
//   1. iOS 16.4+
//   2. Сайт добавлен на «Домой»
//   3. Открыт из PWA-иконки (не из Safari)

(function() {
    'use strict';

    if (!window.App) {
        console.error('[webpush] App не инициализирован');
        return;
    }

    var mod = window.App.register('WebPush');

    // ============================================================
    // ВСПОМОГАТЕЛЬНЫЕ
    // ============================================================
    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        var base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function isPushSupported() {
        return 'serviceWorker' in navigator &&
               'PushManager' in window &&
               'Notification' in window;
    }

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) &&
               !window.MSStream;
    }

    function isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    function isIOSSafari() {
        return isIOS() &&
               /^((?!chrome|android|crios|fxios).)*safari/i
                   .test(navigator.userAgent);
    }

    function isPushSubscribed() {
        if (!isPushSupported()) return Promise.resolve(false);
        return navigator.serviceWorker.ready
            .then(function(reg) {
                return reg.pushManager.getSubscription();
            })
            .then(function(sub) { return !!sub; })
            .catch(function() { return false; });
    }

    // ============================================================
    // ПОДСКАЗКА ДЛЯ iOS
    // ============================================================
    function showIOSHint() {
        Swal.fire({
            icon: 'info',
            title: 'Уведомления на iPhone',
            html:
                '<div class="text-start">' +
                '<p>Чтобы получать push-уведомления на iPhone, ' +
                'добавьте сайт <strong>на главный экран</strong> ' +
                '(требуется iOS 16.4+):</p>' +
                '<ol class="ps-3">' +
                '<li>Нажмите кнопку <strong>«Поделиться»</strong> ' +
                '<i class="bi bi-box-arrow-up" style="color:#0d6efd;"></i> ' +
                'внизу Safari.</li>' +
                '<li>Прокрутите и выберите ' +
                '<strong>«На экран “Домой”»</strong>.</li>' +
                '<li>Нажмите <strong>«Добавить»</strong>.</li>' +
                '<li>Откройте Support Active ' +
                '<strong>с иконки на главном экране</strong> ' +
                'и разрешите уведомления.</li>' +
                '</ol>' +
                '<div class="alert alert-warning small mb-0 mt-3">' +
                '<i class="bi bi-exclamation-triangle"></i> ' +
                'В Safari на iPhone push-уведомления не работают — ' +
                'только в PWA-режиме (с иконки на «Домой»).' +
                '</div>' +
                '</div>',
            confirmButtonText: 'Понятно',
            confirmButtonColor: '#0d6efd',
            customClass: { popup: 'swal-wide' },
        });
    }

    // ============================================================
    // ПОДПИСКА
    // ============================================================
    function subscribe() {
        // iOS: проверяем standalone
        if (isIOS() && !isStandalone()) {
            showIOSHint();
            return Promise.resolve(false);
        }

        // Общая проверка поддержки
        if (!isPushSupported()) {
            Swal.fire({
                icon: 'warning',
                title: 'Не поддерживается',
                html:
                    '<div class="text-start">' +
                    '<p>Ваш браузер не поддерживает ' +
                    'push-уведомления.</p>' +
                    (isIOS()
                        ? '<p class="text-muted small mb-0">' +
                          'На iPhone push работают только при ' +
                          'добавлении сайта на главный экран ' +
                          '(iOS 16.4+). Откройте сайт в Safari → ' +
                          '«Поделиться» → «На экран Домой».</p>'
                        : '<p class="text-muted small mb-0">' +
                          'Попробуйте Chrome, Edge или Firefox.</p>') +
                    '</div>',
            });
            return Promise.resolve(false);
        }

        return navigator.serviceWorker.ready
            .then(function(reg) {
                return Notification.requestPermission()
                    .then(function(perm) {
                        if (perm !== 'granted') {
                            Swal.fire({
                                icon: 'info',
                                title: 'Уведомления запрещены',
                                text: 'Разрешите уведомления ' +
                                      'в настройках браузера.',
                            });
                            return null;
                        }
                        return reg;
                    });
            })
            .then(function(reg) {
                if (!reg) return null;

                return fetch('/api/webpush/vapid-public-key', {
                    credentials: 'same-origin',
                })
                    .then(function(r) {
                        if (!r.ok) {
                            throw new Error(
                                'Не удалось получить ключ сервера'
                            );
                        }
                        return r.json();
                    })
                    .then(function(data) {
                        return reg.pushManager
                            .getSubscription()
                            .then(function(sub) {
                                if (sub) return sub;
                                return reg.pushManager.subscribe({
                                    userVisibleOnly: true,
                                    applicationServerKey:
                                        urlBase64ToUint8Array(
                                            data.publicKey
                                        ),
                                });
                            });
                    })
                    .then(function(subscription) {
                        return fetch('/api/webpush/subscribe', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            credentials: 'same-origin',
                            body: JSON.stringify(
                                subscription.toJSON()
                            ),
                        })
                            .then(function(r) { return r.json(); })
                            .then(function(res) {
                                if (!res.success) {
                                    throw new Error(
                                        res.error || 'Ошибка сервера'
                                    );
                                }
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Уведомления включены!',
                                    timer: 2500,
                                    showConfirmButton: false,
                                });
                                updateButtonUI(true);
                                return true;
                            });
                    });
            })
            .catch(function(err) {
                console.error('[WebPush] Subscribe error:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка подписки',
                    text: err.message || 'Не удалось подписаться',
                });
                return false;
            });
    }

    // ============================================================
    // ОТПИСКА
    // ============================================================
    function unsubscribe() {
        return navigator.serviceWorker.ready
            .then(function(reg) {
                return reg.pushManager.getSubscription();
            })
            .then(function(sub) {
                if (!sub) return true;
                var endpoint = sub.endpoint;
                return fetch('/api/webpush/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ endpoint: endpoint }),
                })
                    .then(function() { return sub.unsubscribe(); })
                    .then(function() {
                        Swal.fire({
                            icon: 'success',
                            title: 'Уведомления отключены',
                            timer: 1500,
                            showConfirmButton: false,
                        });
                        updateButtonUI(false);
                        return true;
                    });
            })
            .catch(function(e) {
                console.error('Unsubscribe error:', e);
                return false;
            });
    }

    // ============================================================
    // ПЕРЕКЛЮЧАТЕЛЬ
    // ============================================================
    function toggle() {
        if (isIOS() && !isStandalone()) {
            showIOSHint();
            return;
        }

        isPushSubscribed().then(function(subscribed) {
            if (subscribed) {
                Swal.fire({
                    title: 'Отключить уведомления?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Да, отключить',
                    cancelButtonText: 'Отмена',
                }).then(function(r) {
                    if (r.isConfirmed) unsubscribe();
                });
            } else {
                subscribe();
            }
        });
    }

    // ============================================================
    // UI
    // ============================================================
    function updateButtonUI(subscribed) {
        var $btn = $('#pushToggleBtn');
        if ($btn.length === 0) return;

        if (isIOS() && !isStandalone()) {
            $btn.removeClass('btn-info btn-outline-info')
                .addClass('btn-outline-info');
            $btn.attr(
                'title',
                'Как включить уведомления на iPhone'
            );
            $btn.html('<i class="bi bi-info-circle"></i>');
            return;
        }

        if (subscribed) {
            $btn.removeClass('btn-outline-info').addClass('btn-info');
            $btn.attr(
                'title',
                'Уведомления включены (нажмите, чтобы отключить)'
            );
            $btn.html('<i class="bi bi-bell-fill"></i>');
        } else {
            $btn.removeClass('btn-info').addClass('btn-outline-info');
            $btn.attr('title', 'Включить push-уведомления');
            $btn.html('<i class="bi bi-bell-slash"></i>');
        }
    }

    function initButton() {
        if (!isPushSupported() && !isIOS()) {
            $('#pushToggleBtn').hide();
            return;
        }
        isPushSubscribed().then(function(subscribed) {
            updateButtonUI(subscribed);
        });
    }

    // ============================================================
    // МЯГКОЕ ПРЕДЛОЖЕНИЕ
    // ============================================================
    function maybeOffer() {
        if (!isPushSupported()) return;
        if (sessionStorage.getItem('push_offer_shown') === '1') return;

        isPushSubscribed().then(function(subscribed) {
            if (subscribed) return;

            var isIOSDevice = isIOS();
            var standalone = isStandalone();
            var safari = isIOSSafari();

            if (isIOSDevice && safari && !standalone) {
                setTimeout(function() {
                    sessionStorage.setItem('push_offer_shown', '1');
                    showIOSHint();
                }, 3000);
                return;
            }

            if (Notification.permission === 'default') {
                setTimeout(function() {
                    sessionStorage.setItem('push_offer_shown', '1');
                    Swal.fire({
                        icon: 'info',
                        title: 'Включить уведомления?',
                        text: 'Получайте push-уведомления о новых ' +
                              'заявках прямо на устройство.',
                        showCancelButton: true,
                        confirmButtonText:
                            '<i class="bi bi-bell"></i> Включить',
                        cancelButtonText: 'Позже',
                        confirmButtonColor: '#0d6efd',
                    }).then(function(result) {
                        if (result.isConfirmed) subscribe();
                    });
                }, 8000);
            }
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.subscribe = subscribe;
    mod.unsubscribe = unsubscribe;
    mod.toggle = toggle;
    mod.initButton = initButton;
    mod.maybeOffer = maybeOffer;
    mod.isSupported = isPushSupported;
    mod.isSubscribed = isPushSubscribed;
    mod.showIOSHint = showIOSHint;

    // Для inline onclick
    window.togglePushNotifications = toggle;
    window.initPushButton = initButton;
    window.maybeOfferPushSubscription = maybeOffer;
    window.isPushSupported = isPushSupported;
    window.isPushSubscribed = isPushSubscribed;
    window.subscribeToPush = subscribe;
    window.unsubscribeFromPush = unsubscribe;
    window.showIOSHint = showIOSHint;

    console.log('[webpush] Загружено');
})();