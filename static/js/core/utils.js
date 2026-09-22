// static/js/utils.js
// Общие утилиты: форматирование, DOM-помощники, цветовые палитры, пагинация

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
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return dateString; }
    };

    utils.formatDateOnly = function(dateString) {
        if (!dateString) return '-';
        try {
            var date = new Date(String(dateString).replace(' ', 'T'));
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('ru-RU');
        } catch (e) { return dateString; }
    };

    // Компактный формат без запятой: '21.09.2026 09:37'
    utils.formatDateShort = function(dateString) {
        if (!dateString) return '—';
        try {
            var d = new Date(String(dateString).replace(' ', 'T'));
            if (isNaN(d.getTime())) return String(dateString);
            var p = function(n) { return String(n).padStart(2, '0'); };
            return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' +
                   d.getFullYear() + ' ' + p(d.getHours()) + ':' +
                   p(d.getMinutes());
        } catch (e) { return String(dateString); }
    };

    // ============ ФОРМАТИРОВАНИЕ РАЗМЕРА ============
    utils.formatSize = function(bytes) {
        if (!bytes) return '0 Б';
        var k = 1024, sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0) + ' ' + sizes[i];
    };

    // ============ СТАТУСЫ ============
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
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    utils.escapeHtml = function(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // ============ АНИМАЦИЯ ЧИСЕЛ (через requestAnimationFrame) ============
    utils.animateNumber = function(element, newValue) {
        var $el = $(element);
        if ($el.length === 0) return;

        var from = parseInt($el.text(), 10) || 0;
        var to = parseInt(newValue, 10);
        if (isNaN(to)) to = 0;

        if (from === to) {
            $el.text(to);
            return;
        }

        var duration = 500;
        var startTime = null;

        var el = $el[0];
        if (el._animNumberRAF) {
            cancelAnimationFrame(el._animNumberRAF);
            el._animNumberRAF = null;
        }

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);

            var eased = 1 - (1 - progress) * (1 - progress);
            var value = Math.floor(from + (to - from) * eased);

            $el.text(value);

            if (progress < 1) {
                el._animNumberRAF = requestAnimationFrame(step);
            } else {
                $el.text(to);
                el._animNumberRAF = null;
            }
        }

        el._animNumberRAF = requestAnimationFrame(step);
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
                icon: 'success', title: 'Успешно', text: message,
                timer: 2000, showConfirmButton: false
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

    // ============ SKELETON ============
    utils.skeletonRows = function(rows, cols) {
        var html = '';
        for (var i = 0; i < rows; i++) {
            html += '<tr>';
            for (var j = 0; j < cols; j++) {
                var width = 50 + Math.floor(Math.random() * 40);
                html += '<td><div class="skeleton-bar" style="width:' + width + '%"></div></td>';
            }
            html += '</tr>';
        }
        return html;
    };

    // ============ ПАГИНАЦИЯ ============
    /**
     * Универсальная пагинация.
     *
     * opts = {
     *   container:     '#tasksPagination' | jQuery-объект,
     *   data:          { page, pages, per_page, total },
     *   onClickFn:     'loadTasks' | 'AuditPage.loadLog' | ...,
     *   showFirstLast: bool — показывать «в начало»/«в конец»,
     *   showCounter:   bool — показывать строку «Показано X–Y из Z»,
     *   countLabel:    'Всего' (для counterStyle='total'),
     *   counterStyle:  'range' | 'total'
     * }
     */
    utils.renderPagination = function(opts) {
        opts = opts || {};

        var container = opts.container;
        if (!container) return;

        var $c = (typeof container === 'string') ? $(container) : container;
        if (!$c || $c.length === 0) return;

        var data = opts.data || {};
        var pages = parseInt(data.pages, 10) || 0;
        var page = parseInt(data.page, 10) || 1;
        var total = parseInt(data.total, 10) || 0;
        var perPage = parseInt(data.per_page, 10) || 50;
        var fn = opts.onClickFn || '';
        var showFirstLast = opts.showFirstLast === true;
        var showCounter = opts.showCounter === true;
        var countLabel = opts.countLabel || 'Всего';
        var counterStyle = opts.counterStyle || 'total';

        // Одна страница или ноль — либо пусто, либо только counter
        if (pages <= 1) {
            if (showCounter && total > 0) {
                if (counterStyle === 'range') {
                    $c.html('<div class="text-center text-muted small py-2">' +
                        'Показано 1–' + total + ' из ' + total + '</div>');
                } else {
                    $c.html('<div class="text-center text-muted small py-2">' +
                        countLabel + ': ' + total + '</div>');
                }
            } else {
                $c.empty();
            }
            return;
        }

        function _navLink(p, iconHtml, disabled) {
            return '<li class="page-item' + (disabled ? ' disabled' : '') + '">' +
                '<a class="page-link" href="#" ' +
                (disabled ? '' :
                    'onclick="' + fn + '(' + p + '); return false;"') +
                '>' + iconHtml + '</a></li>';
        }

        function _numLink(p, active) {
            return '<li class="page-item' + (active ? ' active' : '') + '">' +
                '<a class="page-link" href="#" ' +
                'onclick="' + fn + '(' + p + '); return false;">' + p + '</a></li>';
        }

        var html = '<nav><ul class="pagination pagination-sm justify-content-center mb-0">';

        if (showFirstLast) {
            html += _navLink(1, '<i class="bi bi-chevron-double-left"></i>',
                             page === 1);
        }
        html += _navLink(page - 1, '<i class="bi bi-chevron-left"></i>',
                         page === 1);

        var start = Math.max(1, page - 2);
        var end = Math.min(pages, page + 2);

        if (start > 1) {
            html += _numLink(1, false);
            if (start > 2) {
                html += '<li class="page-item disabled">' +
                        '<span class="page-link">…</span></li>';
            }
        }
        for (var i = start; i <= end; i++) {
            html += _numLink(i, i === page);
        }
        if (end < pages) {
            if (end < pages - 1) {
                html += '<li class="page-item disabled">' +
                        '<span class="page-link">…</span></li>';
            }
            html += _numLink(pages, false);
        }

        html += _navLink(page + 1, '<i class="bi bi-chevron-right"></i>',
                         page === pages);
        if (showFirstLast) {
            html += _navLink(pages,
                             '<i class="bi bi-chevron-double-right"></i>',
                             page === pages);
        }

        html += '</ul></nav>';

        if (showCounter) {
            if (counterStyle === 'range') {
                var from = (page - 1) * perPage + 1;
                var to = Math.min(page * perPage, total);
                html += '<div class="text-center text-muted small mt-2">' +
                    'Показано ' + from + '–' + to + ' из ' + total + '</div>';
            } else {
                html += '<div class="text-center text-muted small mt-2">' +
                    countLabel + ': ' + total +
                    ' · Страница ' + page + ' из ' + pages + '</div>';
            }
        }

        $c.html(html);
    };

    // ============ UNDO (восстановление после удаления) ============
    utils.undoDelete = function(label, restoreUrl, onRestored) {
        Swal.fire({
            icon: 'success',
            title: label + ' удалён',
            html: '<p class="text-muted small mb-0">Можно восстановить в течение 30 секунд</p>',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-arrow-counterclockwise"></i> Восстановить',
            cancelButtonText: 'OK',
            confirmButtonColor: '#0d6efd',
            timer: 30000,
            timerProgressBar: true,
            reverseButtons: true
        }).then(function(r) {
            if (r.isConfirmed) {
                fetch(restoreUrl, { method: 'POST' })
                    .then(function(resp) { return resp.json(); })
                    .then(function(data) {
                        if (data.success) {
                            utils.showSuccessMessage('Восстановлено');
                            if (typeof onRestored === 'function') onRestored();
                        } else {
                            utils.showErrorMessage(data.error || 'Не удалось восстановить');
                        }
                    });
            }
        });
    };

    // ============ ЭКСПОРТ В WINDOW ============
    window.avatarColors = utils.avatarColors;
    window.formatDate = utils.formatDate;
    window.formatDateOnly = utils.formatDateOnly;
    window.formatDateShort = utils.formatDateShort;
    window.formatSize = utils.formatSize;
    window.getStatusClass = utils.getStatusClass;
    window.getPriorityClass = utils.getPriorityClass;
    window.truncateText = utils.truncateText;
    window.escapeHtml = utils.escapeHtml;
    window.animateNumber = utils.animateNumber;
    window.showErrorMessage = utils.showErrorMessage;
    window.showSuccessMessage = utils.showSuccessMessage;
    window.pluralize = utils.pluralize;
    window.skeletonRows = utils.skeletonRows;
    window.renderPagination = utils.renderPagination;

    console.log('[utils] Загружено утилит:', Object.keys(utils).length);
})();