import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from fastapi import Response
from jose import jwt
from starlette.requests import Request

from app.config import settings
from app.dependencies import authenticate_access_token
from app.jwt import create_access_token, decode_access_token
from app.routers import auth
from app.services import ConnectionManager
from app.session_tokens import (
    generate_refresh_token,
    hash_refresh_token,
    set_refresh_cookie,
)


def make_request(cookie: str | None = None) -> Request:
    headers = []
    if cookie:
        headers.append((b"cookie", cookie.encode("ascii")))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/session/refresh",
            "headers": headers,
            "client": ("127.0.0.1", 5000),
        }
    )


def make_user():
    return SimpleNamespace(
        id=7,
        username="alice",
        display_name="Alice",
        email="alice@example.com",
        is_verified=True,
        is_active=True,
        password_hash="password-hash",
    )


def test_access_token_is_bound_to_a_server_session():
    token = create_access_token({"sub": "alice", "user_id": 7, "sid": "session-1"})
    payload = decode_access_token(token)

    assert payload["type"] == "access"
    assert payload["sid"] == "session-1"
    assert payload["jti"]
    assert payload["exp"] > payload["iat"]


def test_refresh_tokens_are_random_and_only_hashed_for_storage():
    first = generate_refresh_token()
    second = generate_refresh_token()

    assert first != second
    assert hash_refresh_token(first) != first
    assert len(hash_refresh_token(first)) == 64
    assert hash_refresh_token(first) == hash_refresh_token(first)


def test_refresh_cookie_is_http_only_strict_and_secure_in_production(monkeypatch):
    monkeypatch.setattr(auth.settings, "PUBLIC_BASE_URL", "https://voiden.example")
    response = Response()

    set_refresh_cookie(
        response,
        "refresh-token",
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )

    cookie = response.headers["set-cookie"]
    assert "voiden_refresh=refresh-token" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Secure" in cookie
    assert "Path=/" in cookie


def test_revoked_session_rejects_an_otherwise_valid_access_token(monkeypatch):
    user = make_user()

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_username(self, _username):
            return user

    class FakeSessionRepository:
        def __init__(self, _db):
            pass

        async def get_active_by_id(self, _session_id, *, user_id):
            assert user_id == user.id
            return None

    monkeypatch.setattr("app.dependencies.UserRepository", FakeUserRepository)
    monkeypatch.setattr("app.dependencies.SessionRepository", FakeSessionRepository)
    token = create_access_token(
        {"sub": user.username, "user_id": user.id, "sid": "revoked-session"}
    )

    context = asyncio.run(authenticate_access_token(token, db=object()))

    assert context is None


