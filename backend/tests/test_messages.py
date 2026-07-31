import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.models import MessageTable
from app.repositories import MessageRepository


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
