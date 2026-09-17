# generate_vapid.py
"""
Генерация VAPID-ключей для Web Push.
Запускать один раз: python generate_vapid.py
"""
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def generate_vapid_keys():
    """Генерирует пару ключей P-256 для VAPID."""
    private_key = ec.generate_private_key(ec.SECP256R1())

    # Приватный ключ в формате PEM (сохранить в .env.example, никому не показывать!)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')

    # Публичный ключ в base64url (отдаётся фронтенду)
    public_key = private_key.public_key()
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    public_b64 = base64.urlsafe_b64encode(public_bytes).decode('utf-8').rstrip('=')

    return private_pem, public_b64


if __name__ == '__main__':
    priv, pub = generate_vapid_keys()
    print("=" * 60)
    print("Добавьте эти строки в .env.example:")
    print("=" * 60)
    print(f"\nVAPID_PUBLIC_KEY={pub}")
    print(f"\nVAPID_PRIVATE_KEY=\"{priv}\"")
    print("\nVAPID_ADMIN_EMAIL=admin@yourdomain.com")
    print("=" * 60)