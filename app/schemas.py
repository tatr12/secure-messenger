from pydantic import BaseModel, Field, EmailStr


class RegisterSchema(BaseModel):
    username: str
    display_name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    bio: str = Field(default="В сети СМЕРТЬ В НИЩЕТЕ", max_length=255)
    public_key: dict
    encrypted_private_key: str
    private_key_iv: str


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


class KeyEnvelopeSchema(BaseModel):
    public_key: dict
    encrypted_private_key: str
    private_key_iv: str
