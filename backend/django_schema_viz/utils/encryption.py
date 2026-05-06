"""
Symmetric encryption helpers for storing secrets (e.g. API keys) at rest.

Uses Django's signing framework which derives keys from SECRET_KEY.
The value is signed + base64-encoded so tampering is detectable.
"""

from django.core.signing import Signer, BadSignature

_signer = Signer(salt="django_schema_viz.ai_key")


def encrypt_value(plaintext: str) -> str:
    """Sign and encode a plaintext value for safe DB storage."""
    return _signer.sign(plaintext)


def decrypt_value(stored: str) -> str | None:
    """Decrypt a stored value. Returns None if tampered or invalid."""
    try:
        return _signer.unsign(stored)
    except BadSignature:
        return None
