// static/js/tasks_bulk.js
// Массовые операции над заявками.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var state = window.App.state;

    function bulkAction(action) {
        var ids = Array.from(state.selectedTasks).map(Number);
        if (ids.length === 0) {
            utils.showErrorMessage('Не выбрано ни одной заявки');
            return;
        }

        if (action === 'close') {
            confirmThenRun('Закрыть заявки?', 'Будет закрыто: ' + ids.length, action, ids);
        } else if (action === 'assign') {
            pickExecutor(ids);
        } else if (action === 'priority') {
            pickPriority(ids);
        } else if (action === 'delete') {
            if (window.currentUserRole !== 'Администратор') {
                utils.showErrorMessage('Только администратор');
                return;
            }
            Swal.fire({
                icon: 'warning',
                title: 'Удалить заявки?',
                html: 'Будет безвозвратно удалено: <strong>' + ids.length + '</strong>',
                showCancelButton: true,
                confirmButtonText: 'Удалить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#dc3545',
            }).then(function(r) {
                if (r.isConfirmed) runAction('delete', ids, {});
            });
        }
    }

    function confirmThenRun(title, text, action, ids) {
        Swal.fire({
            title: title,
            text: text,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Да',
            cancelButtonText: 'Отмена',
        }).then(function(r) {
            if (r.isConfirmed) runAction(action, ids, {});
        });
    }

    function pickExecutor(ids) {
        api.get('/api/executors')
            .then(function(executors) {
                var options = '<option value="">— выберите исполнителя —</option>';
                (executors || []).forEach(function(e) {
                    options += '<option value="' + utils.escapeHtml(e.full_name) + '">' +
                        utils.escapeHtml(e.full_name + ' (' + e.role + ')') +
                        '</option>';
                });

                Swal.fire({
                    title: 'Назначить исполнителя',
                    html: '<div class="text-start">' +
                        '<p>Заявок: <strong>' + ids.length + '</strong></p>' +
                        '<select id="bulk-executor" class="form-select">' + options + '</select>' +
                        '</div>',
                    showCancelButton: true,
                    confirmButtonText: 'Назначить',
                    cancelButtonText: 'Отмена',
                    preConfirm: function() {
                        var v = document.getElementById('bulk-executor').value;
                        if (!v) {
                            Swal.showValidationMessage('Выберите исполнителя');
                            return false;
                        }
                        return v;
                    },
                }).then(function(r) {
                    if (r.isConfirmed) {
                        runAction('assign', ids, { executor: r.value });
                    }
                });
            })
            .catch(function() {
                utils.showErrorMessage('Не удалось загрузить список исполнителей');
            });
    }

    function pickPriority(ids) {
        Swal.fire({
            title: 'Изменить приоритет',
            html: '<div class="text-start">' +
                '<p>Заявок: <strong>' + ids.length + '</strong></p>' +
                '<select id="bulk-priority" class="form-select">' +
                '<option value="Высокий">Высокий</option>' +
                '<option value="Средний" selected>Средний</option>' +
                '<option value="Низкий">Низкий</option>' +
                '</select></div>',
            showCancelButton: true,
            confirmButtonText: 'Применить',
            cancelButtonText: 'Отмена',
            preConfirm: function() {
                return document.getElementById('bulk-priority').value;
            },
        }).then(function(r) {
            if (r.isConfirmed) {
                runAction('priority', ids, { priority: r.value });
            }
        });
    }

    function runAction(action, ids, extra) {
        Swal.fire({
            title: 'Выполняется...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        var payload = Object.assign({ action: action, ids: ids }, extra || {});

        api.post('/api/tasks/bulk', payload)
            .then(function(res) {
                Swal.close();
                if (res.success) {
                    utils.showSuccessMessage(res.message || 'Готово');
                    state.selectedTasks.clear();
                    var $selAll = $('#selectAll');
                    if ($selAll.length) $selAll.prop('checked', false);
                    if (window.App.Tasks) window.App.Tasks.refreshData();
                } else {
                    utils.showErrorMessage(res.error || 'Ошибка');
                }
            })
            .catch(function(err) {
                Swal.close();
                utils.showErrorMessage(err.message || 'Ошибка');
            });
    }

    // Экспорт
    window.bulkClose = function()   { bulkAction('close'); };
    window.bulkAssign = function()  { bulkAction('assign'); };
    window.bulkPriority = function(){ bulkAction('priority'); };
    window.bulkDelete = function()  { bulkAction('delete'); };

    console.log('[tasks_bulk] Загружено');
})();