// static/js/mobile_ux.js
// Мобильный UX: FAB, свайпы, pull-to-refresh, свайпы вкладок

(function() {
    'use strict';

    if (!window.App) {
        console.error('[mobile_ux] App не инициализирован');
        return;
    }

    var api = window.App.register('MobileUX');
    var state = window.App.state;

    // Проверка мобильного устройства
    function isMobile() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    // ============================================================
    // FAB — Плавающая кнопка действия
    // ============================================================
    function initFAB() {
        if (document.getElementById('muxFab')) return;

        var fab = document.createElement('button');
        fab.id = 'muxFab';
        fab.className = 'mux-fab';
        fab.setAttribute('aria-label', 'Создать заявку');
        fab.innerHTML = '<i class="bi bi-plus-lg"></i>';
        fab.addEventListener('click', function() {
            if (typeof showCreateTaskModal === 'function') {
                showCreateTaskModal();
            }
        });
        document.body.appendChild(fab);

        updateFABVisibility();
        window.addEventListener('resize', updateFABVisibility);
    }

    function updateFABVisibility() {
        var fab = document.getElementById('muxFab');
        if (!fab) return;

        // FAB только для тех, кто может создавать заявки
        // (все роли: и Админ, и Техник, и Пользователь)
        var canCreate = !!window.currentUserFullName;

        // И только на странице заявок
        var onTasks = $('#tasksBlock').is(':visible');

        // И только на мобильных
        var mobile = isMobile();

        if (canCreate && onTasks && mobile) {
            fab.classList.add('mux-fab-active');
            fab.classList.remove('mux-fab-hidden');
        } else {
            fab.classList.remove('mux-fab-active');
            fab.classList.add('mux-fab-hidden');
        }
    }

    // Вызывается из main.js при смене страницы
    function onPageChange(pageName) {
        updateFABVisibility();
    }

    // ============================================================
    // PULL-TO-REFRESH
    // ============================================================
    var ptrState = {
        startY: 0,
        currentY: 0,
        active: false,
        refreshing: false,
        threshold: 80
    };

    function initPullToRefresh() {
        if (document.getElementById('muxPtr')) return;

        var ptr = document.createElement('div');
        ptr.id = 'muxPtr';
        ptr.className = 'mux-ptr';
        ptr.innerHTML =
            '<div class="mux-ptr-inner">' +
            '<i class="bi bi-arrow-clockwise mux-ptr-spinner"></i>' +
            '<span>Потяните для обновления</span>' +
            '</div>';
        document.body.appendChild(ptr);

        if (!isTouchDevice()) return;

        document.addEventListener('touchstart', onPtrTouchStart, { passive: true });
        document.addEventListener('touchmove', onPtrTouchMove, { passive: false });
        document.addEventListener('touchend', onPtrTouchEnd, { passive: true });
    }

    function onPtrTouchStart(e) {
        if (ptrState.refreshing) return;
        if (window.scrollY > 5) return;
        if (!$('#tasksBlock').is(':visible')) return;
        if (document.querySelector('.modal.show')) return;
        if (document.querySelector('.swal2-container')) return;

        ptrState.startY = e.touches[0].clientY;
        ptrState.active = true;
    }

    function onPtrTouchMove(e) {
        if (!ptrState.active || ptrState.refreshing) return;

        ptrState.currentY = e.touches[0].clientY;
        var diff = ptrState.currentY - ptrState.startY;

        if (diff <= 0) {
            resetPtr();
            return;
        }

        // Не даём странице проскроллиться при жесте
        if (diff > 10 && window.scrollY <= 0) {
            e.preventDefault();
        }

        var ptr = document.getElementById('muxPtr');
        if (!ptr) return;

        var height = Math.min(diff * 0.6, ptrState.threshold + 30);

        if (height > 10) {
            ptr.classList.add('mux-ptr-visible');
            ptr.style.height = height + 'px';
            ptr.style.transition = 'none';

            var label = ptr.querySelector('span');
            var spinner = ptr.querySelector('.mux-ptr-spinner');

            if (height >= ptrState.threshold) {
                label.textContent = 'Отпустите для обновления';
                spinner.style.transform = 'rotate(180deg)';
            } else {
                label.textContent = 'Потяните для обновления';
                spinner.style.transform = 'rotate(' + (height * 2) + 'deg)';
            }
        }
    }

    function onPtrTouchEnd() {
        if (!ptrState.active) return;
        ptrState.active = false;

        var ptr = document.getElementById('muxPtr');
        if (!ptr) return;

        var height = parseInt(ptr.style.height || '0', 10);
        ptr.style.transition = '';

        if (height >= ptrState.threshold) {
            // Активируем обновление
            ptrState.refreshing = true;
            ptr.classList.add('mux-ptr-refreshing');
            ptr.style.height = ptrState.threshold + 'px';
            ptr.querySelector('span').textContent = 'Обновление...';

            // Обновляем данные
            try {
                if (window.App.Tasks && typeof window.App.Tasks.loadTasks === 'function') {
                    window.App.Tasks.loadTasks(state.currentPage || 1);
                }
                if (window.App.Tasks && typeof window.App.Tasks.loadStatistics === 'function') {
                    window.App.Tasks.loadStatistics();
                }
                if (window.App.Notifications && typeof window.App.Notifications.loadUnreadCount === 'function') {
                    window.App.Notifications.loadUnreadCount();
                }
            } catch (e) {
                console.error('[mobile_ux] PTR refresh error:', e);
            }

            // Через 700 мс скрываем индикатор
            setTimeout(function() {
                ptrState.refreshing = false;
                ptr.classList.remove('mux-ptr-refreshing');
                ptr.classList.remove('mux-ptr-visible');
                ptr.style.height = '0';
            }, 700);

        } else {
            resetPtr();
        }
    }

    function resetPtr() {
        var ptr = document.getElementById('muxPtr');
        if (!ptr) return;
        ptr.classList.remove('mux-ptr-visible');
        ptr.style.height = '0';
    }

    // ============================================================
    // СВАЙП ПО СТРОКЕ ЗАЯВКИ
    // ============================================================
    var rowSwipe = {
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        isHorizontal: false,
        row: null,
        wrapper: null,
        startTime: 0,
        currentOffset: 0
    };

    var SWIPE_THRESHOLD = 60;
    var SWIPE_MAX = 160;

    function initRowSwipe() {
        if (!isTouchDevice()) return;
        if (!isMobile()) return;

        document.addEventListener('touchstart', onRowTouchStart, { passive: true });
        document.addEventListener('touchmove', onRowTouchMove, { passive: false });
        document.addEventListener('touchend', onRowTouchEnd, { passive: true });
        document.addEventListener('touchcancel', onRowTouchEnd, { passive: true });
    }

    function onRowTouchStart(e) {
        if (!isMobile()) return;
        if (document.querySelector('.modal.show')) return;
        if (document.querySelector('.swal2-container')) return;
        if (ptrState.active) return;

        var row = e.target.closest('.task-row');
        if (!row) return;

        var touch = e.touches[0];
        rowSwipe.active = true;
        rowSwipe.startX = touch.clientX;
        rowSwipe.startY = touch.clientY;
        rowSwipe.currentX = touch.clientX;
        rowSwipe.row = row;
        rowSwipe.isHorizontal = false;
        rowSwipe.startTime = Date.now();
        rowSwipe.currentOffset = 0;

        // Оборачиваем строку в wrapper, если ещё нет
        rowSwipe.wrapper = ensureRowWrapper(row);
    }

    function ensureRowWrapper(row) {
        var parent = row.parentNode;
        if (parent && parent.classList && parent.classList.contains('mux-row-wrapper')) {
            return parent;
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'mux-row-wrapper';

        parent.insertBefore(wrapper, row);
        wrapper.appendChild(row);

        // Добавляем кнопки действий
        var actions = buildRowActions(row);
        wrapper.appendChild(actions);

        return wrapper;
    }

    function buildRowActions(row) {
        var taskId = parseInt(row.getAttribute('data-task-id'), 10);
        var actions = document.createElement('div');
        actions.className = 'mux-swipe-actions';
        actions.setAttribute('data-task-id', taskId);

        var role = window.currentUserRole;
        var buttons = [];

        // «Взять в работу» — только админ/техник
        if (role === 'Администратор' || role === 'Техник') {
            buttons.push(
                '<button type="button" class="mux-swipe-btn mux-swipe-take" ' +
                'data-action="take" data-task-id="' + taskId + '">' +
                '<i class="bi bi-play-circle"></i>Взять</button>'
            );
            buttons.push(
                '<button type="button" class="mux-swipe-btn mux-swipe-close" ' +
                'data-action="close" data-task-id="' + taskId + '">' +
                '<i class="bi bi-check-circle"></i>Закрыть</button>'
            );
        }

        // «Удалить» — только админ
        if (role === 'Администратор') {
            buttons.push(
                '<button type="button" class="mux-swipe-btn mux-swipe-delete" ' +
                'data-action="delete" data-task-id="' + taskId + '">' +
                '<i class="bi bi-trash"></i>Удалить</button>'
            );
        }

        actions.innerHTML = buttons.join('');

        // Обработчики на кнопки
        actions.querySelectorAll('.mux-swipe-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var action = btn.getAttribute('data-action');
                var id = parseInt(btn.getAttribute('data-task-id'), 10);
                handleSwipeAction(action, id, rowSwipe.wrapper);
            });
        });

        return actions;
    }

    function onRowTouchMove(e) {
        if (!rowSwipe.active || !rowSwipe.row) return;
        if (ptrState.active) return;

        var touch = e.touches[0];
        var dx = touch.clientX - rowSwipe.startX;
        var dy = touch.clientY - rowSwipe.startY;

        // Определяем направление после небольшого движения
        if (!rowSwipe.isHorizontal && Math.abs(dx) + Math.abs(dy) > 8) {
            rowSwipe.isHorizontal = Math.abs(dx) > Math.abs(dy);
        }

        if (!rowSwipe.isHorizontal) return;

        // Только свайп влево
        var offset = Math.min(Math.max(dx, -SWIPE_MAX), 0);
        rowSwipe.currentOffset = offset;

        // Запрещаем вертикальный скролл во время свайпа
        e.preventDefault();

        var actions = rowSwipe.wrapper.querySelector('.mux-swipe-actions');
        var actionsWidth = actions ? actions.offsetWidth : 0;

        // Плавное сопротивление при перетаскивании сверх максимума
        if (offset < -actionsWidth) {
            offset = -actionsWidth + (offset + actionsWidth) * 0.3;
        }

        rowSwipe.row.classList.add('mux-swiping');
        rowSwipe.row.style.transform = 'translateX(' + offset + 'px)';
    }

    function onRowTouchEnd() {
        if (!rowSwipe.active || !rowSwipe.row) {
            resetRowSwipe();
            return;
        }

        var offset = rowSwipe.currentOffset;
        var actions = rowSwipe.wrapper.querySelector('.mux-swipe-actions');
        var actionsWidth = actions ? actions.offsetWidth : 0;

        rowSwipe.row.classList.remove('mux-swiping');

        // Открываем или закрываем
        if (Math.abs(offset) > SWIPE_THRESHOLD || Math.abs(offset) > actionsWidth * 0.4) {
            // Открываем полностью
            rowSwipe.row.style.transform = 'translateX(-' + actionsWidth + 'px)';
        } else {
            rowSwipe.row.style.transform = 'translateX(0)';
        }

        // Запоминаем, какая строка открыта
        closeOtherSwipeRows(rowSwipe.row);

        setTimeout(function() {
            resetRowSwipe();
        }, 300);
    }

    function resetRowSwipe() {
        rowSwipe.active = false;
        rowSwipe.row = null;
        rowSwipe.wrapper = null;
        rowSwipe.isHorizontal = false;
        rowSwipe.currentOffset = 0;
    }

    function closeOtherSwipeRows(keepRow) {
        document.querySelectorAll('.mux-row-wrapper .task-row').forEach(function(r) {
            if (r !== keepRow && r.style.transform && r.style.transform !== 'translateX(0px)') {
                r.style.transform = 'translateX(0)';
            }
        });
    }

    function closeAllSwipeRows() {
        document.querySelectorAll('.mux-row-wrapper .task-row').forEach(function(r) {
            r.style.transform = 'translateX(0)';
        });
    }

    function handleSwipeAction(action, taskId, wrapper) {
        // Закрываем строку
        var row = wrapper ? wrapper.querySelector('.task-row') : null;
        if (row) row.style.transform = 'translateX(0)';

        switch (action) {
            case 'take':
                Swal.fire({
                    title: 'Взять заявку в работу?',
                    text: 'Заявка №' + taskId,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Да',
                    cancelButtonText: 'Отмена'
                }).then(function(r) {
                    if (!r.isConfirmed) return;
                    fetch('/api/task/' + taskId + '/take', { method: 'POST' })
                        .then(function(resp) { return resp.json(); })
                        .then(function(data) {
                            if (data.success) {
                                if (window.App.utils) window.App.utils.showSuccessMessage('Заявка взята в работу');
                                if (window.App.Tasks) window.App.Tasks.refreshData();
                            } else {
                                if (window.App.utils) window.App.utils.showErrorMessage(data.error);
                            }
                        });
                });
                break;

            case 'close':
                Swal.fire({
                    title: 'Закрыть заявку?',
                    text: 'Заявка №' + taskId,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Да',
                    cancelButtonText: 'Отмена'
                }).then(function(r) {
                    if (!r.isConfirmed) return;
                    fetch('/api/close_task/' + taskId, { method: 'POST' })
                        .then(function(resp) { return resp.json(); })
                        .then(function(data) {
                            if (data.success) {
                                if (window.App.utils) window.App.utils.showSuccessMessage('Заявка закрыта');
                                if (window.App.Tasks) window.App.Tasks.refreshData();
                            } else {
                                if (window.App.utils) window.App.utils.showErrorMessage(data.error);
                            }
                        });
                });
                break;

            case 'delete':
                Swal.fire({
                    title: 'Удалить заявку?',
                    text: 'Действие нельзя отменить',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Удалить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#dc3545'
                }).then(function(r) {
                    if (!r.isConfirmed) return;
                    fetch('/api/delete_task/' + taskId, { method: 'DELETE' })
                        .then(function(resp) { return resp.json(); })
                        .then(function(data) {
                            if (data.success) {
                                if (window.App.utils) window.App.utils.showSuccessMessage('Заявка удалена');
                                if (window.App.Tasks) window.App.Tasks.refreshData();
                            } else {
                                if (window.App.utils) window.App.utils.showErrorMessage(data.error);
                            }
                        });
                });
                break;
        }
    }

    // ============================================================
    // МОБИЛЬНЫЕ КАРТОЧКИ — data-label для TD
    // ============================================================
    function enhanceTaskRowsForMobile() {
        if (!isMobile()) return;

        var headers = [];
        var $thead = $('.table-container table thead th');
        $thead.each(function() { headers.push($(this).text().trim()); });

        $('#tasksTableBody tr').each(function() {
            var $row = $(this);
            var $cells = $row.find('td');
            $cells.each(function(index) {
                var $cell = $(this);
                if (!$cell.attr('data-label') && headers[index]) {
                    $cell.attr('data-label', headers[index]);
                }
            });
        });
    }

    // Обновляем разметку через MutationObserver — только когда таблица меняется
    function startRowEnhancer() {
        if (!isMobile()) return;

        var tbody = document.getElementById('tasksTableBody');
        if (!tbody) return;

        var scheduled = false;

        var observer = new MutationObserver(function() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function() {
                scheduled = false;
                enhanceTaskRowsForMobile();
            });
        });

        observer.observe(tbody, { childList: true, subtree: false });
    }

    // ============================================================
    // СВАЙП МЕЖДУ ВКЛАДКАМИ В МОДАЛКЕ
    // ============================================================
    var tabSwipe = {
        active: false,
        startX: 0,
        startY: 0,
        isHorizontal: false,
        tabList: null,
        currentIndex: 0
    };

    function initTabSwipe() {
        if (!isTouchDevice()) return;

        var modal = document.getElementById('viewTaskModal');
        if (!modal) return;

        var modalBody = modal.querySelector('.modal-body');
        if (!modalBody) return;

        modalBody.addEventListener('touchstart', onTabTouchStart, { passive: true });
        modalBody.addEventListener('touchmove', onTabTouchMove, { passive: false });
        modalBody.addEventListener('touchend', onTabTouchEnd, { passive: true });
    }

    function onTabTouchStart(e) {
        if (!isMobile()) return;
        if (tabSwipe.active) return;

        var touch = e.touches[0];
        tabSwipe.active = true;
        tabSwipe.startX = touch.clientX;
        tabSwipe.startY = touch.clientY;
        tabSwipe.isHorizontal = false;

        var tabs = document.querySelectorAll('.task-tabs .nav-link');
        tabSwipe.tabList = Array.from(tabs);
        tabSwipe.currentIndex = tabSwipe.tabList.findIndex(function(t) {
            return t.classList.contains('active');
        });
    }

    function onTabTouchMove(e) {
        if (!tabSwipe.active) return;

        var touch = e.touches[0];
        var dx = touch.clientX - tabSwipe.startX;
        var dy = touch.clientY - tabSwipe.startY;

        if (!tabSwipe.isHorizontal && Math.abs(dx) + Math.abs(dy) > 15) {
            tabSwipe.isHorizontal = Math.abs(dx) > Math.abs(dy);
        }

        if (tabSwipe.isHorizontal) {
            e.preventDefault();
        }
    }

    function onTabTouchEnd(e) {
        if (!tabSwipe.active) return;

        if (tabSwipe.isHorizontal) {
            var touch = e.changedTouches[0];
            var dx = touch.clientX - tabSwipe.startX;

            if (Math.abs(dx) > 60) {
                var direction = dx < 0 ? 1 : -1;
                var newIndex = tabSwipe.currentIndex + direction;

                if (newIndex >= 0 && newIndex < tabSwipe.tabList.length) {
                    var newTab = tabSwipe.tabList[newIndex];
                    var tabName = newTab.getAttribute('data-tab');

                    if (typeof switchTaskTab === 'function') {
                        switchTaskTab(tabName);
                    }

                    // Анимация
                    var $pane = $('.task-tab-pane.active');
                    $pane.removeClass('mux-swipe-left mux-swipe-right');
                    $pane.addClass(direction > 0 ? 'mux-swipe-left' : 'mux-swipe-right');
                }
            }
        }

        tabSwipe.active = false;
        tabSwipe.isHorizontal = false;
    }

    // ============================================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================================
    function init() {
        if (!isMobile()) {
            console.log('[mobile_ux] Не мобильное устройство, модуль не активирован');
            return;
        }

        console.log('[mobile_ux] Инициализация мобильного UX');

        initFAB();
        initPullToRefresh();
        initRowSwipe();
        initTabSwipe();
        startRowEnhancer();

        // Клик вне строки закрывает свайп
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.task-row') && !e.target.closest('.mux-swipe-actions')) {
                closeAllSwipeRows();
            }
        });

        // Обновляем FAB при смене размера окна
        window.addEventListener('resize', updateFABVisibility);
    }

    // ============= ЭКСПОРТ =============
    api.init = init;
    api.updateFABVisibility = updateFABVisibility;
    api.onPageChange = onPageChange;
    api.closeAllSwipeRows = closeAllSwipeRows;

    console.log('[mobile_ux] Загружено');
})();