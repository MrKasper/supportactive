# tests/test_tasks.py
"""Тесты логики заявок."""
from datetime import datetime, timedelta

import pytest


# ============================================================
# _check_executor_busy
# ============================================================

class TestCheckExecutorBusy:
    def test_no_executor(self, db_with_users):
        from tasks import _check_executor_busy
        import tasks
        tasks.db = db_with_users

        ok, err, conflict = _check_executor_busy('', '2026-01-15 10:00', 60)
        assert ok
        assert err is None

    def test_no_conflicts(self, db_with_users):
        from tasks import _check_executor_busy
        import tasks
        tasks.db = db_with_users

        ok, err, conflict = _check_executor_busy(
            'Петров Пётр Петрович', '2026-01-15 10:00', 60,
        )
        assert ok

    def test_overlap_detected(self, db_with_users):
        """Заявка с 10:00 на 60 минут, новая с 10:30 на 60 — конфликт."""
        db = db_with_users
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO tasks
                    (deadline, executor, status, duration_minutes, created_date)
                VALUES (?, ?, ?, ?, ?)
            ''', [
                '2026-01-15 10:00:00', 'Петров Пётр Петрович',
                'Новое', 60, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            ])

        import tasks
        tasks.db = db
        from tasks import _check_executor_busy

        ok, err, conflict = _check_executor_busy(
            'Петров Пётр Петрович', '2026-01-15 10:30', 60,
        )
        assert not ok
        assert 'занят' in err

    def test_no_overlap_boundary(self, db_with_users):
        """Заявка с 10:00 до 11:00, новая с 11:00 — не конфликт."""
        db = db_with_users
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO tasks
                    (deadline, executor, status, duration_minutes, created_date)
                VALUES (?, ?, ?, ?, ?)
            ''', [
                '2026-01-15 10:00:00', 'Петров Пётр Петрович',
                'Новое', 60, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            ])

        import tasks
        tasks.db = db
        from tasks import _check_executor_busy

        ok, err, conflict = _check_executor_busy(
            'Петров Пётр Петрович', '2026-01-15 11:00', 60,
        )
        assert ok

    def test_completed_task_does_not_conflict(self, db_with_users):
        """Выполненные заявки игнорируются."""
        db = db_with_users
        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO tasks
                    (deadline, executor, status, duration_minutes, created_date)
                VALUES (?, ?, ?, ?, ?)
            ''', [
                '2026-01-15 10:00:00', 'Петров Пётр Петрович',
                'Выполнено', 60, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            ])

        import tasks
        tasks.db = db
        from tasks import _check_executor_busy

        ok, err, conflict = _check_executor_busy(
            'Петров Пётр Петрович', '2026-01-15 10:30', 60,
        )
        assert ok

    def test_exclude_self(self, db_with_users):
        """При обновлении заявки она сама не считается конфликтом."""
        db = db_with_users
        with db.transaction(immediate=True) as tx:
            task_id = tx.execute('''
                INSERT INTO tasks
                    (deadline, executor, status, duration_minutes, created_date)
                VALUES (?, ?, ?, ?, ?)
            ''', [
                '2026-01-15 10:00:00', 'Петров Пётр Петрович',
                'Новое', 60, datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            ])

        import tasks
        tasks.db = db
        from tasks import _check_executor_busy

        ok, err, conflict = _check_executor_busy(
            'Петров Пётр Петрович', '2026-01-15 10:00', 60,
            exclude_task_id=task_id,
        )
        assert ok


# ============================================================
# API /api/tasks
# ============================================================

class TestTasksAPI:
    def test_list_requires_auth(self, client):
        resp = client.get('/api/tasks')
        assert resp.status_code == 401

    def test_list_returns_empty(self, app, client):
        """Пустой список после логина администратора."""
        # Наполняем БД
        from database import Database
        db = Database(app.config['DB_PATH'])
        from passwords import hash_password

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO users (full_name, role, login, password, is_active)
                VALUES (?, ?, ?, ?, 1)
            ''', ['Админ А.А.', 'Администратор', 'admin', hash_password('admin123')])

        # Логинимся
        resp = client.post('/api/auth/login', json={
            'login': 'admin',
            'password': 'admin123',
        })
        assert resp.status_code == 200
        assert resp.get_json()['success']

        # Получаем список
        resp = client.get('/api/tasks')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'items' in data
        assert data['items'] == []
        assert data['total'] == 0

    def test_login_wrong_password(self, app, client):
        from database import Database
        db = Database(app.config['DB_PATH'])
        from passwords import hash_password

        with db.transaction(immediate=True) as tx:
            tx.execute('''
                INSERT INTO users (full_name, role, login, password, is_active)
                VALUES (?, ?, ?, ?, 1)
            ''', ['Админ А.А.', 'Администратор', 'admin', hash_password('admin123')])

        resp = client.post('/api/auth/login', json={
            'login': 'admin',
            'password': 'wrong',
        })
        data = resp.get_json()
        assert not data['success']


# ============================================================
# _invalidate_task_caches
# ============================================================

class TestInvalidateCaches:
    def test_no_exception(self):
        from tasks import _invalidate_task_caches
        # Не должно падать, даже если cache недоступен
        _invalidate_task_caches()