# app_security.py
"""
Безопасность: CSP, обработчики ошибок, хуки запроса.
Логирование медленных запросов в отдельный файл slow_requests.log.
"""
import logging as _logging
import secrets
from datetime import datetime

from flask import (
    request, jsonify, render_template, g, session,
)
from flask_wtf.csrf import CSRFError


CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' "
        "https://code.jquery.com "
        "https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' "
        "https://cdn.jsdelivr.net",
    "font-src 'self' https://cdn.jsdelivr.net data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "media-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
]


def _is_api_request():
    return request.path.startswith('/api/')


# ============================================================
# ОБРАБОТЧИКИ ОШИБОК
# ============================================================

def register_error_handlers(app, log):
    """Регистрирует обработчики ошибок."""

    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        log.warning(
            f'CSRF: {e.description} | '
            f'IP={request.remote_addr} | {request.path}'
        )
        if _is_api_request():
            return jsonify({
                'error': 'CSRF-токен отсутствует или недействителен',
            }), 400
        return render_template('500.html'), 400

    @app.errorhandler(404)
    def not_found_error(error):
        if _is_api_request():
            return jsonify({'error': 'Ресурс не найден'}), 404
        return render_template('404.html'), 404

    @app.errorhandler(413)
    def too_large_error(error):
        log.warning(
            f'Файл слишком большой: {request.path} '
            f'IP={request.remote_addr}'
        )
        if _is_api_request():
            return jsonify({
                'success': False,
                'error': 'Файл слишком большой (макс. 20 МБ)',
            }), 413
        return jsonify({'error': 'Файл слишком большой'}), 413

    @app.errorhandler(429)
    def ratelimit_handler(e):
        log.warning(f'Rate limit: {request.path} IP={request.remote_addr}')
        if _is_api_request():
            return jsonify({
                'error': 'Слишком много запросов. Попробуйте позже.',
            }), 429
        return 'Too many requests', 429

    @app.errorhandler(500)
    def internal_error(error):
        log.exception(f'Internal server error на {request.path}')
        if _is_api_request():
            return jsonify({'error': 'Внутренняя ошибка сервера'}), 500
        return render_template('500.html'), 500


# ============================================================
# ХУКИ ЗАПРОСА
# ============================================================

def register_request_hooks(app, log):
    """Регистрирует before/after request."""

    @app.before_request
    def log_request_start():
        g.request_start = datetime.now()

    @app.after_request
    def security_headers_and_log(response):
        # ---------- Заголовки безопасности ----------
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = (
            'geolocation=(), microphone=(), camera=(), payment=()'
        )
        response.headers['Content-Security-Policy'] = '; '.join(CSP_DIRECTIVES)

        # ---------- Логирование ----------
        if request.path.startswith('/static/'):
            return response
        if request.path == '/api/notifications/stream':
            return response

        try:
            duration = (
                datetime.now() - g.request_start
            ).total_seconds() * 1000
        except Exception:
            duration = 0

        if response.status_code >= 500:
            level = 'ERROR'
        elif response.status_code >= 400:
            level = 'WARNING'
        else:
            level = 'INFO'

        log.log(
            getattr(_logging, level),
            f'{request.method} {request.path} -> {response.status_code} '
            f'({duration:.0f}ms) IP={request.remote_addr}',
        )

        # ---------- Медленные запросы в отдельный лог ----------
        try:
            threshold = app.config.get('SLOW_REQUEST_MS', 1000)
            if duration >= threshold:
                slow_log = _logging.getLogger('slow_requests')

                ua_short = (request.headers.get('User-Agent') or '')[:80]

                try:
                    user_login = session.get('user_login', 'anon') or 'anon'
                except Exception:
                    user_login = 'anon'

                # Убираем query-string — может содержать чувствительные данные
                safe_path = request.path
                if request.query_string:
                    safe_path += '?[params]'

                slow_log.warning(
                    f'{duration:.0f}ms | {request.method} {safe_path} | '
                    f'status={response.status_code} | '
                    f'user={user_login} | '
                    f'ip={request.remote_addr} | '
                    f'ua={ua_short!r}'
                )
        except Exception as e:
            log.warning(f'slow request logger failed: {e}')

        return response


# ============================================================
# КОНТЕКСТ-ПРОЦЕССОРЫ
# ============================================================

def register_context_processors(app):
    """Регистрирует context processors."""

    @app.context_processor
    def inject_csrf_token():
        from flask_wtf.csrf import generate_csrf
        return dict(csrf_token=generate_csrf)

    @app.context_processor
    def inject_csp_nonce():
        if not hasattr(g, 'csp_nonce'):
            g.csp_nonce = secrets.token_urlsafe(16)
        return dict(csp_nonce=g.csp_nonce)

    @app.context_processor
    def inject_app_config():
        return dict(
            ENABLE_SSE=app.config.get('ENABLE_SSE', True),
            APP_VERSION='3.0',
        )