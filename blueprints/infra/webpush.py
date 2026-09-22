# webpush.py
"""
Web Push: подписка клиентов и отправка уведомлений.
"""
import os
import json
from datetime import datetime
from flask import Blueprint, request, jsonify, session
from database import Database
from utils import login_required

from pywebpush import webpush, WebPushException

webpush_bp = Blueprint('webpush', __name__)
db = Database()

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_ADMIN_EMAIL = os.environ.get('VAPID_ADMIN_EMAIL', 'admin@example.com')


def webpush_enabled():
    """Проверка, настроены ли VAPID-ключи."""
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


# ============= API ДЛЯ ПОДПИСКИ =============

@webpush_bp.route('/api/webpush/vapid-public-key')
@login_required
def get_vapid_public_key():
    """Отдаём публичный ключ фронтенду для подписки."""
    if not webpush_enabled():
        return jsonify({'error': 'Web Push не настроен на сервере'}), 503
    return jsonify({'publicKey': VAPID_PUBLIC_KEY})


@webpush_bp.route('/api/webpush/subscribe', methods=['POST'])
@login_required
def subscribe():
    """Сохранение подписки браузера."""
    try:
        data = request.get_json()
        if not data or 'endpoint' not in data:
            return jsonify({'success': False, 'error': 'Нет данных подписки'}), 400

        endpoint = data['endpoint']
        keys = data.get('keys', {})
        p256dh = keys.get('p256dh', '')
        auth = keys.get('auth', '')

        if not p256dh or not auth:
            return jsonify({'success': False, 'error': 'Некорректные ключи подписки'}), 400

        user_id = session.get('user_id')
        ua = request.headers.get('User-Agent', '')[:500]
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Upsert по endpoint
        existing = db.query(
            'SELECT id FROM push_subscriptions WHERE endpoint = ?',
            [endpoint], one=True
        )

        if existing:
            db.execute('''
                UPDATE push_subscriptions
                SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, last_used_at = ?
                WHERE endpoint = ?
            ''', [user_id, p256dh, auth, ua, now, endpoint])
        else:
            db.execute('''
                INSERT INTO push_subscriptions
                    (user_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', [user_id, endpoint, p256dh, auth, ua, now, now])

        return jsonify({'success': True, 'message': 'Подписка сохранена'})

    except Exception as e:
        return jsonify({'success': False, 'error': f'Ошибка подписки: {str(e)}'}), 500


@webpush_bp.route('/api/webpush/unsubscribe', methods=['POST'])
@login_required
def unsubscribe():
    """Удаление подписки (например, при выходе)."""
    try:
        data = request.get_json() or {}
        endpoint = data.get('endpoint', '')
        if endpoint:
            db.execute('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============= ОТПРАВКА УВЕДОМЛЕНИЙ =============

def send_web_push(user_id, title, body, url='/', tag=None):
    """
    Отправляет push-уведомление всем подпискам пользователя.
    Автоматически удаляет мёртвые подписки (404/410).
    """
    if not webpush_enabled():
        return 0

    subs = db.query(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
        [user_id]
    )

    if not subs:
        return 0

    payload = json.dumps({
        'title': title,
        'body': body,
        'url': url,
        'tag': tag or 'support-active'
    })

    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    'endpoint': sub['endpoint'],
                    'keys': {
                        'p256dh': sub['p256dh'],
                        'auth': sub['auth']
                    }
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={'sub': f'mailto:{VAPID_ADMIN_EMAIL}'}
            )
            sent += 1
        except WebPushException as e:
            status = getattr(e.response, 'status_code', None) if e.response else None
            # 404/410 — подписка мертва, удаляем
            if status in (404, 410):
                db.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub['id']])
                print(f"[WebPush] Удалена мёртвая подписка #{sub['id']} (status={status})")
            else:
                print(f"[WebPush] Ошибка отправки на {sub['endpoint'][:60]}: {e}")
        except Exception as e:
            print(f"[WebPush] Неожиданная ошибка: {e}")

    return sent


def send_web_push_to_users(user_ids, title, body, url='/', tag=None):
    """Массовая отправка списку пользователей."""
    total = 0
    for uid in set(user_ids):
        total += send_web_push(uid, title, body, url, tag)
    return total