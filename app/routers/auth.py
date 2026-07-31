import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, redis_mgr
from app.dependencies import AuthContext, get_current_auth, get_current_user, security
from app.jwt import access_token_expires_in, create_access_token, decode_access_token
from app.key_envelopes import deserialize_key_envelope, is_key_envelope_v2
from app.message_protocol import serialize_message
from app.repositories import MessageRepository, SessionRepository, UserRepository
from app.schemas import (
    KeyEnvelopeResponseSchema,
    PublicUserSchema,
    RegisterSchema,
    SessionResponseSchema,
    UpdateKeyEnvelopeSchema,
    UpdateProfileSchema,
)
from app.security import verify_password
from app.services import (
    generate_verification_token,
    send_verification_email,
    store_verification_token,
    verify_token,
)
from app.session_tokens import (
    clear_refresh_cookie,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expires_at,
    set_refresh_cookie,
)

router = APIRouter(tags=["Auth & Profile"])
logger = logging.getLogger(__name__)


def _client_metadata(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    if user_agent:
        user_agent = user_agent[:512]
    ip_address = request.client.host[:45] if request.client else None
    return user_agent, ip_address


def _token_response(user, session_id: str) -> dict:
    access_token = create_access_token(
        {
            "sub": user.username,
            "user_id": user.id,
            "sid": session_id,
        }
    )
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": access_token_expires_in(),
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "bio": user.bio,
            "avatar_url": user.avatar_url,
            "is_verified": user.is_verified,
        },
    }


async def _publish_session_revocation(session_id: str | None) -> None:
    if not session_id:
        return
    try:
        await redis_mgr.publish_message(
            "messenger_routing",
            {"type": "session_revoked", "session_id": session_id},
        )
    except Exception:
        logger.warning("Failed to publish session revocation", exc_info=True)


def _invalid_session_response(detail: str) -> JSONResponse:
    response = JSONResponse(status_code=401, content={"detail": detail})
    response.headers["Cache-Control"] = "no-store"
    clear_refresh_cookie(response)
    return response


