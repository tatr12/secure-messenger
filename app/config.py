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


settings = Settings()
