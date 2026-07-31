from datetime import UTC, datetime

from app.models import MessageTable


def serialize_timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def serialize_message(message: MessageTable) -> dict:
    return {
        "id": message.id,
        "client_id": message.client_message_id,
        "from": message.sender,
        "to": message.receiver,
        "ciphertext": message.ciphertext,
        "iv": message.iv,
        "time": message.time_str,
        "status": message.status,
        "created_at": serialize_timestamp(message.created_at),
        "delivered_at": serialize_timestamp(message.delivered_at),
        "read_at": serialize_timestamp(message.read_at),
    }
