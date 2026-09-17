# tests/conftest.py
"""
Общие фикстуры для pytest.
"""
import os
import sys
import tempfile
import sqlite3

import pytest

# Чтобы импорты из корня работали
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)


# ============================================================
# ТЕСТОВАЯ БД
# ============================================================

@pytest.fixture
def temp_db_path():
    """Создаёт временный файл SQLite, удаляет после теста."""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    # Инициализируем схему
    from migrations import run_migrations
    run_migrations(path)

    yield path

    try:
        os.unlink(path)
    except OSError:
        pass


@pytest.fixture
def db(temp_db_path):
    """Database с временным файлом."""
    from database import Database
    return Database(temp_db_path)


@pytest.fixture
def db_with_users(db):
    """БД с тестовыми пользователями и кабинетом."""
    from passwords import hash_password

    with db.transaction(immediate=True) as tx:
        tx.execute('''
            INSERT INTO users
                (full_name, role, login, password, is_active)
            VALUES (?, ?, ?, ?, 1)
        ''', ['Иванов Иван Иванович', 'Администратор', 'admin', hash_password('admin123')])

        tx.execute('''
            INSERT INTO users
                (full_name, role, login, password, is_active)
            VALUES (?, ?, ?, ?, 1)
        ''', ['Петров Пётр Петрович', 'Техник', 'petrov', hash_password('petrov123')])

        tx.execute('''
            INSERT INTO users
                (full_name, role, login, password, is_active)
            VALUES (?, ?, ?, ?, 1)
        ''', ['Сидоров Сидор Сидорович', 'Пользователь', 'sidorov', hash_password('sidorov123')])

        tx.execute('''
            INSERT INTO cabinets
                (cabinet_number, floor, building, is_active)
            VALUES (?, ?, ?, 1)
        ''', ['Кабинет 101', '1 этаж', 'Корпус А'])

    return db


# ============================================================
# FLASK-APP
# ============================================================

@pytest.fixture
def app(temp_db_path, monkeypatch):
    """
    Создаёт Flask-приложение с временной БД.
    Отключает планировщик пинга и требует явной настройки.
    """
    # Отключаем пинг в тестах
    monkeypatch.setenv('DISABLE_PING_SCHEDULER', 'true')
    monkeypatch.setenv('SECRET_KEY', 'test-secret-key-for-pytest-only')
    monkeypatch.setenv('FLASK_ENV', 'testing')
    monkeypatch.setenv('DB_PATH', temp_db_path)

    from app import create_app
    app = create_app()
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False  # отключаем CSRF в тестах

    return app


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.test_client()