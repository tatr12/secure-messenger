from pydantic import BaseModel, Field, EmailStr

class RegisterSchema(BaseModel):
    username: str
    display_name: str
    email: EmailStr
    bio: str = Field(default="В сети СМЕРТЬ В НИЩЕТЕ", max_length=32)
    public_key: dict
    encrypted_private_key: str
    private_key_iv: str

class UpdateProfileSchema(BaseModel):
    display_name: str
    bio: str = Field(..., max_length=32)