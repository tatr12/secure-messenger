import json
import logging
import secrets
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.parse import urlencode

import aiosmtplib
import redis.asyncio as aioredis  # Подключаем асинхронный Redis напрямую 🚀
from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)

# Инициализируем прямой клиент докера Redis.
# Хост 'redis' берется из настроек или напрямую, если в settings нет REDIS_URL
redis_url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
redis_client = aioredis.from_url(redis_url, decode_responses=True)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(
        self,
        username: str,
        connection_id: str,
        websocket: WebSocket,
        subprotocol: str | None = None,
    ):
        await websocket.accept(subprotocol=subprotocol)
        user_connections = self.active_connections.setdefault(username, {})
        previous_websocket = user_connections.get(connection_id)
        user_connections[connection_id] = websocket

        if previous_websocket is not None and previous_websocket is not websocket:
            try:
                await previous_websocket.close(code=1000, reason="Connection replaced")
            except Exception:
                logger.info("Previous WebSocket was already closed")

        print(
            f"[SOCKET CONNECT] user={username} active={list(self.active_connections.keys())}",
            flush=True,
        )

    def disconnect(
        self,
        username: str,
        connection_id: str,
        websocket: WebSocket | None = None,
    ):
        user_connections = self.active_connections.get(username)
        if not user_connections:
            return

        current_websocket = user_connections.get(connection_id)

        if current_websocket is None:
            return

        if websocket is not None and current_websocket is not websocket:
            logger.info(
                f"[SocketManager] Старое соединение {username} закрыто, "
                "текущее соединение оставлено активным"
            )
            return

        del user_connections[connection_id]
        if not user_connections:
            del self.active_connections[username]
        logger.info(f"[SocketManager] Соединение {username}/{connection_id} удалено")

    def has_connections(self, username: str) -> bool:
        return bool(self.active_connections.get(username))

    async def close_session(self, session_id: str) -> list[str]:
        disconnected_users = []
        for username, user_connections in list(self.active_connections.items()):
            websocket = user_connections.pop(session_id, None)
            if websocket is None:
                continue

            disconnected_users.append(username)
            try:
                await websocket.close(code=1008, reason="Session revoked")
            except Exception:
                logger.info("Revoked WebSocket was already closed")

            if not user_connections:
                del self.active_connections[username]

        return disconnected_users

    async def send_personal_message(self, message: dict, username: str):
        user_connections = self.active_connections.get(username, {})
        logger.info(
            f"[SocketManager] Trying to send message to {username}, connected users: {list(self.active_connections.keys())}, connections={len(user_connections)}"
        )
        if user_connections:
            delivered = False
            failed_connections = []
            for connection_id, websocket in list(user_connections.items()):
                try:
                    await websocket.send_json(message)
                    delivered = True
                except Exception as error:
                    logger.error(f"Ошибка отправки {username}: {error}")
                    failed_connections.append((connection_id, websocket))

            for connection_id, websocket in failed_connections:
                self.disconnect(username, connection_id, websocket)

            if delivered:
                logger.info(f"[SocketManager] Message sent to {username}")
        else:
            logger.warning(
                f"[SocketManager] User {username} not in active connections!"
            )


async def generate_verification_token() -> str:
    """Generate a secure random verification token."""
    return secrets.token_urlsafe(32)


def build_verification_url(token: str) -> str:
    base_url = settings.PUBLIC_BASE_URL.rstrip("/")
    return f"{base_url}/verify?{urlencode({'token': token})}"


async def send_verification_email(to_email: str, token: str):
    """Send verification email using aiosmtplib."""
    verify_url = build_verification_url(token)

    msg = MIMEMultipart()
    # Защита от отсутствия SMTP_FROM в pydantic-settings
    msg["From"] = getattr(settings, "SMTP_FROM", "noreply@messenger.local")
    msg["To"] = to_email
    msg["Subject"] = "Verify your Messenger account"

    html = f"""
    <h2>Verify your account</h2>
    <p>Click the link below to verify your account (expires in 15 minutes):</p>
    <a href="{verify_url}">{verify_url}</a>
    <p>If you didn't create an account, you can ignore this email.</p>
    """
    msg.attach(MIMEText(html, "html"))

    sender = aiosmtplib.SMTP(
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
    )
    await sender.connect()
    await sender.send_message(msg)
    await sender.close()


async def store_verification_token(token: str, username: str, email: str):
    """Store verification token in Redis with 15 minute TTL."""
    data = json.dumps({"username": username, "email": email})
    # Используем наш прямой redis_client вместо фантомного redis_mgr.client
    await redis_client.set(f"verify:{token}", data, ex=900)  # 15 min TTL


async def verify_token(token: str) -> dict | None:
    """Verify token and return user data if valid."""
    data = await redis_client.get(f"verify:{token}")
    if not data:
        return None
    await redis_client.delete(f"verify:{token}")
    return json.loads(data)


socket_manager = ConnectionManager()
