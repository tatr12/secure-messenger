import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:password@localhost:5432/messenger_db",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "mailpit")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "1025"))
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@messenger.local")


settings = Settings()
