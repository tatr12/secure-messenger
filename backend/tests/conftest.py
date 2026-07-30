import os
import secrets


os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost/voiden_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET_KEY", secrets.token_hex(32))
