// static/js/utils.js
// Общие утилиты: форматирование, DOM-помощники, цветовые палитры

(function() {
    'use strict';

    if (!window.App) {
        console.error('[utils] App не инициализирован. Убедитесь, что core.js подключён первым.');
        return;
    }

    var utils = window.App.utils = window.App.utils || {};

    // ============ ЦВЕТА АВАТАРОВ ============
    utils.avatarColors = [
        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b',
        '#6f42c1', '#fd7e14', '#20c9a6', '#858796', '#5a5c69'
    ];

    // ============ ФОРМАТИРОВАНИЕ ДАТ ============
    utils.formatDate = function(dateString) {
        if (!dateString) return '-';
        try {
            var date = new Date(String(dateString).replace(' ', 'T'));
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    };

    // ============ ФОРМАТИРОВАНИЕ РАЗМЕРА ФАЙЛА ============
    utils.formatSize = function(bytes) {
        if (!bytes) return '0 Б';
        var k = 1024;
        var sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0) + ' ' + sizes[i];
    };

    // ============ СТАТУСЫ ЗАЯВОК ============
    utils.getStatusClass = function(status) {
        switch (status) {
            case 'Новое':      return 'status-new';
            case 'В работе':   return 'status-progress';
            case 'Выполнено':  return 'status-completed';
            case 'Отменено':   return 'status-cancelled';
            default:           return 'status-new';
        }
    };

    utils.getPriorityClass = function(priority) {
        switch (priority) {
            case 'Высокий': return 'priority-high';
            case 'Средний': return 'priority-medium';
            case 'Низкий':  return 'priority-low';
            default:        return '';
        }
    };

    // ============ РАБОТА С ТЕКСТОМ ============
    utils.truncateText = function(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength
            ? text.substring(0, maxLength) + '...'
            : text;
    };

    utils.escapeHtml = function(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(text)));
        return div.innerHTML;
    };

    // ============ АНИМАЦИЯ ЧИСЕЛ ============
    utils.animateNumber = function(element, newValue) {
        var $element = $(element);
        if ($element.length === 0) return;

        var currentValue = parseInt($element.text(), 10) || 0;

        $({ value: currentValue }).animate(
            { value: newValue },
            {
                duration: 500,
                easing: 'swing',
                step: function() { $element.text(Math.floor(this.value)); },
                complete: function() { $element.text(newValue); }
            }
        );
    };

    // ============ СООБЩЕНИЯ ============
    utils.showErrorMessage = function(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Ошибка', text: message });
        } else {
            alert('Ошибка: ' + message);
        }
    };

    utils.showSuccessMessage = function(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'Успешно',
                text: message,
                timer: 2000,
                showConfirmButton: false
            });
        }
    };

    // ============ СКЛОНЕНИЯ ============
    utils.pluralize = function(n, one, few, many) {
        n = Math.abs(n) % 100;
        var n1 = n % 10;
        if (n > 10 && n < 20) return many;
        if (n1 > 1 && n1 < 5) return few;
        if (n1 === 1) return one;
        return many;
    };

    // ============ ЭКСПОРТ В WINDOW ============
    // Для совместимости со старым кодом
    window.avatarColors = utils.avatarColors;
    window.formatDate = utils.formatDate;
    window.formatSize = utils.formatSize;
    window.getStatusClass = utils.getStatusClass;
    window.getPriorityClass = utils.getPriorityClass;
    window.truncateText = utils.truncateText;
    window.escapeHtml = utils.escapeHtml;
    window.animateNumber = utils.animateNumber;
    window.showErrorMessage = utils.showErrorMessage;
    window.showSuccessMessage = utils.showSuccessMessage;
    window.pluralize = utils.pluralize;

    console.log('[utils] Загружено утилит:', Object.keys(utils).length);
})();