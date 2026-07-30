import asyncio
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response

from app.dependencies import get_current_user
from app.routers import auth


def test_public_profile_does_not_return_private_key_material(monkeypatch):
    user = SimpleNamespace(
        id=1,
        username="alice",
        display_name="Alice",
        bio="Available",
        avatar_url=None,
        public_key={"kty": "EC"},
        encrypted_private_key="must-not-leak",
        private_key_iv="must-not-leak",
    )

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_username(self, _username):
            return user

    async def check_online(_username):
        return True

    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)
    monkeypatch.setattr(auth.redis_mgr, "check_online", check_online)

    payload = asyncio.run(auth.get_user("alice", db=object()))

    assert payload["public_key"] == user.public_key
    assert "encrypted_private_key" not in payload
    assert "private_key_iv" not in payload


def test_key_envelope_is_bound_to_authenticated_user():
    alice = SimpleNamespace(
        public_key={"kid": "alice"},
        encrypted_private_key="alice-ciphertext",
        private_key_iv="alice-iv",
    )
    bob = SimpleNamespace(
        public_key={"kid": "bob"},
        encrypted_private_key="bob-ciphertext",
        private_key_iv="bob-iv",
    )

    alice_response = Response()
    bob_response = Response()
    alice_payload = asyncio.run(
        auth.get_key_envelope(response=alice_response, current_user=alice)
    )
    bob_payload = asyncio.run(
        auth.get_key_envelope(response=bob_response, current_user=bob)
    )

    assert alice_payload["encrypted_private_key"] == "alice-ciphertext"
    assert bob_payload["encrypted_private_key"] == "bob-ciphertext"
    assert "username" not in inspect.signature(auth.get_key_envelope).parameters
    assert alice_response.headers["Cache-Control"] == "no-store"

    route = next(route for route in auth.router.routes if route.path == "/me/key-envelope")
    dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
    assert get_current_user in dependency_calls


def test_missing_bearer_token_returns_unauthorized():
    with pytest.raises(HTTPException) as error:
        asyncio.run(get_current_user(credentials=None, db=None))

    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}
