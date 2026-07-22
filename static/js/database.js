// static/js/database.js

// Глобальные переменные
let currentTaskId = null;
let currentUserId = null;
let selectedTasks = new Set();

// Цвета для аватаров
const avatarColors = ['#4e73df','#1cc88a','#36b9cc','#f6c23e','#e74a3b','#6f42c1','#fd7e14','#20c9a6','#858796','#5a5c69'];

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        var date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return dateString;
    }
}

function getStatusClass(status) {
    switch (status) {
        case 'Новое': return 'status-new';
        case 'В работе': return 'status-progress';
        case 'Выполнено': return 'status-completed';
        case 'Отменено': return 'status-cancelled';
        default: return 'status-new';
    }
}

function getPriorityClass(priority) {
    switch (priority) {
        case 'Высокий': return 'priority-high';
        case 'Средний': return 'priority-medium';
        case 'Низкий': return 'priority-low';
        default: return '';
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

function animateNumber(element, newValue) {
    var $element = $(element);
    var currentValue = parseInt($element.text()) || 0;

    $({ value: currentValue }).animate(
        { value: newValue },
        {
            duration: 500,
            easing: 'swing',
            step: function() { $element.text(Math.floor(this.value)); },
            complete: function() { $element.text(newValue); }
        }
    );
}

function showErrorMessage(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'error', title: 'Ошибка', text: message });
    } else {
        alert('Ошибка: ' + message);
    }
}

function showSuccessMessage(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Успешно', text: message, timer: 2000, showConfirmButton: false });
    }
}

console.log('Database module loaded');