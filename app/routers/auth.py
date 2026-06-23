from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, redis_mgr
from app.schemas import RegisterSchema, UpdateProfileSchema
from app.repositories import UserRepository, MessageRepository
from app.services import (
    generate_verification_token,
    send_verification_email,
    store_verification_token,
    verify_token,
)

router = APIRouter(tags=["Auth & Profile"])


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
async def login(data: dict, db: AsyncSession = Depends(get_db)):
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

    # TODO: Add password verification logic here
    # For now, we'll just check if user exists and is verified

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "session_token": str(user.id),
        "is_verified": user.is_verified,
    }


@router.get("/user/{username}")
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
        "encrypted_private_key": db_user.encrypted_private_key,
        "private_key_iv": db_user.private_key_iv,
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
@router.post("/user/{username}/update")
async def update_profile(
    username: str, data: UpdateProfileSchema, db: AsyncSession = Depends(get_db)
):
    repo = UserRepository(db)
    updated_user = await repo.update_user_profile(username, data.display_name, data.bio)
    if not updated_user:
        return JSONResponse(status_code=404, content={"error": "User not found"})

    return {
        "status": "success",
        "display_name": updated_user.display_name,
        "bio": updated_user.bio,
    }


# --- ВОСКРЕШАЕМ ЭНДПОИНТ ИСТОРИИ СООБЩЕНИЙ ---
@router.get("/history/{username}")
async def get_history(username: str, db: AsyncSession = Depends(get_db)):
    repo = MessageRepository(db)
    messages = await repo.get_history(username)

    return [
        {
            "id": m.id,
            "from": m.sender,
            "to": m.receiver,
            "ciphertext": m.ciphertext,
            "iv": m.iv,
            "time": m.time_str,
            "status": m.status,
        }
        for m in messages
    ]
