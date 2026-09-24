// static/js/dev/dev_console_tests.js
// Вкладка «Тесты»: список и запуск pytest через UI.

(function() {
    'use strict';

    if (!window.App) return;

    var api = window.App.api;
    var utils = window.App.utils;
    var DC = window.DevConsole = window.DevConsole || {};

    var testsCache = null;

    // ============================================================
    // СПИСОК
    // ============================================================
    DC.loadTestsList = function() {
        $('#tests-content').html(
            '<div class="p-4 text-center">' +
            '<div class="spinner-border spinner-border-sm text-primary"></div>' +
            '</div>'
        );

        api.get('/api/dev/tests/list')
            .then(function(d) {
                if (d.error) {
                    $('#tests-content').html(
                        '<div class="alert alert-danger m-3">' +
                        utils.escapeHtml(d.error) + '</div>'
                    );
                    return;
                }

                if (!d.exists) {
                    $('#tests-content').html(
                        '<div class="alert alert-warning m-3">' +
                        'Папка <code>tests/</code> не найдена.</div>'
                    );
                    return;
                }

                testsCache = d.files || [];
                renderList(d);
            })
            .catch(function(err) {
                $('#tests-content').html(
                    '<div class="alert alert-danger m-3">' +
                    utils.escapeHtml(err.message) + '</div>'
                );
            });
    };

    function renderList(d) {
        var files = d.files || [];
        var total = d.total_tests;

        var html = '';

        // Ту��бар
        html += '<div class="d-flex justify-content-between ' +
            'align-items-center mb-3 flex-wrap gap-2">';
        html += '<div>';
        html += '<span class="badge bg-secondary me-2">' +
            files.length + ' файл(ов)</span>';
        html += '<span class="badge bg-primary">' +
            total + ' тестов</span>';
        html += '</div>';
        html += '<button class="btn btn-success btn-sm" ' +
            'onclick="DevConsole.runAllTests()">' +
            '<i class="bi bi-play-fill"></i> Запустить ВСЕ</button>';
        html += '</div>';

        // Пусто
        if (files.length === 0) {
            html += '<div class="alert alert-info">' +
                'В папке tests/ нет файлов test_*.py</div>';
            $('#tests-content').html(html);
            return;
        }

        // Список
        html += '<div class="accordion" id="tests-acc">';
        files.forEach(function(f, i) {
            html += '<div class="accordion-item">';
            html += '<h2 class="accordion-header">';
            html += '<button class="accordion-button collapsed" ' +
                'type="button" data-bs-toggle="collapse" ' +
                'data-bs-target="#tfile-' + i + '">';
            html += '<strong>' + utils.escapeHtml(f.name) + '</strong>';
            html += '<span class="badge bg-info text-dark ms-2">' +
                f.test_count + '</span>';
            html += '</button></h2>';
            html += '<div id="tfile-' + i + '" class="accordion-collapse collapse" ' +
                'data-bs-parent="#tests-acc">';
            html += '<div class="accordion-body">';

            // Кнопка запуска файла
            html += '<div class="mb-2">';
            html += '<button class="btn btn-sm btn-outline-primary" ' +
                'onclick="DevConsole.runTestFile(\'' +
                utils.escapeHtml(f.name) + '\')">' +
                '<i class="bi bi-play-fill"></i> Запустить файл</button>';
            html += '</div>';

            // Список тестов
            if (f.tests && f.tests.length > 0) {
                html += '<div class="list-group list-group-flush">';
                f.tests.forEach(function(t) {
                    html += '<div class="list-group-item d-flex ' +
                        'justify-content-between align-items-center py-1">';
                    html += '<code class="small">' +
                        utils.escapeHtml(t) + '</code>';
                    html += '<button class="btn btn-sm btn-outline-success" ' +
                        'onclick="DevConsole.runSingleTest(\'' +
                        utils.escapeHtml(f.name) + '\', \'' +
                        utils.escapeHtml(t) + '\')" ' +
                        'title="Запустить">' +
                        '<i class="bi bi-play"></i></button>';
                    html += '</div>';
                });
                html += '</div>';
            } else {
                html += '<div class="text-muted small">' +
                    'Не найдено test_ функций</div>';
            }

            html += '</div></div></div>';
        });
        html += '</div>';

        // Результат
        html += '<div id="tests-result" class="mt-3"></div>';

        $('#tests-content').html(html);
    }

    // ============================================================
    // ЗАПУСК
    // ============================================================
    function runWithPayload(payload, label) {
        Swal.fire({
            title: 'Выполняется...',
            html: '<p>' + utils.escapeHtml(label) + '</p>' +
                '<p class="small text-muted mb-0">' +
                'Может занять до нескольких минут</p>',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); },
        });

        api.post('/api/dev/tests/run', payload, { timeout: 200000 })
            .then(function(res) {
                Swal.close();
                renderResult(res, label);
            })
            .catch(function(err) {
                Swal.close();
                $('#tests-result').html(
                    '<div class="alert alert-danger">' +
                    utils.escapeHtml(err.message || 'Ошибка') + '</div>'
                );
            });
    }

    DC.runAllTests = function() {
        runWithPayload({ scope: 'all' }, 'Запуск ВСЕХ тестов');
    };

    DC.runTestFile = function(fileName) {
        runWithPayload(
            { scope: 'file', file: fileName },
            'Запуск: ' + fileName
        );
    };

    DC.runSingleTest = function(fileName, testName) {
        runWithPayload(
            { scope: 'test', file_for_test: fileName, test: testName },
            'Запуск: ' + fileName + '::' + testName
        );
    };

    // ============================================================
    // РЕЗУЛЬТАТ
    // ============================================================
    function renderResult(res, label) {
        var s = res.summary || {};
        var ok = res.success;
        var badgeClass = ok ? 'bg-success' : 'bg-danger';
        var statusText = ok ? 'OK' : (res.timed_out ? 'ТАЙМАУТ' : 'ОШИБКА');

        var html = '';

        // Сводка
        html += '<div class="card">';
        html += '<div class="card-header ' + badgeClass + ' text-white ' +
            'd-flex justify-content-between align-items-center flex-wrap gap-2">';
        html += '<h6 class="mb-0">' +
            '<i class="bi ' + (ok ? 'bi-check-circle' : 'bi-x-circle') + '"></i> ' +
            utils.escapeHtml(label) + '</h6>';
        html += '<div class="d-flex gap-2 align-items-center small">';
        html += '<span class="badge bg-light text-dark">' +
            statusText + '</span>';
        html += '<span>' + (res.duration_sec || 0) + 's</span>';
        html += '</div></div>';

        html += '<div class="card-body p-2">';

        // Счётчики
        html += '<div class="d-flex gap-2 flex-wrap mb-2">';
        if (s.passed) {
            html += '<span class="badge bg-success">✓ ' + s.passed +
                ' passed</span>';
        }
        if (s.failed) {
            html += '<span class="badge bg-danger">✗ ' + s.failed +
                ' failed</span>';
        }
        if (s.errors) {
            html += '<span class="badge bg-dark">⚠ ' + s.errors +
                ' errors</span>';
        }
        if (s.skipped) {
            html += '<span class="badge bg-secondary">○ ' + s.skipped +
                ' skipped</span>';
        }
        html += '<span class="badge bg-info text-dark ms-auto">' +
            'Всего: ' + s.total + '</span>';
        html += '</div>';

        // Вывод
        html += '<div class="small text-muted mb-1">STDOUT:</div>';
        html += '<pre style="max-height:400px;overflow:auto;' +
            'background:#0d1117;color:#c9d1d9;padding:12px;' +
            'border-radius:6px;font-size:.75rem;white-space:pre-wrap;' +
            'word-break:break-all">' +
            utils.escapeHtml(res.stdout || '(пусто)') + '</pre>';

        if (res.stderr) {
            html += '<div class="small text-muted mb-1 mt-2">STDERR:</div>';
            html += '<pre style="max-height:200px;overflow:auto;' +
                'background:#2a0d0d;color:#f8b6b6;padding:12px;' +
                'border-radius:6px;font-size:.75rem;white-space:pre-wrap;' +
                'word-break:break-all">' +
                utils.escapeHtml(res.stderr) + '</pre>';
        }

        html += '</div></div>';

        $('#tests-result').html(html);

        // Скролл к результату
        var el = document.getElementById('tests-result');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    console.log('[dev_console_tests] Загружено');
})();