@router.post("/register")
async def register(data: RegisterSchema, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    if await repo.get_by_username(data.username):
        return JSONResponse(
            status_code=400, content={"detail": "Username already taken"}
        )

    # Check if email is already registered
    existing_user = await repo.get_by_email(data.email)
    if existing_user:
        return JSONResponse(
            status_code=400, content={"detail": "Email already registered"}
        )

    try:
        # Create user (not verified yet)
        await repo.create_user(data)

        # Generate and store verification token
        token = await generate_verification_token()
        await store_verification_token(token, data.username, data.email)

        # Send verification email
        try:
            await send_verification_email(data.email, token)
        except Exception as e:
            print(f"[WARN] Failed to send verification email to {data.email}: {str(e)}")
            # Continue anyway - token is stored in Redis and user can verify manually

        return JSONResponse(
            status_code=201,
            content={
                "status": "success",
                "message": "Registration successful. Check your email for verification link.",
            },
        )
    except Exception as e:
        print(f"[ERROR] Registration failed for {data.username}: {str(e)}")
        return JSONResponse(
            status_code=500, content={"detail": f"Registration failed: {str(e)}"}
        )


@router.get("/verify")
async def verify_email(
    token: str = Query(..., description="Verification token"),
    db: AsyncSession = Depends(get_db),
):
    # Verify token
    user_data = await verify_token(token)
    if not user_data:
        return JSONResponse(
            status_code=400, content={"error": "Invalid or expired verification token"}
        )

    # Mark user as verified
    try:
        repo = UserRepository(db)
        user = await repo.get_by_username(user_data["username"])
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        await repo.verify_user(user.username)
        return {"status": "success", "message": "Email verified successfully"}
    except Exception as e:
        return JSONResponse(
            status_code=500, content={"error": f"Verification failed: {str(e)}"}
        )


@router.post("/login")
async def login(
    data: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return JSONResponse(
            status_code=400, content={"error": "Username and password required"}
        )

    repo = UserRepository(db)
    user = await repo.get_by_username(username)

    if not user:
        return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

    # Check if user is verified
    if not user.is_verified:
        return JSONResponse(
            status_code=403,
            content={"error": "Email not verified. Please check your inbox."},
        )

    if not user.password_hash or not verify_password(password, user.password_hash):
        return JSONResponse(status_code=401, content={"error": "Invalid credentials"})

    session_repo = SessionRepository(db)
    existing_refresh_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if existing_refresh_token:
        revoked_session_id = await session_repo.revoke_by_refresh_hash(
            hash_refresh_token(existing_refresh_token)
        )
        await _publish_session_revocation(revoked_session_id)

    refresh_token = generate_refresh_token()
    expires_at = refresh_token_expires_at()
    user_agent, ip_address = _client_metadata(request)
    session = await session_repo.create_session(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    set_refresh_cookie(response, refresh_token, expires_at=expires_at)
    response.headers["Cache-Control"] = "no-store"

    return _token_response(user, session.id)


@router.post("/session/refresh")
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    refresh_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not refresh_token:
        return _invalid_session_response("Refresh session required")

    session_repo = SessionRepository(db)
    session = await session_repo.get_by_refresh_hash_for_update(
        hash_refresh_token(refresh_token)
    )
    now = datetime.now(UTC)
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        if session is not None:
            await session_repo.revoke_session(session)
            await _publish_session_revocation(session.id)
        return _invalid_session_response("Invalid or expired session")

    user = await UserRepository(db).get_by_id(session.user_id)
    if user is None or not user.is_active:
        await session_repo.revoke_session(session)
        await _publish_session_revocation(session.id)
        return _invalid_session_response("Session user is unavailable")

    rotated_refresh_token = generate_refresh_token()
    await session_repo.rotate_refresh_token(
        session,
        hash_refresh_token(rotated_refresh_token),
    )
    set_refresh_cookie(
        response,
        rotated_refresh_token,
        expires_at=session.expires_at,
    )
    return _token_response(user, session.id)


@router.post("/session/logout", status_code=204)
async def logout_session(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    session_repo = SessionRepository(db)
    revoked_session_ids: set[str] = set()

    refresh_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if refresh_token:
        revoked_session_id = await session_repo.revoke_by_refresh_hash(
            hash_refresh_token(refresh_token)
        )
        if revoked_session_id:
            revoked_session_ids.add(revoked_session_id)

    if credentials is not None:
        payload = decode_access_token(credentials.credentials)
        if payload and payload.get("sid") and payload.get("user_id"):
            revoked_session_id = await session_repo.revoke_by_id_for_user(
                payload["sid"],
                payload["user_id"],
            )
            if revoked_session_id:
                revoked_session_ids.add(revoked_session_id)

    clear_refresh_cookie(response)
    for session_id in revoked_session_ids:
        await _publish_session_revocation(session_id)
    response.status_code = 204


@router.get("/sessions", response_model=list[SessionResponseSchema])
async def list_sessions(
    current_auth: AuthContext = Depends(get_current_auth),
    db: AsyncSession = Depends(get_db),
):
    sessions = await SessionRepository(db).list_active(current_auth.user.id)
    current_session_id = current_auth.session.id if current_auth.session else None
    return [
        {
            "id": session.id,
            "current": session.id == current_session_id,
            "user_agent": session.user_agent,
            "ip_address": session.ip_address,
            "created_at": session.created_at,
            "last_used_at": session.last_used_at,
            "expires_at": session.expires_at,
        }
        for session in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=204)
async def revoke_session(
    session_id: str,
    response: Response,
    current_auth: AuthContext = Depends(get_current_auth),
    db: AsyncSession = Depends(get_db),
):
    revoked_session_id = await SessionRepository(db).revoke_by_id_for_user(
        session_id,
        current_auth.user.id,
    )
    if revoked_session_id is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if current_auth.session and current_auth.session.id == session_id:
        clear_refresh_cookie(response)
    await _publish_session_revocation(revoked_session_id)
    response.status_code = 204


@router.get(
    "/me/key-envelope",
    response_model=KeyEnvelopeResponseSchema,
    response_model_exclude_none=True,
)
async def get_key_envelope(
    response: Response,
    current_user=Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store"
    key_envelope = deserialize_key_envelope(
        current_user.encrypted_private_key,
        current_user.private_key_iv,
    )
    payload = {
        "public_key": current_user.public_key,
        "key_envelope": key_envelope,
    }
    if key_envelope.version == 1:
        payload["encrypted_private_key"] = key_envelope.ciphertext
        payload["private_key_iv"] = key_envelope.iv
    return payload


@router.put("/me/key-envelope")
async def update_key_envelope(
    data: UpdateKeyEnvelopeSchema,
    response: Response,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"

    if is_key_envelope_v2(current_user.encrypted_private_key):
        return {"status": "already_current", "version": 2}

    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Invalid credentials")

    repo = UserRepository(db)
    await repo.update_key_envelope(current_user, data.key_envelope)
    return {"status": "migrated", "version": 2}


@router.get("/user/{username}", response_model=PublicUserSchema)
async def get_user(username: str, db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    db_user = await repo.get_by_username(username)
    if not db_user:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    is_online = await redis_mgr.check_online(username)
    return {
        "id": db_user.id,  # <-- ТЕПЕРЬ ОТДАЕМ ID НА ФРОНТЕНД
        "username": db_user.username,
        "display_name": db_user.display_name,
        "bio": db_user.bio,
        "avatar_url": db_user.avatar_url,
        "public_key": db_user.public_key,
        "is_online": is_online,
    }


@router.get("/search")
async def search_users(
    q: str = "", exclude: str = "", db: AsyncSession = Depends(get_db)
):
    if not q:
        return []
    repo = UserRepository(db)
    users = await repo.search_users(q, exclude)

    results = []
    for u in users:
        results.append(
            {
                "username": u.username,
                "display_name": u.display_name,
                "bio": u.bio,
                "is_online": await redis_mgr.check_online(u.username),
            }
        )
    return results


# --- ВОСКРЕШАЕМ ЭНДПОИНТ ОБНОВЛЕНИЯ ПРОФИЛЯ ---
@router.post("/user/update")
async def update_profile(
    data: UpdateProfileSchema,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = UserRepository(db)
    updated_user = await repo.update_user_profile(
        current_user.username,
        data.display_name,
        data.bio,
    )
    if not updated_user:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    return {
        "status": "success",
        "display_name": updated_user.display_name,
        "bio": updated_user.bio,
    }


@router.get("/history")
async def get_history(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = MessageRepository(db)
    messages = await repo.get_history(current_user.username)
    return [serialize_message(message) for message in messages]


@router.get("/history/page")
async def get_history_page(
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = MessageRepository(db)
    messages = await repo.get_history_page(
        current_user.username,
        before_id=before_id,
        limit=limit + 1,
    )
    has_more = len(messages) > limit
    if has_more:
        messages = messages[1:]

    return {
        "messages": [serialize_message(message) for message in messages],
        "next_before_id": messages[0].id if has_more and messages else None,
        "unread_counts": await repo.get_unread_counts(current_user.username),
        "chat_partners": await repo.get_chat_partners(current_user.username),
    }


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {
        "status": "success",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "bio": current_user.bio,
            "avatar_url": current_user.avatar_url,
            "is_verified": current_user.is_verified,
            "is_active": current_user.is_active,
        },
    }
