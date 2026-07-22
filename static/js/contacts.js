// static/js/contacts.js

// ============= ЗАГРУЗКА СТРАНИЦЫ КОНТАКТОВ =============
function loadContactsPage() {
    console.log('Loading contacts page...');

    var $contentBlock = $('#otherPagesBlock');

    $contentBlock.html(
        '<div class="text-center py-5">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<p class="mt-2">Загрузка контактов...</p>' +
        '</div>'
    );

    fetch('/api/contacts')
        .then(function(r) { return r.json(); })
        .then(function(contacts) {
            if (contacts.error) {
                $contentBlock.html('<div class="alert alert-danger">' + contacts.error + '</div>');
                return;
            }

            var html = '';

            // Таблица
            html += '<div class="card">';
            html += '<div class="card-header bg-primary text-white">';
            html += '<div class="d-flex justify-content-between align-items-center">';
            html += '<h5 class="mb-0"><i class="bi bi-person-lines-fill"></i> Внешние контакты</h5>';
            html += '<div class="d-flex gap-2">';
            html += '<button class="btn btn-sm btn-light" onclick="loadContactsPage()">';
            html += '<i class="bi bi-arrow-clockwise"></i> Обновить';
            html += '</button>';
            html += '<button class="btn btn-sm btn-success" onclick="showAddContactModal()">';
            html += '<i class="bi bi-plus-circle"></i> Добавить';
            html += '</button>';
            html += '</div>';
            html += '</div>';
            html += '</div>';
            html += '<div class="card-body">';
            html += '<div class="table-responsive">';
            html += '<table class="table table-striped table-hover">';
            html += '<thead><tr>';
            html += '<th>ID</th>';
            html += '<th>Категория</th>';
            html += '<th>Организация</th>';
            html += '<th>Сотрудник</th>';
            html += '<th>Должность</th>';
            html += '<th>Телефон</th>';
            html += '<th>Почта</th>';
            html += '<th>Примечание</th>';
            html += '<th>Действия</th>';
            html += '</tr></thead>';
            html += '<tbody>';

            if (contacts.length === 0) {
                html += '<tr><td colspan="9" class="text-center">Нет контактов</td></tr>';
            } else {
                contacts.forEach(function(contact) {
                    html += '<tr>';
                    html += '<td>' + contact.id + '</td>';
                    html += '<td>' + (contact.category || '-') + '</td>';
                    html += '<td><strong>' + (contact.company_name || '-') + '</strong></td>';
                    html += '<td>' + (contact.contact_person || '-') + '</td>';
                    html += '<td>' + (contact.position || '-') + '</td>';
                    html += '<td>' + (contact.phone || '-') + '</td>';
                    html += '<td>' + (contact.email || '-') + '</td>';
                    html += '<td>' + (contact.notes || '-') + '</td>';
                    html += '<td>';
                    html += '<div class="btn-group btn-group-sm">';
                    html += '<button class="btn btn-outline-success" onclick="editContact(' + contact.id + ')" title="Редактировать">';
                    html += '<i class="bi bi-pencil"></i>';
                    html += '</button>';
                    html += '<button class="btn btn-outline-danger" onclick="deleteContact(' + contact.id + ')" title="Удалить">';
                    html += '<i class="bi bi-trash"></i>';
                    html += '</button>';
                    html += '</div>';
                    html += '</td>';
                    html += '</tr>';
                });
            }

            html += '</tbody>';
            html += '</table>';
            html += '</div>';
            html += '</div>';
            html += '</div>';

            $contentBlock.html(html);
        })
        .catch(function(error) {
            console.error('Error loading contacts:', error);
            $contentBlock.html(
                '<div class="alert alert-danger">Ошибка загрузки контактов: ' + error.message + '</div>'
            );
        });
}

