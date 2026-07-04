from app.models import UserTable
from app.repositories import UserRepository
from app.schemas import RegisterRequest
from app.services.security import hash_password


class AuthService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    async def register(self, data: RegisterRequest) -> UserTable:
        if await self.repository.get_by_email(data.email):
            raise ValueError("Email is already registered")

        if await self.repository.get_by_username(data.username):
            raise ValueError("Username is already taken")

        user = UserTable(
            username=data.username,
            email=data.email,
            display_name=data.display_name,
            password_hash=hash_password(data.password),
            # Временно. Позже здесь будет генерация настоящих E2EE-ключей.
            public_key={},
            encrypted_private_key="",
            private_key_iv="",
        )

        return await self.repository.create(user)
