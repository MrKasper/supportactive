// static/js/theme.js
// Управление темой (light/dark/auto).

(function() {
    'use strict';

    if (!window.App) {
        console.error('[theme] App не инициализирован');
        return;
    }

    var THEME_KEY = 'support_active_theme';
    var mod = window.App.register('Theme');

    // ============================================================
    // СИСТЕМНАЯ ТЕМА
    // ============================================================
    function getSystemTheme() {
        if (window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // ============================================================
    // ПРИМЕНЕНИЕ
    // ============================================================
    function apply(theme) {
        var actualTheme = theme === 'auto' ? getSystemTheme() : theme;

        document.documentElement.setAttribute('data-theme', actualTheme);
        document.body.classList.toggle('dark-theme', actualTheme === 'dark');

        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute(
                'content',
                actualTheme === 'dark' ? '#1c1c22' : '#4e73df'
            );
        }

        updateButtonIcon(theme);
    }

    // ============================================================
    // ИКОНКА КНОПКИ
    // ============================================================
    function updateButtonIcon(theme) {
        var $btn = $('#themeToggleBtn');
        if ($btn.length === 0) return;

        var iconMap = {
            'light': { icon: 'bi-moon', title: 'Переключить на тёмную' },
            'dark':  { icon: 'bi-sun',  title: 'Переключить на светлую' },
            'auto':  { icon: 'bi-circle-half', title: 'Автоматически (системная)' },
        };
        var info = iconMap[theme] || iconMap['auto'];
        $btn.html('<i class="bi ' + info.icon + '"></i>');
        $btn.attr('title', info.title);
    }

    // ============================================================
    // ПЕРЕКЛЮЧЕНИЕ ПО КРУГУ
    // ============================================================
    function toggle() {
        var current = 'auto';
        try {
            current = localStorage.getItem(THEME_KEY) || 'auto';
        } catch (e) {}

        var next;
        if (current === 'auto') next = 'light';
        else if (current === 'light') next = 'dark';
        else next = 'auto';

        apply(next);

        var names = {
            'light': 'Светлая',
            'dark': 'Тёмная',
            'auto': 'Автоматически',
        };

        // Toast — не модалка, не мешает другим Swal
        if (window.App.Toasts) {
            window.App.Toasts.success(
                'Тема: ' + names[next],
                '',
                { duration: 1500 }
            );
        } else if (typeof Swal !== 'undefined') {
            // Fallback — если toasts.js ещё не загружен
            Swal.fire({
                icon: 'success',
                title: 'Тема: ' + names[next],
                timer: 1000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end',
            });
        }
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    function init() {
        var saved = 'auto';
        try {
            saved = localStorage.getItem(THEME_KEY) || 'auto';
        } catch (e) {}
        apply(saved);

        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', function() {
                    var current = 'auto';
                    try {
                        current = localStorage.getItem(THEME_KEY) || 'auto';
                    } catch (e) {}
                    if (current === 'auto') {
                        apply('auto');
                    }
                });
        }
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    mod.init = init;
    mod.apply = apply;
    mod.toggle = toggle;

    window.initTheme = init;
    window.toggleTheme = toggle;

    console.log('[theme] Загружено');
})();