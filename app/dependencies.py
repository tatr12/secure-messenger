from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.jwt import decode_access_token
from app.models import AuthSessionTable, UserTable
from app.repositories import SessionRepository, UserRepository

security = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class AuthContext:
    user: UserTable
    session: AuthSessionTable | None
    token: str
    payload: dict


async def authenticate_access_token(
    token: str,
    db: AsyncSession,
) -> AuthContext | None:
    payload = decode_access_token(token)
    if payload is None:
        return None

    token_type = payload.get("type")
    session_id = payload.get("sid")
    if token_type not in (None, "access"):
        return None
    if token_type == "access" and not session_id:
        return None

    username = payload.get("sub")
    user_id = payload.get("user_id")
    if not username or not user_id:
        return None

    user = await UserRepository(db).get_by_username(username)
    if user is None or user.id != user_id or not user.is_active:
        return None

    session = None
    if session_id:
        session = await SessionRepository(db).get_active_by_id(
            session_id,
            user_id=user.id,
        )
        if session is None:
            return None

    return AuthContext(
        user=user,
        session=session,
        token=token,
        payload=payload,
    )


async def get_current_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    context = await authenticate_access_token(credentials.credentials, db)
    if context is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return context


async def get_current_user(
    context: AuthContext = Depends(get_current_auth),
) -> UserTable:
    return context.user
