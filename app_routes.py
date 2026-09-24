# app_routes.py
"""
Базовые маршруты приложения: главная, health, current_user,
upload_avatar, cabinets, executors, search.
"""
import os
from datetime import datetime

from werkzeug.utils import secure_filename
from flask import (
    request, jsonify, session, redirect, url_for, render_template,
)

from utils import login_required
from logger import get_logger
from extensions import cache
from database import Database
from constants import ROLE_ADMIN, ROLE_TECH, ALLOWED_AVATAR_EXT
from validators import validate_file_extension

log = get_logger(__name__)


def register_base_routes(app):
    """Регистрирует базовые маршруты."""

    @app.route('/')
    def index():
        if 'user_id' not in session:
            return redirect(url_for('auth.login'))

        if session.get('user_role') == 'Разработчик':
            return redirect(url_for('dev_impersonate.dev_console_page'))

        return render_template('index.html')

    @app.route('/health')
    def health():
        return jsonify({
            'status': 'ok',
            'version': '2.9',
            'session_type': app.config.get('SESSION_TYPE', 'filesystem'),
            'cache_type': app.config.get('CACHE_TYPE'),
            'timestamp': datetime.now().isoformat(),
        }), 200

    @app.route('/api/current_user')
    @login_required
    def get_current_user():
        try:
            return jsonify({
                'id': session.get('user_id'),
                'full_name': session.get('user_name'),
                'role': session.get('user_role'),
                'avatar': session.get('user_avatar'),
                'email': session.get('user_email', ''),
                'phone': session.get('user_phone', ''),
                'department': session.get('user_department', ''),
                'login': session.get('user_login', ''),
                'login_time': session.get('login_time'),
            })
        except Exception as e:
            log.exception('Ошибка в get_current_user')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    @app.route('/api/upload_avatar', methods=['POST'])
    @login_required
    def upload_avatar():
        try:
            if 'avatar_file' not in request.files:
                return jsonify({
                    'success': False,
                    'error': 'Файл не найден',
                }), 400

            file = request.files['avatar_file']
            if not file or not file.filename:
                return jsonify({
                    'success': False,
                    'error': 'Файл не выбран',
                }), 400

            ok, err = validate_file_extension(
                file.filename, ALLOWED_AVATAR_EXT
            )
            if not ok:
                return jsonify({'success': False, 'error': err}), 400

            if not (file.mimetype or '').startswith('image/'):
                return jsonify({
                    'success': False,
                    'error': 'Не изображение',
                }), 400

            user_id = session.get('user_id')
            ext = file.filename.rsplit('.', 1)[1].lower()
            filename = secure_filename(
                f'user_{user_id}_'
                f'{datetime.now().strftime("%Y%m%d%H%M%S")}.{ext}'
            )
            filepath = os.path.join(
                app.config['UPLOAD_FOLDER_AVATARS'], filename
            )
            file.save(filepath)

            log.info(f'Загружен аватар: {filename} | user_id={user_id}')
            return jsonify({
                'success': True,
                'avatar_path': f'static/uploads/avatars/{filename}',
            })
        except Exception as e:
            log.exception('Ошибка загрузки аватара')
            return jsonify({
                'success': False,
                'error': f'Ошибка: {str(e)}',
            }), 500

    @app.route('/api/cabinets')
    @login_required
    @cache.cached(timeout=300, key_prefix='api_cabinets')
    def get_cabinets():
        db = Database(app.config['DB_PATH'])
        try:
            cabinets = db.query('''
                SELECT id, cabinet_number, floor, building, description,
                       responsible_person, phone
                FROM cabinets WHERE is_active = 1
                ORDER BY cabinet_number
            ''')
            return jsonify([dict(c) for c in cabinets])
        except Exception as e:
            log.exception('Ошибка получения кабинетов')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    @app.route('/api/cabinets/search')
    @login_required
    def search_cabinets():
        db = Database(app.config['DB_PATH'])
        try:
            query = request.args.get('q', '').strip()
            if not query:
                rows = db.query(
                    'SELECT * FROM cabinets WHERE is_active = 1 '
                    'ORDER BY cabinet_number'
                )
            else:
                like = f'%{query}%'
                rows = db.query('''
                    SELECT * FROM cabinets
                    WHERE is_active = 1
                      AND (cabinet_number LIKE ? OR description LIKE ?
                           OR floor LIKE ? OR building LIKE ?)
                    ORDER BY cabinet_number
                ''', [like, like, like, like])
            return jsonify([dict(c) for c in rows])
        except Exception as e:
            log.exception('Ошибка поиска кабинетов')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500

    @app.route('/api/executors')
    @login_required
    @cache.cached(timeout=60, key_prefix='api_executors')
    def get_executors():
        db = Database(app.config['DB_PATH'])
        try:
            rows = db.query('''
                SELECT id, full_name, role, department FROM users
                WHERE is_active = 1
                  AND role IN (?, ?)
                  AND deleted_at IS NULL
                ORDER BY full_name
            ''', [ROLE_ADMIN, ROLE_TECH])
            return jsonify([dict(e) for e in rows])
        except Exception as e:
            log.exception('Ошибка получения исполнителей')
            return jsonify({'error': f'Ошибка: {str(e)}'}), 500