// static/js/webpush.js
// Подписка на Web Push-уведомления + подсказка для iOS

// ============= ВСПОМОГАТЕЛЬНЫЕ =============

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function isPushSupported() {
    return 'serviceWorker' in navigator &&
           'PushManager' in window &&
           'Notification' in window;
}

// Определение iOS-устройств
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Определение "установлено ли как PWA"
function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

// Safari на iOS
function isIOSSafari() {
    return isIOS() && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
}

async function isPushSubscribed() {
    if (!isPushSupported()) return false;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        return !!sub;
    } catch (e) {
        return false;
    }
}

// ============= ПОДСКАЗКА ДЛЯ IOS =============
// Показывает инструкцию «Как добавить сайт на главный экран»
function showIOSHint() {
    Swal.fire({
        icon: 'info',
        title: 'Уведомления на iPhone',
        html:
            '<div class="text-start">' +
            '<p>Чтобы получать push-уведомления на iPhone, добавьте сайт ' +
            '<strong>на главный экран</strong> (требуется iOS 16.4+):</p>' +
            '<ol class="ps-3">' +
            '<li>Нажмите кнопку <strong>«Поделиться»</strong> ' +
            '<i class="bi bi-box-arrow-up" style="color:#0d6efd;"></i> ' +
            'внизу экрана Safari.</li>' +
            '<li>Прокрутите и выберите <strong>«На экран “Домой”</strong>.</li>' +
            '<li>Нажмите <strong>«Добавить»</strong>.</li>' +
            '<li>Откройте Support Active <strong>с иконки на главном экране</strong> ' +
            'и разрешите уведомления.</li>' +
            '</ol>' +
            '<div class="alert alert-warning small mb-0 mt-3">' +
            '<i class="bi bi-exclamation-triangle"></i> ' +
            'Без добавления на главный экран push-уведомления на iPhone работать не будут.' +
            '</div>' +
            '</div>',
        confirmButtonText: 'Понятно',
        confirmButtonColor: '#0d6efd',
        customClass: { popup: 'swal-wide' }
    });
}

// ============= ПОДПИСКА =============

async function subscribeToPush() {
    // 1. iOS + Safari + НЕ standalone → показываем инструкцию
    if (isIOS() && !isStandalone()) {
        showIOSHint();
        return false;
    }

    // 2. Не поддерживается вообще
    if (!isPushSupported()) {
        Swal.fire({
            icon: 'warning',
            title: 'Не поддерживается',
            text: 'Ваш браузер не поддерживает push-уведомления.'
        });
        return false;
    }

    try {
        const reg = await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            Swal.fire({
                icon: 'info',
                title: 'Уведомления запрещены',
                text: 'Разрешите уведомления в настройках браузера для этого сайта.'
            });
            return false;
        }

        const keyResp = await fetch('/api/webpush/vapid-public-key', {
            credentials: 'same-origin'
        });
        if (!keyResp.ok) {
            throw new Error('Не удалось получить ключ сервера (проверьте, что Web Push настроен)');
        }
        const { publicKey } = await keyResp.json();

        let subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
            subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        const subJson = subscription.toJSON();
        const saveResp = await fetch('/api/webpush/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(subJson)
        });

        if (!saveResp.ok) {
            throw new Error('Не удалось сохранить подписку на сервере');
        }

        Swal.fire({
            icon: 'success',
            title: 'Уведомления включены!',
            text: 'Вы будете получать push-уведомления о новых заявках.',
            timer: 2500,
            showConfirmButton: false
        });

        updatePushButtonUI(true);
        return true;

    } catch (err) {
        console.error('[WebPush] Subscribe error:', err);
        Swal.fire({
            icon: 'error',
            title: 'Ошибка подписки',
            text: err.message || 'Не удалось подписаться на уведомления'
        });
        return false;
    }
}

// ============= ОТПИСКА =============

async function unsubscribeFromPush() {
    try {
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();
        if (!subscription) return true;

        const endpoint = subscription.endpoint;

        await fetch('/api/webpush/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ endpoint })
        });

        await subscription.unsubscribe();

        Swal.fire({
            icon: 'success',
            title: 'Уведомления отключены',
            timer: 1500,
            showConfirmButton: false
        });
        updatePushButtonUI(false);
        return true;
    } catch (e) {
        console.error('Unsubscribe error:', e);
        return false;
    }
}

// ============= ПЕРЕКЛЮЧАТЕЛЬ =============

async function togglePushNotifications() {
    // iOS + не standalone → сразу инструкция
    if (isIOS() && !isStandalone()) {
        showIOSHint();
        return;
    }

    const subscribed = await isPushSubscribed();
    if (subscribed) {
        Swal.fire({
            title: 'Отключить уведомления?',
            text: 'Вы больше не будете получать push-уведомления.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да, отключить',
            cancelButtonText: 'Отмена'
        }).then(function(result) {
            if (result.isConfirmed) unsubscribeFromPush();
        });
    } else {
        await subscribeToPush();
    }
}

// ============= UI КНОПКИ =============

function updatePushButtonUI(subscribed) {
    var $btn = $('#pushToggleBtn');
    if ($btn.length === 0) return;

    // iOS + не standalone → специальная иконка «инфо»
    if (isIOS() && !isStandalone()) {
        $btn.removeClass('btn-info btn-outline-info').addClass('btn-outline-info');
        $btn.attr('title', 'Как включить уведомления на iPhone');
        $btn.html('<i class="bi bi-info-circle"></i>');
        return;
    }

    if (subscribed) {
        $btn.removeClass('btn-outline-info').addClass('btn-info');
        $btn.attr('title', 'Уведомления включены (нажмите, чтобы отключить)');
        $btn.html('<i class="bi bi-bell-fill"></i>');
    } else {
        $btn.removeClass('btn-info').addClass('btn-outline-info');
        $btn.attr('title', 'Включить push-уведомления');
        $btn.html('<i class="bi bi-bell-slash"></i>');
    }
}

// ============= ИНИЦИАЛИЗАЦИЯ =============

async function initPushButton() {
    // На iOS в Safari (не standalone) всё равно показываем кнопку,
    // чтобы пользователь мог узнать, как включить
    if (!isPushSupported() && !isIOS()) {
        $('#pushToggleBtn').hide();
        return;
    }

    const subscribed = await isPushSubscribed();
    updatePushButtonUI(subscribed);
}

console.log('WebPush module loaded');