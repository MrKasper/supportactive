# tests/conftest.py
"""
Общие фикстуры для всех тестов.
"""
import os
import sys
import tempfile
import shutil

import pytest

# Корень проекта — в sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


@pytest.fixture(scope='function')
def temp_db(tmp_path):
    """Временная копия схемы БД для тестов."""
    db_path = str(tmp_path / 'test.db')

    # Мигрируем пустую БД
    from migrations import run_migrations
    run_migrations(db_path)

    # Добавляем минимальные данные для входа
    from passwords import hash_password
    from database import Database
    db = Database(db_path)

    db.execute('''
        INSERT INTO users
            (full_name, role, avatar, email, phone, department,
             login, password, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
        'Админ Тестов Тестович', 'Администратор', 'default.png',
        '', '', 'IT',
        'test_admin', hash_password('admin123'), 1,
    ])
    db.execute('''
        INSERT INTO users
            (full_name, role, avatar, email, phone, department,
             login, password, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
        'Техник Тестов Тестович', 'Техник', 'default.png',
        '', '', 'IT',
        'test_tech', hash_password('tech123'), 1,
    ])

    yield db_path

    # Чистим temp
    if os.path.exists(db_path):
        try:
            os.unlink(db_path)
        except Exception:
            pass


@pytest.fixture(scope='function')
def app(temp_db):
    """Flask-приложение с временной БД."""
    os.environ['DB_PATH'] = temp_db
    os.environ['FLASK_ENV'] = 'development'

    from app import create_app
    from config import DevelopmentConfig

    # Переопределяем конфиг для теста
    class TestConfig(DevelopmentConfig):
        TESTING = True
        WTF_CSRF_ENABLED = False
        RATELIMIT_ENABLED = False
        SESSION_TYPE = 'filesystem'
        CACHE_TYPE = 'SimpleCache'
        DB_PATH = temp_db
        DISABLE_PING_SCHEDULER = True

    app = create_app(TestConfig)
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    app.config['RATELIMIT_ENABLED'] = False

    yield app

    # Чистка
    try:
        from extensions import limiter, cache
        limiter.reset()
        cache.clear()
    except Exception:
        pass


@pytest.fixture(scope='function')
def client(app):
    """Flask test client."""
    return app.test_client()


@pytest.fixture(scope='function')
def admin_client(client):
    """Test client с авторизованным администратором."""
    with client.session_transaction() as sess:
        # Находим админа
        from database import Database
        db = Database()
        user = db.query(
            "SELECT * FROM users WHERE login = 'test_admin'",
            one=True,
        )
        if user:
            sess['user_id'] = user['id']
            sess['user_name'] = user['full_name']
            sess['user_role'] = user['role']
            sess['user_login'] = user['login']
    return client


@pytest.fixture(scope='function')
def tech_client(client):
    """Test client с авторизованным техником."""
    with client.session_transaction() as sess:
        from database import Database
        db = Database()
        user = db.query(
            "SELECT * FROM users WHERE login = 'test_tech'",
            one=True,
        )
        if user:
            sess['user_id'] = user['id']
            sess['user_name'] = user['full_name']
            sess['user_role'] = user['role']
            sess['user_login'] = user['login']
    return client