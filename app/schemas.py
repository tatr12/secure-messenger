import base64
import binascii
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class KeyEnvelopeKdfV2Schema(BaseModel):
    name: Literal["PBKDF2"]
    hash: Literal["SHA-256"]
    iterations: int = Field(ge=600_000, le=2_000_000)
    salt: str

    @field_validator("salt")
    @classmethod
    def validate_salt(cls, value: str) -> str:
        decoded = _decode_base64(value, "salt")
        if not 16 <= len(decoded) <= 64:
            raise ValueError("salt must contain between 16 and 64 bytes")
        return value


class KeyEnvelopeCipherV2Schema(BaseModel):
    name: Literal["AES-GCM"]
    iv: str
    ciphertext: str

    @field_validator("iv")
    @classmethod
    def validate_iv(cls, value: str) -> str:
        if len(_decode_base64(value, "iv")) != 12:
            raise ValueError("AES-GCM IV must contain 12 bytes")
        return value

    @field_validator("ciphertext")
    @classmethod
    def validate_ciphertext(cls, value: str) -> str:
        if len(_decode_base64(value, "ciphertext")) < 32:
            raise ValueError("ciphertext is too short")
        return value


class LegacyKeyEnvelopeSchema(BaseModel):
    version: Literal[1] = 1
    ciphertext: str
    iv: str


class KeyEnvelopeV2Schema(BaseModel):
    version: Literal[2]
    kdf: KeyEnvelopeKdfV2Schema
    cipher: KeyEnvelopeCipherV2Schema


KeyEnvelopePayloadSchema = Annotated[
    LegacyKeyEnvelopeSchema | KeyEnvelopeV2Schema,
    Field(discriminator="version"),
]


def _decode_base64(value: str, field_name: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError(f"{field_name} must be valid Base64") from error


class RegisterSchema(BaseModel):
    username: str
    display_name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    bio: str = Field(default="В сети СМЕРТЬ В НИЩЕТЕ", max_length=255)
    public_key: dict
    key_envelope: KeyEnvelopeV2Schema | None = None
    encrypted_private_key: str | None = None
    private_key_iv: str | None = None

    @model_validator(mode="after")
    def validate_key_envelope(self):
        has_legacy_envelope = bool(self.encrypted_private_key and self.private_key_iv)
        has_partial_legacy_envelope = bool(
            self.encrypted_private_key or self.private_key_iv
        )

        if self.key_envelope and has_partial_legacy_envelope:
            raise ValueError("provide either key_envelope or legacy key fields")
        if not self.key_envelope and not has_legacy_envelope:
            raise ValueError("a complete key envelope is required")
        return self


class UpdateProfileSchema(BaseModel):
    display_name: str
    bio: str = Field(..., max_length=255)


class PublicUserSchema(BaseModel):
    id: int
    username: str
    display_name: str
    bio: str
    avatar_url: str | None
    public_key: dict
    is_online: bool


class KeyEnvelopeResponseSchema(BaseModel):
    public_key: dict
    key_envelope: KeyEnvelopePayloadSchema
    encrypted_private_key: str | None = None
    private_key_iv: str | None = None


class UpdateKeyEnvelopeSchema(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    key_envelope: KeyEnvelopeV2Schema


class SessionResponseSchema(BaseModel):
    id: str
    current: bool
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
