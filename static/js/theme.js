// static/js/theme.js
// Управление темой (light/dark/auto)

(function() {
    'use strict';

    if (!window.App) {
        console.error('[theme] App не инициализирован');
        return;
    }

    var THEME_KEY = 'support_active_theme';
    var api = window.App.register('Theme');

    // ---------- Системная тема ----------
    function getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    // ---------- Применение ----------
    function apply(theme) {
        var actualTheme = theme === 'auto' ? getSystemTheme() : theme;

        document.documentElement.setAttribute('data-theme', actualTheme);
        document.body.classList.toggle('dark-theme', actualTheme === 'dark');

        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', actualTheme === 'dark' ? '#1c1c22' : '#4e73df');
        }

        updateButtonIcon(theme);
    }

    // ---------- Иконка кнопки ----------
    function updateButtonIcon(theme) {
        var $btn = $('#themeToggleBtn');
        if ($btn.length === 0) return;

        var iconMap = {
            'light': { icon: 'bi-moon', title: 'Переключить на тёмную' },
            'dark':  { icon: 'bi-sun',  title: 'Переключить на светлую' },
            'auto':  { icon: 'bi-circle-half', title: 'Автоматически (системная)' }
        };
        var info = iconMap[theme] || iconMap['auto'];
        $btn.html('<i class="bi ' + info.icon + '"></i>');
        $btn.attr('title', info.title);
    }

    // ---------- Переключение по кругу ----------
    function toggle() {
        var current = localStorage.getItem(THEME_KEY) || 'auto';
        var next;
        if (current === 'auto') next = 'light';
        else if (current === 'light') next = 'dark';
        else next = 'auto';

        apply(next);

        var names = { 'light': 'Светлая', 'dark': 'Тёмная', 'auto': 'Автоматически' };
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Тема: ' + names[next],
                timer: 1000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        }
    }

    // ---------- Инициализация ----------
    function init() {
        var saved = localStorage.getItem(THEME_KEY) || 'auto';
        apply(saved);

        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
                if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') {
                    apply('auto');
                }
            });
        }
    }

    // ---------- Экспорт ----------
    api.init = init;
    api.apply = apply;
    api.toggle = toggle;

    // Для inline onclick
    window.initTheme = init;
    window.toggleTheme = toggle;

    console.log('[theme] Загружено');
})();