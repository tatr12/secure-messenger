from datetime import UTC, datetime

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.key_envelopes import serialize_key_envelope_v2
from app.models import AuthSessionTable, MessageTable, UserTable
from app.schemas import KeyEnvelopeV2Schema, RegisterSchema
from app.security import hash_password


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

    async def get_by_id(self, user_id: int) -> UserTable:
        stmt = select(UserTable).where(UserTable.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def create_user(self, data: RegisterSchema) -> UserTable:
        user_data = data.model_dump(
            exclude={
                "password",
                "key_envelope",
                "encrypted_private_key",
                "private_key_iv",
            }
        )
        if data.key_envelope:
            encrypted_private_key, private_key_iv = serialize_key_envelope_v2(
                data.key_envelope
            )
        else:
            encrypted_private_key = data.encrypted_private_key
            private_key_iv = data.private_key_iv

        new_user = UserTable(
            **user_data,
            encrypted_private_key=encrypted_private_key,
            private_key_iv=private_key_iv,
            password_hash=hash_password(data.password),
        )
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def verify_user(self, username: str) -> UserTable:
        db_user = await self.get_by_username(username)
        if db_user:
            db_user.is_verified = True
            await self.db.commit()
        return db_user

    async def update_key_envelope(
        self,
        user: UserTable,
        envelope: KeyEnvelopeV2Schema,
    ) -> UserTable:
        encrypted_private_key, private_key_iv = serialize_key_envelope_v2(envelope)
        user.encrypted_private_key = encrypted_private_key
        user.private_key_iv = private_key_iv
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def search_users(self, query: str, exclude: str) -> list[UserTable]:
        q_filter = f"%{query.lower()}%"
        stmt = (
            select(UserTable)
            .where(UserTable.username.ilike(q_filter), UserTable.username != exclude)
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

    async def mark_as_delivered(
        self, message_id: int, receiver: str
    ) -> MessageTable | None:
        message = await self.db.get(MessageTable, message_id)
        if message is None or message.receiver != receiver:
            return None

        if message.status == "sent":
            message.status = "delivered"
            await self.db.commit()

        return message


class SessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(
        self,
        *,
        user_id: int,
        refresh_token_hash: str,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthSessionTable:
        session = AuthSessionTable(
            user_id=user_id,
            refresh_token_hash=refresh_token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def get_active_by_id(
        self,
        session_id: str,
        *,
        user_id: int | None = None,
    ) -> AuthSessionTable | None:
        now = datetime.now(UTC)
        stmt = select(AuthSessionTable).where(
            AuthSessionTable.id == session_id,
            AuthSessionTable.revoked_at.is_(None),
            AuthSessionTable.expires_at > now,
        )
        if user_id is not None:
            stmt = stmt.where(AuthSessionTable.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_refresh_hash_for_update(
        self,
        refresh_token_hash: str,
    ) -> AuthSessionTable | None:
        stmt = (
            select(AuthSessionTable)
            .where(AuthSessionTable.refresh_token_hash == refresh_token_hash)
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def rotate_refresh_token(
        self,
        session: AuthSessionTable,
        refresh_token_hash: str,
    ) -> AuthSessionTable:
        session.refresh_token_hash = refresh_token_hash
        session.last_used_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def revoke_session(self, session: AuthSessionTable) -> str:
        if session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
        await self.db.commit()
        return session.id

    async def revoke_by_refresh_hash(
        self,
        refresh_token_hash: str,
    ) -> str | None:
        session = await self.get_by_refresh_hash_for_update(refresh_token_hash)
        if session is None:
            return None
        return await self.revoke_session(session)

    async def revoke_by_id_for_user(
        self,
        session_id: str,
        user_id: int,
    ) -> str | None:
        stmt = (
            select(AuthSessionTable)
            .where(
                AuthSessionTable.id == session_id,
                AuthSessionTable.user_id == user_id,
            )
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        session = result.scalars().first()
        if session is None:
            return None
        return await self.revoke_session(session)

    async def list_active(self, user_id: int) -> list[AuthSessionTable]:
        now = datetime.now(UTC)
        stmt = (
            select(AuthSessionTable)
            .where(
                AuthSessionTable.user_id == user_id,
                AuthSessionTable.revoked_at.is_(None),
                AuthSessionTable.expires_at > now,
            )
            .order_by(AuthSessionTable.last_used_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
