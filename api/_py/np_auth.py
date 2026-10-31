"""New Page member sessions, checked the same way as lib/newpage-auth.js (HS256, secret derived from JWT_SECRET)."""
import base64
import hashlib
import hmac
import json
import os
import time


def _b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def session_claims(token: str):
    """The token's payload when it is a valid, unexpired member session, else None."""
    try:
        head, body, sig = token.split(".")
        secret = hmac.new((os.environ.get("JWT_SECRET") or "").encode(), b"newpage-member-v1", hashlib.sha256).hexdigest()
        want = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(want, _b64url(sig)):
            return None
        p = json.loads(_b64url(body))
        return p if p.get("typ") == "session" and float(p.get("exp", 0)) > time.time() else None
    except Exception:
        return None


def verify_session(token: str) -> bool:
    return session_claims(token) is not None


def derived_secret(purpose: bytes) -> str:
    """A separate key per use, derived from JWT_SECRET."""
    return hmac.new((os.environ.get("JWT_SECRET") or "").encode(), purpose, hashlib.sha256).hexdigest()
