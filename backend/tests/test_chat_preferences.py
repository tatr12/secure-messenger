import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.routers import chat_preferences
from app.schemas import UpdateChatPreferenceSchema


def make_preference(**overrides):
    values = {
        "is_pinned": True,
        "is_muted": False,
        "is_archived": False,
        "updated_at": datetime(2026, 7, 31, 12, 0, tzinfo=UTC),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_list_chat_preferences_is_scoped_to_current_user(monkeypatch):
    current_user = SimpleNamespace(id=7, username="alice")
    preference = make_preference()

    class FakePreferenceRepository:
        def __init__(self, _db):
            pass

        async def list_for_user(self, user_id):
            assert user_id == current_user.id
            return [(preference, "bob")]

    monkeypatch.setattr(
        chat_preferences,
        "ChatPreferenceRepository",
        FakePreferenceRepository,
    )

    payload = asyncio.run(
        chat_preferences.list_chat_preferences(
            current_user=current_user,
            db=object(),
        )
    )

    assert payload == [
        {
            "partner": "bob",
            "is_pinned": True,
            "is_muted": False,
            "is_archived": False,
            "updated_at": preference.updated_at,
        }
    ]


def test_update_chat_preference_resolves_partner_and_persists(monkeypatch):
    current_user = SimpleNamespace(id=7, username="alice")
    partner = SimpleNamespace(id=9, username="bob")
    persisted = make_preference(is_muted=True)

    class FakeUserRepository:
        def __init__(self, _db):
            pass

        async def get_by_username(self, username):
            assert username == partner.username
            return partner

    class FakePreferenceRepository:
        def __init__(self, _db):
            pass

        async def upsert(self, *, user_id, partner_id, update_data):
            assert user_id == current_user.id
            assert partner_id == partner.id
            assert update_data.is_muted is True
            return persisted

    monkeypatch.setattr(chat_preferences, "UserRepository", FakeUserRepository)
    monkeypatch.setattr(
        chat_preferences,
        "ChatPreferenceRepository",
        FakePreferenceRepository,
    )

    payload = asyncio.run(
        chat_preferences.update_chat_preference(
            partner.username,
            UpdateChatPreferenceSchema(is_muted=True),
            current_user=current_user,
            db=object(),
        )
    )

    assert payload["partner"] == partner.username
    assert payload["is_muted"] is True


def test_chat_preference_rejects_empty_update():
    with pytest.raises(ValidationError):
        UpdateChatPreferenceSchema()


def test_chat_preference_rejects_current_user_as_partner():
    current_user = SimpleNamespace(id=7, username="alice")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            chat_preferences.update_chat_preference(
                current_user.username,
                UpdateChatPreferenceSchema(is_pinned=True),
                current_user=current_user,
                db=object(),
            )
        )

    assert exc_info.value.status_code == 400
