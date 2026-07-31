from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserTable(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    bio: Mapped[str] = mapped_column(String(255), default="В сети СМЕРТЬ В НИЩЕТЕ")
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    public_key: Mapped[dict] = mapped_column(JSON, nullable=False)
    encrypted_private_key: Mapped[str] = mapped_column(Text, nullable=False)
    private_key_iv: Mapped[str] = mapped_column(Text, nullable=False)

    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    password_hash: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
