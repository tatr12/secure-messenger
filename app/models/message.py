from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


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
