// static/js/contacts.js

(function() {
    'use strict';

    if (!window.App) {
        console.error('[contacts] App не инициализирован');
        return;
    }

    var api = window.App.register('Contacts');
    var utils = window.App.utils;

    // ============= СПИСОК =============
    function loadContactsPage() {
        var $contentBlock = $('#otherPagesBlock');

        $contentBlock.html(
            '<div class="text-center py-5">' +
            '<div class="spinner-border text-primary"></div>' +
            '<p class="mt-2">Загрузка контактов...</p>' +
            '</div>'
        );

        fetch('/api/contacts')
            .then(function(r) { return r.json(); })
            .then(function(contacts) {
                if (contacts.error) {
                    $contentBlock.html('<div class="alert alert-danger">' + utils.escapeHtml(contacts.error) + '</div>');
                    return;
                }

                var html = '<div class="card">';
                html += '<div class="card-header bg-primary text-white">';
                html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2">';
                html += '<h5 class="mb-0"><i class="bi bi-person-lines-fill"></i> Внешние контакты</h5>';
                html += '<div class="d-flex gap-2">';
                html += '<button class="btn btn-sm btn-light" onclick="loadContactsPage()"><i class="bi bi-arrow-clockwise"></i> Обновить</button>';
                html += '<button class="btn btn-sm btn-success" onclick="showAddContactModal()"><i class="bi bi-plus-circle"></i> Добавить</button>';
                html += '</div></div></div>';
                html += '<div class="card-body"><div class="table-responsive">';
                html += '<table class="table table-striped table-hover">';
                html += '<thead><tr>';
                html += '<th>Категория</th><th>Организация</th><th>Сотрудник</th>';
                html += '<th>Должность</th><th>Телефон</th><th>Почта</th><th>Примечание</th><th>Действия</th>';
                html += '</tr></thead><tbody>';

                if (contacts.length === 0) {
                    html += '<tr><td colspan="8" class="text-center">Нет контактов</td></tr>';
                } else {
                    contacts.forEach(function(c) {
                        html += '<tr>';
                        html += '<td>' + utils.escapeHtml(c.category || '-') + '</td>';
                        html += '<td><strong>' + utils.escapeHtml(c.company_name || '-') + '</strong></td>';
                        html += '<td>' + utils.escapeHtml(c.contact_person || '-') + '</td>';
                        html += '<td>' + utils.escapeHtml(c.position || '-') + '</td>';
                        html += '<td>' + utils.escapeHtml(c.phone || '-') + '</td>';
                        html += '<td>' + utils.escapeHtml(c.email || '-') + '</td>';
                        html += '<td>' + utils.escapeHtml(c.notes || '-') + '</td>';
                        html += '<td><div class="btn-group btn-group-sm">';
                        html += '<button class="btn btn-outline-success" onclick="editContact(' + c.id + ')" title="Редактировать"><i class="bi bi-pencil"></i></button>';
                        html += '<button class="btn btn-outline-danger" onclick="deleteContact(' + c.id + ')" title="Удалить"><i class="bi bi-trash"></i></button>';
                        html += '</div></td></tr>';
                    });
                }

                html += '</tbody></table></div></div></div>';
                $contentBlock.html(html);
            })
            .catch(function(error) {
                console.error('[contacts] load error:', error);
                $contentBlock.html('<div class="alert alert-danger">Ошибка загрузки: ' + utils.escapeHtml(error.message) + '</div>');
            });
    }

    // ============= ФОРМА =============
    function buildContactForm(data) {
        data = data || {};
        var categories = ['Поставщики', 'Сервис', 'Клиенты', 'Партнеры', 'Госорганы', 'Другое'];
        var catSelect = '<option value="">Выберите категорию</option>';
        categories.forEach(function(cat) {
            var selected = (cat === data.category) ? 'selected' : '';
            catSelect += '<option value="' + cat + '" ' + selected + '>' + cat + '</option>';
        });

        return '<div class="mb-3 text-start"><label class="form-label">Категория</label>' +
            '<select id="swal-category" class="form-select">' + catSelect + '</select></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Организация *</label>' +
            '<input id="swal-company" class="form-control" value="' + utils.escapeHtml(data.company_name || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Сотрудник</label>' +
            '<input id="swal-person" class="form-control" value="' + utils.escapeHtml(data.contact_person || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Должность</label>' +
            '<input id="swal-position" class="form-control" value="' + utils.escapeHtml(data.position || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Телефон</label>' +
            '<input id="swal-phone" class="form-control" value="' + utils.escapeHtml(data.phone || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Почта</label>' +
            '<input id="swal-email" class="form-control" value="' + utils.escapeHtml(data.email || '') + '"></div>' +
            '<div class="mb-3 text-start"><label class="form-label">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2">' + utils.escapeHtml(data.notes || '') + '</textarea></div>';
    }

    function collectContactForm() {
        var company = document.getElementById('swal-company').value.trim();
        if (!company) {
            Swal.showValidationMessage('Укажите название организации');
            return false;
        }
        return {
            category: document.getElementById('swal-category').value,
            company_name: company,
            contact_person: document.getElementById('swal-person').value.trim(),
            position: document.getElementById('swal-position').value.trim(),
            phone: document.getElementById('swal-phone').value.trim(),
            email: document.getElementById('swal-email').value.trim(),
            notes: document.getElementById('swal-notes').value.trim()
        };
    }

    // ============= ДОБАВЛЕНИЕ =============
    function showAddContactModal() {
        Swal.fire({
            title: 'Добавить контакт',
            html: buildContactForm(null),
            showCancelButton: true,
            confirmButtonText: 'Добавить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#28a745',
            preConfirm: collectContactForm
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.value)
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Контакт добавлен!', timer: 1500, showConfirmButton: false });
                        loadContactsPage();
                    } else {
                        Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                    }
                });
        });
    }

    // ============= РЕДАКТИРОВАНИЕ =============
    function editContact(contactId) {
        fetch('/api/contacts/' + contactId)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) { utils.showErrorMessage(data.error); return; }

                Swal.fire({
                    title: 'Редактировать контакт',
                    html: buildContactForm(data),
                    showCancelButton: true,
                    confirmButtonText: 'Сохранить',
                    cancelButtonText: 'Отмена',
                    confirmButtonColor: '#28a745',
                    preConfirm: collectContactForm
                }).then(function(result) {
                    if (!result.isConfirmed) return;
                    fetch('/api/contacts/' + contactId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                        .then(function(r) { return r.json(); })
                        .then(function(res) {
                            if (res.success) {
                                Swal.fire({ icon: 'success', title: 'Контакт обновлен!', timer: 1500, showConfirmButton: false });
                                loadContactsPage();
                            } else {
                                Swal.fire({ icon: 'error', title: 'Ошибка', text: res.error });
                            }
                        });
                });
            });
    }

    // ============= УДАЛЕНИЕ =============
    function deleteContact(contactId) {
        Swal.fire({
            title: 'Удалить контакт?',
            text: 'Действие нельзя отменить!',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Да, удалить',
            cancelButtonText: 'Отмена',
            confirmButtonColor: '#dc3545'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            fetch('/api/contacts/' + contactId, { method: 'DELETE' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Контакт удален!', timer: 1500, showConfirmButton: false });
                        loadContactsPage();
                    } else {
                        utils.showErrorMessage(data.error);
                    }
                });
        });
    }

    // ============= ЭКСПОРТ =============
    api.load = loadContactsPage;
    api.showAdd = showAddContactModal;
    api.edit = editContact;
    api.remove = deleteContact;

    window.loadContactsPage = loadContactsPage;
    window.showAddContactModal = showAddContactModal;
    window.editContact = editContact;
    window.deleteContact = deleteContact;

    console.log('[contacts] Загружено (без ID)');
})();