// static/js/redesign.js
// ============================================================
// Support Active — адаптер нового макета.
//
// Содержит:
//   • openModal / closeModal для .modal-backdrop
//   • lock / unlock body scroll
//   • monkey-patch $.fn.modal() — чтобы старые модули могли
//     вызывать $('#viewTaskModal').modal('show') без правок
//   • глобальные обработчики модалок (backdrop, dismiss, Escape)
//   • эмуляцию Bootstrap collapse (accordion) — dev_console_db/tests
//   • toggleDropdown / closeDropdown
//   • навигация по сайдбару (.sidebar .nav-item[data-page] → loadPage)
//
// Прикладное (kanban, профиль, уведомления, экспорт) живёт в своих
// модулях: tasks_kanban.js, login.js, notifications.js, excel.js.
// ============================================================

(function() {
    'use strict';

    if (!window.App) {
        console.error('[redesign] App не инициализирован');
        return;
    }
    if (typeof jQuery === 'undefined') {
        console.error('[redesign] jQuery не загружен — модуль пропущен');
        return;
    }

    var mod = window.App.register('Redesign');

    // ============================================================
    // 1. БЛОКИРОВКА СКРОЛЛА
    // ============================================================
    var _openModals = 0;

    function lockBodyScroll() {
        _openModals++;
        document.body.style.overflow = 'hidden';
    }
    function unlockBodyScroll() {
        _openModals = Math.max(0, _openModals - 1);
        if (_openModals === 0) document.body.style.overflow = '';
    }

    // ============================================================
    // 2. МОДАЛКИ НОВОГО МАКЕТА
    // ============================================================
    function trigger(el, eventName) {
        try { $(el).trigger(eventName); } catch (e) { /* noop */ }
    }

    function openModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add('open');
        lockBodyScroll();
        trigger(el, 'show.bs.modal');
        setTimeout(function() { trigger(el, 'shown.bs.modal'); }, 30);
    }

    function closeModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        trigger(el, 'hide.bs.modal');
        el.classList.remove('open');
        unlockBodyScroll();
        setTimeout(function() { trigger(el, 'hidden.bs.modal'); }, 30);
    }

    // ============================================================
    // 3. MONKEY-PATCH jQuery `$.fn.modal()`
    // ============================================================
    (function patchJQueryModal() {
        var _orig = $.fn.modal;
        $.fn.modal = function(action) {
            return this.each(function() {
                var el = this;
                if (typeof _orig === 'function') {
                    try { _orig.call($(el), action); return; } catch (e) {}
                }
                if (action === 'show') {
                    trigger(el, 'show.bs.modal');
                    el.classList.add('open');
                    el.style.display = '';
                    lockBodyScroll();
                    setTimeout(function() { trigger(el, 'shown.bs.modal'); }, 30);
                } else if (action === 'hide' || action === 'toggle') {
                    var isOpen = el.classList.contains('open');
                    if (action === 'toggle' && !isOpen) {
                        trigger(el, 'show.bs.modal');
                        el.classList.add('open');
                        lockBodyScroll();
                        setTimeout(function() { trigger(el, 'shown.bs.modal'); }, 30);
                    } else {
                        trigger(el, 'hide.bs.modal');
                        el.classList.remove('open');
                        unlockBodyScroll();
                        setTimeout(function() { trigger(el, 'hidden.bs.modal'); }, 30);
                    }
                } else if (action === 'dispose') {
                    el.classList.remove('open');
                    unlockBodyScroll();
                }
            });
        };
    })();

    // ============================================================
    // 4. ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ МОДАЛОК
    // ============================================================

    // Клик по backdrop вне .modal — закрыть
    document.addEventListener('click', function(e) {
        if (e.target.classList && e.target.classList.contains('modal-backdrop')
            && e.target.classList.contains('open')) {
            closeModal(e.target.id);
        }
    });

    // Эмуляция [data-bs-dismiss="modal"]
    document.addEventListener('click', function(e) {
        var el = e.target.closest && e.target.closest('[data-bs-dismiss="modal"]');
        if (!el) return;
        var backdrop = el.closest('.modal-backdrop');
        if (!backdrop) return;
        e.preventDefault();
        closeModal(backdrop.id);
    });

    // Кнопки .modal-close
    document.addEventListener('click', function(e) {
        var el = e.target.closest && e.target.closest('.modal-close');
        if (!el) return;
        var backdrop = el.closest('.modal-backdrop');
        if (!backdrop) return;
        e.preventDefault();
        closeModal(backdrop.id);
    });

    // Escape
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var opened = document.querySelectorAll('.modal-backdrop.open');
        if (opened.length === 0) return;
        closeModal(opened[opened.length - 1].id);
    });

    // ============================================================
    // 4b. ЭМУЛЯЦИЯ BOOTSTRAP COLLAPSE (accordion)
    //
    // Bootstrap JS у нас нет, а dev_console_db.js / dev_console_tests.js
    // используют .accordion с [data-bs-toggle="collapse"] и data-bs-target.
    // Реализуем ту же логику вручную.
    // ============================================================
    $(document).on('click.redesignCollapse', '[data-bs-toggle="collapse"]', function(e) {
        e.preventDefault();

        var $btn = $(this);
        var target = $btn.attr('data-bs-target');
        if (!target) return;

        var $target = $(target);
        if (!$target.length) return;

        var isOpen = $target.hasClass('show');
        var $parent = $target.closest('.accordion');

        // Если accordion — single mode (по умолчанию), закрываем соседей
        if ($parent.length && !$parent.attr('data-bs-parent-none')) {
            $parent.find('.accordion-collapse.show').not($target).each(function() {
                $(this).removeClass('show');
                $(this).closest('.accordion-item')
                    .find('.accordion-button')
                    .addClass('collapsed')
                    .attr('aria-expanded', 'false');
            });
        }

        if (isOpen) {
            $target.removeClass('show');
            $btn.addClass('collapsed').attr('aria-expanded', 'false');
        } else {
            $target.addClass('show');
            $btn.removeClass('collapsed').attr('aria-expanded', 'true');
        }
    });

    // ============================================================
    // 5. DROPDOWN (Массовые действия)
    // ============================================================
    function toggleDropdown(id, event) {
        if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
        }
        var dd = document.getElementById(id);
        if (!dd) return;

        var isHidden = dd.classList.contains('hidden');
        document.querySelectorAll('.dropdown-menu').forEach(function(m) {
            m.classList.add('hidden');
        });
        if (isHidden) dd.classList.remove('hidden');
    }

    function closeDropdown(id) {
        var dd = document.getElementById(id);
        if (dd) dd.classList.add('hidden');
    }

    document.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('.dropdown-menu')) return;
        if (e.target.closest && e.target.closest('.dropdown')) return;
        document.querySelectorAll('.dropdown-menu').forEach(function(m) {
            m.classList.add('hidden');
        });
    });

    // ============================================================
    // 6. НАВИГАЦИЯ ПО САЙДБАРУ
    //
    // Клики по .sidebar .nav-item[data-page] → loadPage(page).
    // Если у пункта есть href (например /dashboard) — не мешаем
    // браузеру переходить по ссылке.
    // ============================================================
    function bindSidebarNav() {
        $(document)
            .off('click.redesignNav', '.sidebar .nav-item[data-page]')
            .on('click.redesignNav', '.sidebar .nav-item[data-page]', function(e) {
                var href = $(this).attr('href');
                if (href && href !== '#') return;
                e.preventDefault();

                var page = $(this).attr('data-page');
                if (!page) return;

                $('.sidebar .nav-link').removeClass('active');
                $(this).addClass('active');

                // Мобильная навигация — подсвечиваем пункт, если есть
                $('.mobile-bottom-nav .nav-item').removeClass('active');
                var mobileMap = { tasks: 0, users: 1, cartridges: 2, licenses: 3 };
                if (typeof mobileMap[page] === 'number') {
                    $('.mobile-bottom-nav .nav-item')
                        .eq(mobileMap[page]).addClass('active');
                }

                if (typeof window.loadPage === 'function') {
                    window.loadPage(page);
                } else {
                    console.warn('[redesign] loadPage не определён');
                }
            });
    }

    // ============================================================
    // 7. ЭКСПОРТ В WINDOW
    // ============================================================
    window.openModal      = openModal;
    window.closeModal     = closeModal;
    window.toggleDropdown = toggleDropdown;
    window.closeDropdown  = closeDropdown;

    mod.openModal      = openModal;
    mod.closeModal     = closeModal;
    mod.toggleDropdown = toggleDropdown;
    mod.closeDropdown  = closeDropdown;
    mod.bindSidebarNav = bindSidebarNav;

    // ============================================================
    // 8. ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    $(document).ready(function() {
        bindSidebarNav();
    });

    console.log('[redesign] Загружено (адаптер)');
})();