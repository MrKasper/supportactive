// static/js/admin/dev_impersonate.js
// Impersonation для роли «Разработчик» — доступно на всех страницах.
// Плюс функция devLogout() для кнопки «Выйти» в сайдбаре /dev и /audit.

(function() {
    'use strict';

    if (!window.App) {
        console.error('[dev_impersonate] App не инициализирован');
        return;
    }

    var api = window.App.api;
    var utils = window.App.utils;

    // ============================================================
    // ОТКРЫТИЕ МОДАЛКИ «СМЕНИТЬ ПОЛЬЗОВАТЕЛЯ»
    // ============================================================
    function openUserSwitch() {
        api.get('/api/dev/users')
            .then(function(users) {
                if (!users || users.length === 0) {
                    utils.showErrorMessage('Нет пользователей');
                    return;
                }

                var opts = users.map(function(u) {
                    var badge = u.is_active ? '' : ' (заблокирован)';
                    return '<option value="' + u.id + '">' +
                        utils.escapeHtml(u.full_name) + ' — ' +
                        utils.escapeHtml(u.role) +
                        (u.login ? ' [' + utils.escapeHtml(u.login) + ']' : '') +
                        badge + '</option>';
                }).join('');

                Swal.fire({
                    title: '<i class="bi bi-person-badge"></i> Сменить пользователя',
                    html:
                        '<div class="text-start">' +
                        '<p class="text-muted small mb-2">' +
                        'Вы войдёте под выбранным пользователем. ' +
                        'Чтобы вернуться — используйте кнопку ' +
                        '<strong>«Вернуться к себе (DEV)»</strong> ' +
                        'в верхней части экрана.</p>' +
                        '<select id="impersonate-user" class="form-select">' +
                        '<option value="">— выберите пользователя —</option>' +
                        opts +
                        '</select></div>',
                    showCancelButton: true,
                    confirmButtonText: '<i class="bi bi-box-arrow-in-right"></i> Войти',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    customClass: { popup: 'swal-wide' },
                    preConfirm: function() {
                        var v = document.getElementById('impersonate-user').value;
                        if (!v) {
                            Swal.showValidationMessage('Выберите пользователя');
                            return false;
                        }
                        return v;
                    },
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    impersonateUser(result.value);
                });
            })
            .catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка загрузки');
            });
    }

    // ============================================================
    // ВХОД ПОД ВЫБРАННЫМ ПОЛЬЗОВАТЕЛЕМ
    // ============================================================
    function impersonateUser(userId) {
        Swal.fire({
            title: 'Переключение...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.post('/api/dev/impersonate/' + userId, {})
            .then(function(d) {
                if (d.success) {
                    window.location.href = d.redirect || '/';
                } else {
                    Swal.close();
                    utils.showErrorMessage(d.error || 'Ошибка');
                }
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка');
            });
    }

    // ============================================================
    // ВОЗВРАТ К СЕССИИ РАЗРАБОТЧИКА
    // ============================================================
    function backToDev() {
        api.post('/api/dev/impersonate/back', {})
            .then(function(d) {
                if (d.success) {
                    window.location.href = d.redirect || '/dev';
                } else {
                    utils.showErrorMessage(d.error || 'Ошибка');
                }
            })
            .catch(function(err) {
                utils.showErrorMessage(err.message || 'Ошибка');
            });
    }

    // ============================================================
    // ВЫХОД ИЗ СИСТЕМЫ
    // ============================================================
    // Кнопка «Выйти» в сайдбаре /dev и /audit.
    // Если разработчик сейчас под другим пользователем (impersonation) —
    // предупреждаем, что сессия разработчика тоже будет потеряна.
    function devLogout() {
        var isImpersonating = false;
        try {
            isImpersonating = !!document.querySelector('.impersonate-banner');
        } catch (e) {}

        var text = isImpersonating
            ? 'Вы сейчас под другим пользователем. ' +
              'Выйти из системы полностью? ' +
              '(Сессия разработчика тоже будет потеряна.)'
            : 'Выйти из системы?';

        Swal.fire({
            title: 'Выход',
            text: text,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '<i class="bi bi-box-arrow-right"></i> Выйти',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545',
            reverseButtons: true,
        }).then(function(r) {
            if (r.isConfirmed) {
                window.location.href = '/logout';
            }
        });
    }

    // ============================================================
    // ЭКСПОРТ
    // ============================================================
    window.DevImpersonate = {
        openUserSwitch: openUserSwitch,
        impersonateUser: impersonateUser,
        backToDev: backToDev,
        devLogout: devLogout,
    };

    // Дублируем в DevConsole, если он есть
    if (window.DevConsole) {
        window.DevConsole.openUserSwitch = openUserSwitch;
        window.DevConsole.backToDev = backToDev;
        window.DevConsole.devLogout = devLogout;
    }

    // Глобальные алиасы для inline onclick
    window.openUserSwitch = openUserSwitch;
    window.backToDev = backToDev;
    window.devLogout = devLogout;

    console.log('[dev_impersonate] Загружено');
})();