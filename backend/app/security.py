"""Password hashing and session tokens, using only the standard library.

Deliberately no bcrypt / passlib / PyJWT. Every extra dependency is one more
thing that can fail to install on a teammate's laptop the night before a demo.
PBKDF2-HMAC-SHA256 and HMAC-signed tokens are both in Python's stdlib and are
the right primitives for this job.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from .config import SECRET_KEY, TOKEN_TTL_SECONDS

PBKDF2_ROUNDS = 120_000


# --------------------------------------------------------------------------
# passwords
# --------------------------------------------------------------------------

def hash_password(password: str, salt: bytes | None = None) -> str:
    """Return 'pbkdf2_sha256$rounds$salt$hash'."""
    salt = salt or os.urandom(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS
    )
    return "$".join(
        [
            "pbkdf2_sha256",
            str(PBKDF2_ROUNDS),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(derived).decode("ascii"),
        ]
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt_b64, hash_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            base64.b64decode(salt_b64),
            int(rounds),
        )
        # compare_digest avoids leaking information through timing.
        return hmac.compare_digest(derived, base64.b64decode(hash_b64))
    except Exception:
        return False


# --------------------------------------------------------------------------
# tokens
# --------------------------------------------------------------------------

def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload_b64: str) -> str:
    signature = hmac.new(
        SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256
    ).digest()
    return _b64url_encode(signature)


def create_token(claims: dict) -> str:
    body = dict(claims)
    body["exp"] = int(time.time()) + TOKEN_TTL_SECONDS
    payload_b64 = _b64url_encode(
        json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    return f"{payload_b64}.{_sign(payload_b64)}"


def read_token(token: str) -> dict | None:
    """Return the claims, or None if the token is malformed, forged or expired."""
    try:
        payload_b64, signature = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(_sign(payload_b64), signature):
        return None
    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:
        return None
    if not isinstance(claims, dict):
        return None
    if int(claims.get("exp", 0)) < int(time.time()):
        return None
    return claims
