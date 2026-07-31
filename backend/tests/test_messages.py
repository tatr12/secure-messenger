import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.models import MessageTable
from app.message_protocol import serialize_message
from app.repositories import MessageRepository
from app.routers import auth


def test_delivery_receipt_advances_the_matching_message():
    database = SimpleNamespace(get=AsyncMock(), commit=AsyncMock())
    message = SimpleNamespace(receiver="bob", status="sent")
    database.get.return_value = message

    result = asyncio.run(
        MessageRepository(database).mark_as_delivered(
            message_id=42,
            receiver="bob",
        )
    )

    database.get.assert_awaited_once_with(MessageTable, 42)
    database.commit.assert_awaited_once()
    assert result is message
    assert message.status == "delivered"
    assert message.delivered_at is not None


def test_delivery_receipt_cannot_update_another_receiver_message():
    database = SimpleNamespace(get=AsyncMock(), commit=AsyncMock())
    message = SimpleNamespace(receiver="charlie", status="sent")
    database.get.return_value = message

    result = asyncio.run(
        MessageRepository(database).mark_as_delivered(
            message_id=42,
            receiver="bob",
        )
    )

    database.commit.assert_not_awaited()
    assert result is None
    assert message.status == "sent"


def test_idempotent_save_returns_an_existing_client_message():
    database = SimpleNamespace()
    repository = MessageRepository(database)
    existing = SimpleNamespace(id=7)
    repository.get_by_client_message_id = AsyncMock(return_value=existing)
    candidate = MessageTable(
        sender="alice",
        receiver="bob",
        client_message_id="client-7",
        ciphertext="ciphertext",
        iv="iv",
        time_str="12:00",
    )

    message, created = asyncio.run(repository.save_message_idempotent(candidate))

    assert message is existing
    assert created is False


def test_idempotent_save_persists_a_new_client_message():
    database = SimpleNamespace(
        add=Mock(),
        commit=AsyncMock(),
        refresh=AsyncMock(),
    )
    repository = MessageRepository(database)
    repository.get_by_client_message_id = AsyncMock(return_value=None)
    candidate = MessageTable(
        sender="alice",
        receiver="bob",
        client_message_id="client-8",
        ciphertext="ciphertext",
        iv="iv",
        time_str="12:00",
    )

    message, created = asyncio.run(repository.save_message_idempotent(candidate))

    database.add.assert_called_once_with(candidate)
    database.commit.assert_awaited_once()
    database.refresh.assert_awaited_once_with(candidate)
    assert message is candidate
    assert created is True


def make_message(message_id: int):
    created_at = datetime(2026, 7, 31, 12, message_id, tzinfo=UTC)
    return SimpleNamespace(
        id=message_id,
        client_message_id=f"client-{message_id}",
        sender="alice",
        receiver="bob",
        ciphertext="ciphertext",
        iv="iv",
        time_str="12:00",
        status="sent",
        created_at=created_at,
        delivered_at=None,
        read_at=None,
    )


def test_message_serialization_exposes_server_timestamps():
    payload = serialize_message(make_message(3))

    assert payload["id"] == 3
    assert payload["client_id"] == "client-3"
    assert payload["created_at"] == "2026-07-31T12:03:00+00:00"


def test_paginated_history_returns_cursor_and_chat_metadata(monkeypatch):
    class FakeMessageRepository:
        def __init__(self, _database):
            pass

        async def get_history_page(self, username, *, before_id, limit):
            assert username == "alice"
            assert before_id is None
            assert limit == 3
            return [make_message(1), make_message(2), make_message(3)]

        async def get_unread_counts(self, username):
            assert username == "alice"
            return {"bob": 4}

        async def get_chat_partners(self, username):
            assert username == "alice"
            return ["bob"]

    monkeypatch.setattr(auth, "MessageRepository", FakeMessageRepository)

    payload = asyncio.run(
        auth.get_history_page(
            before_id=None,
            limit=2,
            current_user=SimpleNamespace(username="alice"),
            db=object(),
        )
    )

    assert [message["id"] for message in payload["messages"]] == [2, 3]
    assert payload["next_before_id"] == 2
    assert payload["unread_counts"] == {"bob": 4}
    assert payload["chat_partners"] == ["bob"]
