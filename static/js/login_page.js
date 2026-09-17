// static/js/login_page.js
// Логика страницы входа (вынесено из inline <script> для CSP)

(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        var savedLogin = localStorage.getItem('savedLogin');
        var savedRemember = localStorage.getItem('rememberMe');

        if (savedRemember === 'true' && savedLogin) {
            document.getElementById('loginInput').value = savedLogin;
            document.getElementById('rememberMe').checked = true;
        } else {
            document.getElementById('rememberMe').checked = false;
        }

        if (localStorage.getItem('savedPassword') !== null) {
            localStorage.removeItem('savedPassword');
        }

        // Привязка обработчиков
        var form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', handleLogin);
        }

        var toggle = document.getElementById('togglePassword');
        if (toggle) {
            toggle.addEventListener('click', togglePasswordVisibility);
        }
    });

    function togglePasswordVisibility() {
        var passwordInput = document.getElementById('passwordInput');
        var toggleIcon = document.getElementById('togglePassword');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.classList.remove('bi-eye');
            toggleIcon.classList.add('bi-eye-slash');
            toggleIcon.title = 'Скрыть пароль';
        } else {
            passwordInput.type = 'password';
            toggleIcon.classList.remove('bi-eye-slash');
            toggleIcon.classList.add('bi-eye');
            toggleIcon.title = 'Показать пароль';
        }
    }

    function showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').classList.add('show');
        document.getElementById('successMessage').classList.remove('show');
    }

    function hideError() {
        document.getElementById('errorMessage').classList.remove('show');
    }

    function showSuccess(message) {
        document.getElementById('successText').textContent = message;
        document.getElementById('successMessage').classList.add('show');
        document.getElementById('errorMessage').classList.remove('show');
    }

    function setLoginButtonState(enabled) {
        var btn = document.getElementById('loginBtn');
        if (!btn) return;
        btn.disabled = !enabled;
        if (enabled) {
            btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Войти';
        } else {
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Вход...';
        }
    }

    function handleLogin(event) {
        event.preventDefault();
        hideError();

        var login = document.getElementById('loginInput').value.trim();
        var password = document.getElementById('passwordInput').value.trim();
        var rememberMe = document.getElementById('rememberMe').checked;

        if (!login || !password) {
            showError('Введите логин и пароль');
            return;
        }

        if (rememberMe) {
            localStorage.setItem('savedLogin', login);
            localStorage.setItem('rememberMe', 'true');
        } else {
            localStorage.removeItem('savedLogin');
            localStorage.setItem('rememberMe', 'false');
        }
        localStorage.removeItem('savedPassword');

        setLoginButtonState(false);

        fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify({
                login: login,
                password: password,
                remember: rememberMe
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (!data.success) {
                setLoginButtonState(true);
                showError(data.error || 'Ошибка входа');
                return;
            }

            return fetch('/api/current_user', {
                credentials: 'same-origin',
                cache: 'no-store'
            })
            .then(function(r) {
                if (!r.ok) {
                    throw new Error(
                        'Сессия не установилась на сервере (код ' + r.status + '). ' +
                        'Проверьте SECRET_KEY в .env.example, SESSION_COOKIE_SECURE и права на flask_session/'
                    );
                }
                return r.json();
            })
            .then(function(user) {
                if (!user || user.error || !user.id) {
                    throw new Error('Сервер не видит сессию после входа.');
                }

                showSuccess('Вход выполнен. Перенаправление...');

                Swal.fire({
                    icon: 'success',
                    title: 'Добро пожаловать!',
                    text: user.full_name || data.user.full_name,
                    timer: 1200,
                    showConfirmButton: false
                }).then(function() {
                    window.location.replace('/');
                });
            });
        })
        .catch(function(error) {
            setLoginButtonState(true);
            showError(error.message || 'Ошибка соединения с сервером');
            console.error('Login error:', error);
        });
    }

    // Экспорт в window на всякий случай (не обязательно)
    window.handleLogin = handleLogin;
    window.togglePasswordVisibility = togglePasswordVisibility;
})();