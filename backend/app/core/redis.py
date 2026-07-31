import redis.asyncio as aioredis

from backend.app.core.config import settings


class RedisManager:
    """
    Central Redis manager.

    Responsible for:
    - online status
    - pub/sub
    - verification tokens
    - sessions
    """

    def __init__(self):
        self.client: aioredis.Redis | None = None

    async def connect(self) -> None:
        self.client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )

    async def close(self) -> None:
        if self.client:
            await self.client.close()


redis_manager = RedisManager()
