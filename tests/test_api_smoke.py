# tests/test_cartridges_api.py
"""Тесты API картриджей."""

from database import Database


class TestCartridgesCreate:
    def test_create_minimal(self, admin_client):
        r = admin_client.post('/api/cartridges', json={
            'cabinet': '101',
            'printer': 'HP LaserJet',
            'cartridge': 'HP 26A',
            'replacement_dates': ['2026-09-01'],
            'notes': 'Тест',
        })
        assert r.status_code == 201
        data = r.get_json()
        assert data['success'] is True
        assert data['cartridge_id'] > 0

    def test_create_without_dates(self, admin_client):
        """Дата замены — необязательное поле."""
        r = admin_client.post('/api/cartridges', json={
            'cabinet': '102',
            'printer': 'Canon MF',
            'cartridge': 'Canon 057',
            'replacement_dates': [],
        })
        assert r.status_code == 201

    def test_create_missing_cabinet(self, admin_client):
        r = admin_client.post('/api/cartridges', json={
            'printer': 'HP',
            'cartridge': 'HP 26A',
        })
        assert r.status_code == 400

    def test_create_missing_printer(self, admin_client):
        r = admin_client.post('/api/cartridges', json={
            'cabinet': '101',
            'cartridge': 'HP 26A',
        })
        assert r.status_code == 400

    def test_create_duplicate(self, admin_client):
        payload = {
            'cabinet': '103',
            'printer': 'Brother HL',
            'cartridge': 'TN-431',
            'replacement_dates': ['2026-09-01'],
        }
        r1 = admin_client.post('/api/cartridges', json=payload)
        assert r1.status_code == 201

        r2 = admin_client.post('/api/cartridges', json=payload)
        assert r2.status_code == 400
        assert 'уже существует' in r2.get_json()['error'].lower()


class TestCartridgesList:
    def test_list_empty(self, admin_client):
        r = admin_client.get('/api/cartridges')
        assert r.status_code == 200
        assert r.get_json() == []

    def test_list_sorted_by_latest_date(self, admin_client):
        """Свежие даты — впереди, без дат — в конце."""
        # Без даты
        admin_client.post('/api/cartridges', json={
            'cabinet': '101', 'printer': 'P1', 'cartridge': 'C1',
        })
        # Старая дата
        admin_client.post('/api/cartridges', json={
            'cabinet': '101', 'printer': 'P2', 'cartridge': 'C2',
            'replacement_dates': ['2025-01-01'],
        })
        # Свежая дата
        admin_client.post('/api/cartridges', json={
            'cabinet': '101', 'printer': 'P3', 'cartridge': 'C3',
            'replacement_dates': ['2026-09-01'],
        })

        r = admin_client.get('/api/cartridges')
        items = r.get_json()
        assert len(items) == 3
        assert items[0]['latest_date'] == '2026-09-01'
        assert items[1]['latest_date'] == '2025-01-01'
        assert items[2]['latest_date'] == ''


class TestCartridgesDelete:
    def test_delete(self, admin_client):
        r = admin_client.post('/api/cartridges', json={
            'cabinet': '101', 'printer': 'P', 'cartridge': 'C',
        })
        cid = r.get_json()['cartridge_id']

        r = admin_client.delete(f'/api/cartridges/{cid}')
        assert r.status_code == 200
        assert r.get_json()['success'] is True

    def test_delete_not_found(self, admin_client):
        r = admin_client.delete('/api/cartridges/99999')
        assert r.status_code == 404