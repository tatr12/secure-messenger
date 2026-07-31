import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Response

from app.config import settings


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def refresh_token_expires_at() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def set_refresh_cookie(
    response: Response,
    token: str,
    *,
    expires_at: datetime,
) -> None:
    remaining_seconds = max(
        0,
        int((expires_at - datetime.now(UTC)).total_seconds()),
    )
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=remaining_seconds,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="strict",
        path="/",
    )
