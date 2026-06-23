import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import engine, Base, redis_mgr
from app.services import socket_manager
from app.routers import auth, websocket


# Фоновый слушатель Pub/Sub Redis (перенесен в глобальный цикл)
async def redis_pubsub_listener():
    pubsub = redis_mgr.client.pubsub()
    await pubsub.subscribe("messenger_routing")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                packet = json.loads(message["data"])
                target_user = packet.get("to")
                # Отправляем сообщение юзеру, если он подключен к ЭТОМУ серверу
                await socket_manager.send_personal_message(packet, target_user)
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ожидание Postgres и накат таблиц
    retries = 5
    while retries > 0:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            print("🤖 [SYSTEM] Успешное подключение к PostgreSQL!")
            break
        except Exception:
            retries -= 1
            print(f"⏳ [SYSTEM] База данных еще не готова... Попыток: {retries}")
            await asyncio.sleep(2)

    # Запуск Redis
    redis_mgr.connect()
    pubsub_task = asyncio.create_task(redis_mgr.subscribe_and_route())

    print("🤖 [SYSTEM] Архитектура бэкенда успешно развернута.")
    yield
    pubsub_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем наши чистые роутеры
app.include_router(auth.router)
app.include_router(websocket.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
