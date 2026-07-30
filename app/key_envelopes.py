import json

from app.schemas import (
    KeyEnvelopePayloadSchema,
    KeyEnvelopeV2Schema,
    LegacyKeyEnvelopeSchema,
)

KEY_ENVELOPE_V2_PREFIX = "voiden:key-envelope:v2:"
KEY_ENVELOPE_V2_IV_SENTINEL = "v2"


def serialize_key_envelope_v2(envelope: KeyEnvelopeV2Schema) -> tuple[str, str]:
    payload = json.dumps(
        envelope.model_dump(mode="json"),
        separators=(",", ":"),
        sort_keys=True,
    )
    return f"{KEY_ENVELOPE_V2_PREFIX}{payload}", KEY_ENVELOPE_V2_IV_SENTINEL


def deserialize_key_envelope(
    encrypted_private_key: str,
    private_key_iv: str,
) -> KeyEnvelopePayloadSchema:
    if encrypted_private_key.startswith(KEY_ENVELOPE_V2_PREFIX):
        payload = encrypted_private_key.removeprefix(KEY_ENVELOPE_V2_PREFIX)
        return KeyEnvelopeV2Schema.model_validate_json(payload)

    return LegacyKeyEnvelopeSchema(
        ciphertext=encrypted_private_key,
        iv=private_key_iv,
    )


def is_key_envelope_v2(encrypted_private_key: str) -> bool:
    return encrypted_private_key.startswith(KEY_ENVELOPE_V2_PREFIX)
