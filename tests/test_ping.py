# tests/test_ping.py
"""Тесты сервиса пинга."""
from unittest.mock import patch, MagicMock

import pytest

from services import ping as ping_module


# ============================================================
# _ping_host
# ============================================================

class TestPingHost:
    def test_empty_ip(self):
        assert ping_module._ping_host('') == 'offline'
        assert ping_module._ping_host(None) == 'offline'

    def test_invalid_ip_format(self):
        """Некорректные символы — сразу offline без запуска ping."""
        assert ping_module._ping_host('bad;ip') == 'offline'
        assert ping_module._ping_host('a b c') == 'offline'

    @patch('services.ping.subprocess.run')
    @patch('services.ping.platform.system', return_value='Linux')
    def test_online(self, mock_platform, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        assert ping_module._ping_host('192.168.1.1') == 'online'

    @patch('services.ping.subprocess.run')
    @patch('services.ping.platform.system', return_value='Linux')
    def test_offline(self, mock_platform, mock_run):
        mock_run.return_value = MagicMock(returncode=1)
        assert ping_module._ping_host('192.168.1.1') == 'offline'

    @patch('services.ping.subprocess.run')
    @patch('services.ping.platform.system', return_value='Windows')
    def test_windows_command(self, mock_platform, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        ping_module._ping_host('10.0.0.1', timeout_sec=1)
        # Проверяем, что использовалась Windows-команда
        args, kwargs = mock_run.call_args
        assert args[0][0] == 'ping'
        assert '-n' in args[0]

    @patch('services.ping.subprocess.run')
    def test_timeout_returns_offline(self, mock_run):
        from subprocess import TimeoutExpired
        mock_run.side_effect = TimeoutExpired(cmd='ping', timeout=2)
        assert ping_module._ping_host('192.168.1.1') == 'offline'

    @patch('services.ping.subprocess.run')
    def test_ping_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        assert ping_module._ping_host('192.168.1.1') == 'offline'


# ============================================================
# ping_one_computer
# ============================================================

class TestPingOneComputer:
    def test_no_ip(self, db):
        """ПК без IP — пропускается."""
        result = ping_module.ping_one_computer({'id': 1, 'ip_address': ''})
        assert result is None

    @patch('services.ping._ping_host', return_value='online')
    def test_online_updates_db(self, mock_ping, db):
        # Вставляем ПК
        with db.transaction(immediate=True) as tx:
            pc_id = tx.execute('''
                INSERT INTO cabinet_computers (cabinet_id, name, ip_address, status)
                VALUES (1, 'PC-1', '192.168.1.1', 'offline')
            ''')

        # Подменяем db в модуле
        ping_module.db = db

        result = ping_module.ping_one_computer({'id': pc_id, 'ip_address': '192.168.1.1'})
        assert result is not None
        assert result['status'] == 'online'

        # Проверяем статистику
        row = db.query(
            'SELECT status, ping_count, ping_success_count FROM cabinet_computers WHERE id = ?',
            [pc_id], one=True,
        )
        assert row['status'] == 'online'
        assert row['ping_count'] == 1
        assert row['ping_success_count'] == 1

    @patch('services.ping._ping_host', return_value='offline')
    def test_offline_updates_stats(self, mock_ping, db):
        with db.transaction(immediate=True) as tx:
            pc_id = tx.execute('''
                INSERT INTO cabinet_computers (cabinet_id, name, ip_address, status)
                VALUES (1, 'PC-2', '192.168.1.2', 'online')
            ''')

        ping_module.db = db

        result = ping_module.ping_one_computer({'id': pc_id, 'ip_address': '192.168.1.2'})
        assert result['status'] == 'offline'

        row = db.query(
            'SELECT status, ping_count, ping_success_count FROM cabinet_computers WHERE id = ?',
            [pc_id], one=True,
        )
        assert row['status'] == 'offline'
        assert row['ping_count'] == 1
        assert row['ping_success_count'] == 0


# ============================================================
# ping_all_computers
# ============================================================

class TestPingAllComputers:
    def test_empty_db(self, db):
        ping_module.db = db
        result = ping_module.ping_all_computers()
        assert result['total'] == 0
        assert result['online'] == 0
        assert result['offline'] == 0

    @patch('services.ping._ping_host', return_value='online')
    def test_all_online(self, mock_ping, db):
        with db.transaction(immediate=True) as tx:
            for i in range(3):
                tx.execute('''
                    INSERT INTO cabinet_computers (cabinet_id, name, ip_address)
                    VALUES (1, ?, ?)
                ''', [f'PC-{i}', f'192.168.1.{i+1}'])

        ping_module.db = db
        result = ping_module.ping_all_computers()
        assert result['total'] == 3
        assert result['online'] == 3
        assert result['offline'] == 0

    @patch('services.ping._ping_host')
    def test_mixed(self, mock_ping, db):
        mock_ping.side_effect = ['online', 'offline', 'online']

        with db.transaction(immediate=True) as tx:
            for i in range(3):
                tx.execute('''
                    INSERT INTO cabinet_computers (cabinet_id, name, ip_address)
                    VALUES (1, ?, ?)
                ''', [f'PC-{i}', f'192.168.1.{i+1}'])

        ping_module.db = db
        result = ping_module.ping_all_computers()
        assert result['total'] == 3
        assert result['online'] == 2
        assert result['offline'] == 1