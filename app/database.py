import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class RedisManager:
    """Класс-синглтон для управления быстрым кэшем Redis"""

    def __init__(self):
        self.client: aioredis.Redis = None

    def connect(self):
        self.client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    async def set_online(self, username: str):
        await self.client.set(f"status:{username}", "online")

    async def set_offline(self, username: str):
        await self.client.delete(f"status:{username}")

    async def check_online(self, username: str) -> bool:
        return bool(await self.client.exists(f"status:{username}"))

    async def publish_message(self, channel: str, data: dict):
        import json

        await self.client.publish(channel, json.dumps(data))

    async def subscribe_and_route(self):
        import json

        from app.services import socket_manager  # здесь чтобы избежать circular import

        pubsub = self.client.pubsub()
        await pubsub.subscribe("messenger_routing")

        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                packet = json.loads(raw["data"])
                if packet.get("type") == "session_revoked":
                    disconnected_users = await socket_manager.close_session(
                        packet.get("session_id", "")
                    )
                    for disconnected_user in disconnected_users:
                        if not socket_manager.has_connections(disconnected_user):
                            await self.set_offline(disconnected_user)
                    continue

                recipient = packet.get("to")

                print(
                    f"[REDIS ROUTER] packet={packet} recipient={recipient} active={list(socket_manager.active_connections.keys())}",
                    flush=True,
                )

                if recipient:
                    await socket_manager.send_personal_message(packet, recipient)
            except Exception as e:
                print(f"[Redis listener] ошибка: {e}")


redis_mgr = RedisManager()


async def get_db():
    """Генератор сессий для Postgres (Dependency Injection)"""
    async with AsyncSessionLocal() as session:
        yield session
