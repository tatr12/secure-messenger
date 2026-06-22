import uuid

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
class UserTable(Base):
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    bio: Mapped[str] = mapped_column(String(32), default="В сети СМЕРТЬ В НИЩЕТЕ")
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True) 
    public_key: Mapped[dict] = mapped_column(JSON, nullable=False)
    encrypted_private_key: Mapped[str] = mapped_column(Text, nullable=False)
    private_key_iv: Mapped[str] = mapped_column(Text, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

class MessageTable(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sender: Mapped[str] = mapped_column(String, index=True, nullable=False)
    receiver: Mapped[str] = mapped_column(String, index=True, nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    iv: Mapped[str] = mapped_column(Text, nullable=False)
    time_str: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="sent") 
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)