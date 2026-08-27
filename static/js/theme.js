// static/js/theme.js

// ============= УПРАВЛЕНИЕ ТЕМОЙ =============

// Ключ для localStorage
const THEME_KEY = 'support_active_theme';

// Функция применения темы
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.classList.add('dark-theme');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.classList.remove('dark-theme');
    }

    // Сохраняем выбор
    localStorage.setItem(THEME_KEY, theme);

    // Обновляем иконку кнопки
    updateThemeButtonIcon(theme);
}

// Обновление иконки кнопки темы
function updateThemeButtonIcon(theme) {
    var $themeBtn = $('#themeToggleBtn');
    if ($themeBtn.length === 0) return;

    if (theme === 'dark') {
        $themeBtn.html('<i class="bi bi-sun"></i>');
        $themeBtn.attr('title', 'Светлая тема');
    } else {
        $themeBtn.html('<i class="bi bi-moon"></i>');
        $themeBtn.attr('title', 'Темная тема');
    }
}

// Переключение темы
function toggleTheme() {
    var currentTheme = localStorage.getItem(THEME_KEY) || 'light';
    var newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

// Инициализация темы при загрузке
function initTheme() {
    var savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(savedTheme);
}

console.log('Theme module loaded');