// Показать модальное окно добавления контакта
function showAddContactModal() {
    Swal.fire({
        title: 'Добавить контакт',
        html:
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Категория</label>' +
            '<select id="swal-category" class="form-select">' +
            '<option value="">Выберите категорию</option>' +
            '<option value="Поставщики">Поставщики</option>' +
            '<option value="Сервис">Сервис</option>' +
            '<option value="Клиенты">Клиенты</option>' +
            '<option value="Партнеры">Партнеры</option>' +
            '<option value="Госорганы">Госорганы</option>' +
            '<option value="Другое">Другое</option>' +
            '</select>' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Организация *</label>' +
            '<input id="swal-company" class="form-control" placeholder="Название организации">' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Сотрудник</label>' +
            '<input id="swal-person" class="form-control" placeholder="ФИО сотрудника">' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Должность</label>' +
            '<input id="swal-position" class="form-control" placeholder="Должность">' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Телефон</label>' +
            '<input id="swal-phone" class="form-control" placeholder="+7-999-123-45-67">' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Почта</label>' +
            '<input id="swal-email" class="form-control" placeholder="example@company.ru">' +
            '</div>' +
            '<div class="mb-3">' +
            '<label class="form-label text-start w-100">Примечание</label>' +
            '<textarea id="swal-notes" class="form-control" rows="2" placeholder="Примечание"></textarea>' +
            '</div>',
        showCancelButton: true,
        confirmButtonText: 'Добавить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#28a745',
        preConfirm: function() {
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
    }).then(function(result) {
        if (result.isConfirmed) {
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
        }
    });
}

// Редактирование контакта
function editContact(contactId) {
    fetch('/api/contacts/' + contactId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.error) {
                showErrorMessage(data.error);
                return;
            }

            var categoryOptions = ['Поставщики', 'Сервис', 'Клиенты', 'Партнеры', 'Госорганы', 'Другое'];
            var categorySelect = '<option value="">Выберите категорию</option>';
            categoryOptions.forEach(function(cat) {
                var selected = (cat === data.category) ? 'selected' : '';
                categorySelect += '<option value="' + cat + '" ' + selected + '>' + cat + '</option>';
            });

            Swal.fire({
                title: 'Редактировать контакт',
                html:
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Категория</label>' +
                    '<select id="swal-category" class="form-select">' +
                    categorySelect +
                    '</select>' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Организация *</label>' +
                    '<input id="swal-company" class="form-control" value="' + (data.company_name || '') + '">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Сотрудник</label>' +
                    '<input id="swal-person" class="form-control" value="' + (data.contact_person || '') + '">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Должность</label>' +
                    '<input id="swal-position" class="form-control" value="' + (data.position || '') + '">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Телефон</label>' +
                    '<input id="swal-phone" class="form-control" value="' + (data.phone || '') + '">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Почта</label>' +
                    '<input id="swal-email" class="form-control" value="' + (data.email || '') + '">' +
                    '</div>' +
                    '<div class="mb-3">' +
                    '<label class="form-label text-start w-100">Примечание</label>' +
                    '<textarea id="swal-notes" class="form-control" rows="2">' + (data.notes || '') + '</textarea>' +
                    '</div>',
                showCancelButton: true,
                confirmButtonText: 'Сохранить',
                cancelButtonText: 'Отмена',
                confirmButtonColor: '#28a745',
                preConfirm: function() {
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
            }).then(function(result) {
                if (result.isConfirmed) {
                    fetch('/api/contacts/' + contactId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) {
                            Swal.fire({ icon: 'success', title: 'Контакт обновлен!', timer: 1500, showConfirmButton: false });
                            loadContactsPage();
                        } else {
                            Swal.fire({ icon: 'error', title: 'Ошибка', text: data.error });
                        }
                    });
                }
            });
        });
}

// Удаление контакта
function deleteContact(contactId) {
    Swal.fire({
        title: 'Удалить контакт?',
        text: 'Это действие нельзя отменить!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Да, удалить',
        cancelButtonText: 'Отмена',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            fetch('/api/contacts/' + contactId, {
                method: 'DELETE'
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    Swal.fire({ icon: 'success', title: 'Контакт удален!', timer: 1500, showConfirmButton: false });
                    loadContactsPage();
                } else {
                    showErrorMessage(data.error);
                }
            });
        }
    });
}

console.log('Contacts module loaded');