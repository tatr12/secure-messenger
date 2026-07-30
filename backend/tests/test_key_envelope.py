import asyncio
import base64
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from pydantic import ValidationError

from app.dependencies import get_current_auth, get_current_user
from app.key_envelopes import (
    KEY_ENVELOPE_V2_IV_SENTINEL,
    KEY_ENVELOPE_V2_PREFIX,
    deserialize_key_envelope,
    serialize_key_envelope_v2,
)
from app.repositories import UserRepository
from app.routers import auth
from app.schemas import KeyEnvelopeV2Schema, RegisterSchema, UpdateKeyEnvelopeSchema


def encoded(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def make_v2_envelope() -> KeyEnvelopeV2Schema:
    return KeyEnvelopeV2Schema(
        version=2,
        kdf={
            "name": "PBKDF2",
            "hash": "SHA-256",
            "iterations": 600_000,
            "salt": encoded(b"s" * 16),
        },
        cipher={
            "name": "AES-GCM",
            "iv": encoded(b"i" * 12),
            "ciphertext": encoded(b"c" * 64),
        },
    )


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

    assert alice_payload["key_envelope"].version == 1
    assert alice_payload["key_envelope"].ciphertext == "alice-ciphertext"
    assert bob_payload["key_envelope"].ciphertext == "bob-ciphertext"
    assert alice_payload["encrypted_private_key"] == "alice-ciphertext"
    assert alice_payload["private_key_iv"] == "alice-iv"
    assert "username" not in inspect.signature(auth.get_key_envelope).parameters
    assert alice_response.headers["Cache-Control"] == "no-store"

    route = next(
        route for route in auth.router.routes if route.path == "/me/key-envelope"
    )
    dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
    assert get_current_user in dependency_calls


def test_v2_envelope_round_trips_through_existing_database_fields():
    envelope = make_v2_envelope()

    encrypted_private_key, private_key_iv = serialize_key_envelope_v2(envelope)
    restored = deserialize_key_envelope(encrypted_private_key, private_key_iv)

    assert encrypted_private_key.startswith(KEY_ENVELOPE_V2_PREFIX)
    assert private_key_iv == KEY_ENVELOPE_V2_IV_SENTINEL
    assert restored == envelope

    user = SimpleNamespace(
        public_key={"kid": "alice"},
        encrypted_private_key=encrypted_private_key,
        private_key_iv=private_key_iv,
    )
    payload = asyncio.run(auth.get_key_envelope(response=Response(), current_user=user))
    assert payload["key_envelope"] == envelope
    assert "encrypted_private_key" not in payload
    assert "private_key_iv" not in payload


def test_registration_accepts_v2_or_complete_legacy_envelope():
    common = {
        "username": "alice",
        "display_name": "Alice",
        "email": "alice@example.com",
        "password": "valid-password",
        "public_key": {"kty": "EC"},
    }

    v2_registration = RegisterSchema(**common, key_envelope=make_v2_envelope())
    legacy_registration = RegisterSchema(
        **common,
        encrypted_private_key="legacy-ciphertext",
        private_key_iv="legacy-iv",
    )

    assert v2_registration.key_envelope.version == 2
    assert legacy_registration.encrypted_private_key == "legacy-ciphertext"

    with pytest.raises(ValidationError):
        RegisterSchema(**common, encrypted_private_key="incomplete")

    weak_envelope = make_v2_envelope().model_dump()
    weak_envelope["kdf"]["iterations"] = 10_000
    with pytest.raises(ValidationError):
        RegisterSchema(**common, key_envelope=weak_envelope)


def test_repository_stores_v2_without_a_database_migration(monkeypatch):
    registration = RegisterSchema(
        username="alice",
        display_name="Alice",
        email="alice@example.com",
        password="valid-password",
        public_key={"kty": "EC"},
        key_envelope=make_v2_envelope(),
    )

    class FakeDatabase:
        def add(self, user):
            self.user = user

        async def commit(self):
            pass

        async def refresh(self, _user):
            pass

    database = FakeDatabase()
    monkeypatch.setattr("app.repositories.hash_password", lambda _password: "hash")

    user = asyncio.run(UserRepository(database).create_user(registration))

    assert user.encrypted_private_key.startswith(KEY_ENVELOPE_V2_PREFIX)
    assert user.private_key_iv == KEY_ENVELOPE_V2_IV_SENTINEL
    assert database.user is user


def test_migration_requires_password_and_updates_only_current_user(monkeypatch):
    current_user = SimpleNamespace(
        username="alice",
        password_hash="password-hash",
        encrypted_private_key="legacy-ciphertext",
        private_key_iv="legacy-iv",
    )
    data = UpdateKeyEnvelopeSchema(
        password="valid-password",
        key_envelope=make_v2_envelope(),
    )

    monkeypatch.setattr(auth, "verify_password", lambda *_args: False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            auth.update_key_envelope(
                data=data,
                response=Response(),
                current_user=current_user,
                db=object(),
            )
        )
    assert error.value.status_code == 403

    updated = {}

    class FakeUserRepository:
        def __init__(self, db):
            updated["db"] = db

        async def update_key_envelope(self, user, envelope):
            updated["user"] = user
            updated["envelope"] = envelope

    monkeypatch.setattr(auth, "verify_password", lambda *_args: True)
    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)
    response = Response()
    payload = asyncio.run(
        auth.update_key_envelope(
            data=data,
            response=response,
            current_user=current_user,
            db=object(),
        )
    )

    assert payload == {"status": "migrated", "version": 2}
    assert updated["user"] is current_user
    assert updated["envelope"] == data.key_envelope
    assert response.headers["Cache-Control"] == "no-store"

    route = next(
        route
        for route in auth.router.routes
        if route.path == "/me/key-envelope" and "PUT" in route.methods
    )
    dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
    assert get_current_user in dependency_calls
    assert "username" not in inspect.signature(auth.update_key_envelope).parameters


def test_v2_envelope_cannot_be_overwritten(monkeypatch):
    current_user = SimpleNamespace(
        encrypted_private_key=f"{KEY_ENVELOPE_V2_PREFIX}stored",
    )
    data = UpdateKeyEnvelopeSchema(
        password="valid-password",
        key_envelope=make_v2_envelope(),
    )

    monkeypatch.setattr(
        auth,
        "verify_password",
        lambda *_args: pytest.fail("password must not be checked without a write"),
    )
    payload = asyncio.run(
        auth.update_key_envelope(
            data=data,
            response=Response(),
            current_user=current_user,
            db=object(),
        )
    )

    assert payload == {"status": "already_current", "version": 2}


def test_missing_bearer_token_returns_unauthorized():
    with pytest.raises(HTTPException) as error:
        asyncio.run(get_current_auth(credentials=None, db=None))

    assert error.value.status_code == 401
    assert error.value.headers == {"WWW-Authenticate": "Bearer"}
