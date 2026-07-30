import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings


def create_access_token(data: dict) -> str:
    payload = data.copy()
    issued_at = datetime.now(UTC)
    payload["type"] = "access"
    payload["iat"] = issued_at
    payload["jti"] = secrets.token_urlsafe(16)
    payload["exp"] = issued_at + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        return None


def access_token_expires_in() -> int:
    return settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
