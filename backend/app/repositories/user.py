from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserTable


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> UserTable | None:
        stmt = select(UserTable).where(UserTable.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_email(self, email: str) -> UserTable | None:
        stmt = select(UserTable).where(UserTable.email == email)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_username(self, username: str) -> UserTable | None:
        stmt = select(UserTable).where(UserTable.username == username)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create(self, user: UserTable) -> UserTable:
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user
