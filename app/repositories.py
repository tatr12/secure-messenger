from sqlalchemy import select, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import UserTable, MessageTable
from app.schemas import RegisterSchema


class UserRepository:
    """Класс для изоляции SQL-запросов к таблице Пользователей"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_username(self, username: str) -> UserTable:
        stmt = select(UserTable).where(UserTable.username == username)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_email(self, email: str) -> UserTable:
        stmt = select(UserTable).where(UserTable.email == email)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_user(self, data: RegisterSchema) -> UserTable:
        new_user = UserTable(**data.model_dump())
        self.db.add(new_user)
        await self.db.commit()
        return new_user

    async def verify_user(self, username: str) -> UserTable:
        db_user = await self.get_by_username(username)
        if db_user:
            db_user.is_verified = True
            await self.db.commit()
        return db_user

    async def search_users(self, query: str, exclude: str) -> list[UserTable]:
        q_filter = f"%{query.lower()}%"
        stmt = (
            select(UserTable)
            .where(UserTable.username.like(q_filter), UserTable.username != exclude)
            .limit(5)
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def update_user_profile(
        self, username: str, display_name: str, bio: str
    ) -> UserTable:
        db_user = await self.get_by_username(username)
        if db_user:
            db_user.display_name = display_name
            db_user.bio = bio
            await self.db.commit()
        return db_user


class MessageRepository:
    """Класс для работы с сообщениями в Postgres"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_message(self, data: MessageTable) -> MessageTable:
        self.db.add(data)
        await self.db.commit()
        await self.db.refresh(data)
        return data

    async def get_history(self, username: str) -> list[MessageTable]:
        stmt = (
            select(MessageTable)
            .where(
                or_(MessageTable.sender == username, MessageTable.receiver == username)
            )
            .order_by(MessageTable.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def mark_as_read(self, sender: str, receiver: str):
        stmt = (
            update(MessageTable)
            .where(MessageTable.sender == sender, MessageTable.receiver == receiver)
            .values(status="read")
        )
        await self.db.execute(stmt)
        await self.db.commit()
