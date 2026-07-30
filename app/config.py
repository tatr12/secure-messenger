from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    DATABASE_URL: str
    REDIS_URL: str

    SMTP_HOST: str = "mailpit"
    SMTP_PORT: int = 1025
    SMTP_FROM: str = "noreply@messenger.local"
    PUBLIC_BASE_URL: str = "http://127.0.0.1:5173"

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SESSION_COOKIE_NAME: str = "voiden_refresh"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins(self) -> list[str]:
        origins = (origin.strip() for origin in self.CORS_ORIGINS.split(","))
        return [origin for origin in origins if origin]

    @property
    def refresh_cookie_secure(self) -> bool:
        return urlparse(self.PUBLIC_BASE_URL).scheme == "https"


settings = Settings()