def test_unexpired_legacy_access_token_remains_temporarily_compatible(monkeypatch):
    user = make_user()

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_username(self, _username):
            return user

    monkeypatch.setattr("app.dependencies.UserRepository", FakeUserRepository)
    token = jwt.encode(
        {
            "sub": user.username,
            "user_id": user.id,
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    context = asyncio.run(authenticate_access_token(token, db=object()))

    assert context.user is user
    assert context.session is None


def test_refresh_rotates_the_cookie_and_keeps_the_session_id(monkeypatch):
    user = make_user()
    session = SimpleNamespace(
        id="session-1",
        user_id=user.id,
        revoked_at=None,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    rotated = {}

    class FakeSessionRepository:
        def __init__(self, _db):
            pass

        async def get_by_refresh_hash_for_update(self, token_hash):
            assert token_hash == hash_refresh_token("initial-refresh")
            return session

        async def rotate_refresh_token(self, current_session, token_hash):
            rotated["session"] = current_session
            rotated["hash"] = token_hash

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_id(self, user_id):
            assert user_id == user.id
            return user

    monkeypatch.setattr(auth, "SessionRepository", FakeSessionRepository)
    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)
    monkeypatch.setattr(auth, "generate_refresh_token", lambda: "rotated-refresh")
    request = make_request("voiden_refresh=initial-refresh")
    response = Response()

    payload = asyncio.run(auth.refresh_session(request, response, db=object()))

    assert decode_access_token(payload["access_token"])["sid"] == session.id
    assert rotated["session"] is session
    assert rotated["hash"] == hash_refresh_token("rotated-refresh")
    assert "voiden_refresh=rotated-refresh" in response.headers["set-cookie"]
    assert "initial-refresh" not in response.headers["set-cookie"]
    assert response.headers["Cache-Control"] == "no-store"


def test_login_replaces_the_browser_cookie_session(monkeypatch):
    user = make_user()
    changes = {}

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_username(self, username):
            assert username == user.username
            return user

    class FakeSessionRepository:
        def __init__(self, _db):
            pass

        async def revoke_by_refresh_hash(self, token_hash):
            changes["revoked_hash"] = token_hash
            return "old-session"

        async def create_session(self, **values):
            changes["created"] = values
            return SimpleNamespace(id="new-session")

    async def publish(session_id):
        changes["published"] = session_id

    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)
    monkeypatch.setattr(auth, "SessionRepository", FakeSessionRepository)
    monkeypatch.setattr(auth, "verify_password", lambda *_args: True)
    monkeypatch.setattr(auth, "generate_refresh_token", lambda: "new-refresh")
    monkeypatch.setattr(auth, "_publish_session_revocation", publish)
    response = Response()

    payload = asyncio.run(
        auth.login(
            {"username": user.username, "password": "valid-password"},
            make_request("voiden_refresh=old-refresh"),
            response,
            db=object(),
        )
    )

    assert changes["revoked_hash"] == hash_refresh_token("old-refresh")
    assert changes["published"] == "old-session"
    assert changes["created"]["user_id"] == user.id
    assert changes["created"]["refresh_token_hash"] == hash_refresh_token(
        "new-refresh"
    )
    assert decode_access_token(payload["access_token"])["sid"] == "new-session"
    assert payload["expires_in"] > 0
    assert "refresh_token" not in payload
    assert "voiden_refresh=new-refresh" in response.headers["set-cookie"]


def test_logout_revokes_cookie_and_access_session(monkeypatch):
    access_token = create_access_token(
        {"sub": "alice", "user_id": 7, "sid": "current-session"}
    )
    revoked = []
    published = []

    class FakeSessionRepository:
        def __init__(self, _db):
            pass

        async def revoke_by_refresh_hash(self, token_hash):
            assert token_hash == hash_refresh_token("current-refresh")
            revoked.append("cookie-session")
            return "cookie-session"

        async def revoke_by_id_for_user(self, session_id, user_id):
            assert session_id == "current-session"
            assert user_id == 7
            revoked.append(session_id)
            return session_id

    async def publish(session_id):
        published.append(session_id)

    monkeypatch.setattr(auth, "SessionRepository", FakeSessionRepository)
    monkeypatch.setattr(auth, "_publish_session_revocation", publish)
    response = Response()

    asyncio.run(
        auth.logout_session(
            make_request("voiden_refresh=current-refresh"),
            response,
            credentials=SimpleNamespace(credentials=access_token),
            db=object(),
        )
    )

    assert set(revoked) == {"cookie-session", "current-session"}
    assert set(published) == {"cookie-session", "current-session"}
    assert response.status_code == 204
    assert "voiden_refresh=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_missing_refresh_cookie_is_rejected_and_cleared():
    response = asyncio.run(
        auth.refresh_session(make_request(), Response(), db=object())
    )

    assert response.status_code == 401
    assert "voiden_refresh=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


class FakeWebSocket:
    def __init__(self):
        self.accepted_subprotocol = None
        self.messages = []
        self.closed = []

    async def accept(self, subprotocol=None):
        self.accepted_subprotocol = subprotocol

    async def send_json(self, message):
        self.messages.append(message)

    async def close(self, code=1000, reason=None):
        self.closed.append((code, reason))


def test_connection_manager_delivers_to_each_device_and_revokes_one_session():
    async def scenario():
        manager = ConnectionManager()
        first = FakeWebSocket()
        second = FakeWebSocket()
        await manager.connect("alice", "session-1", first, subprotocol="voiden")
        await manager.connect("alice", "session-2", second, subprotocol="voiden")

        packet = {"type": "message", "id": 1}
        await manager.send_personal_message(packet, "alice")
        disconnected = await manager.close_session("session-1")

        assert first.messages == [packet]
        assert second.messages == [packet]
        assert first.closed == [(1008, "Session revoked")]
        assert second.closed == []
        assert disconnected == ["alice"]
        assert manager.has_connections("alice") is True

    asyncio.run(scenario())


def test_reconnecting_the_same_session_does_not_remove_the_new_socket():
    async def scenario():
        manager = ConnectionManager()
        previous = FakeWebSocket()
        current = FakeWebSocket()
        await manager.connect("alice", "session-1", previous)
        await manager.connect("alice", "session-1", current)

        manager.disconnect("alice", "session-1", previous)
        await manager.send_personal_message({"id": 2}, "alice")

        assert previous.closed == [(1000, "Connection replaced")]
        assert current.messages == [{"id": 2}]
        assert manager.has_connections("alice") is True

    asyncio.run(scenario())
