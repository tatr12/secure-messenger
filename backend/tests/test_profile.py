import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.routers import auth
from app.schemas import UpdateProfileSchema


def test_authenticated_profile_update_returns_persisted_values(monkeypatch):
    user = SimpleNamespace(username="alice")
    persisted = SimpleNamespace(display_name="Alice V", bio="Secure by default")

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def update_user_profile(self, username, display_name, bio):
            assert username == user.username
            assert display_name == persisted.display_name
            assert bio == persisted.bio
            return persisted

    monkeypatch.setattr(auth, "UserRepository", FakeUserRepository)

    payload = asyncio.run(
        auth.update_profile(
            UpdateProfileSchema(
                display_name=persisted.display_name,
                bio=persisted.bio,
            ),
            current_user=user,
            db=object(),
        )
    )

    assert payload == {
        "status": "success",
        "display_name": persisted.display_name,
        "bio": persisted.bio,
    }


def test_profile_update_rejects_a_blank_display_name():
    with pytest.raises(ValidationError):
        UpdateProfileSchema(display_name="   ", bio="Secure by default")
