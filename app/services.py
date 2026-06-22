from fastapi import WebSocket
from typing import Dict
import asyncio
import json
import logging
import secrets
import aiosmtplib
import redis.asyncio as aioredis  # Подключаем асинхронный Redis напрямую 🚀
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

logger = logging.getLogger(__name__)

# Инициализируем прямой клиент докера Redis. 
# Хост 'redis' берется из настроек или напрямую, если в settings нет REDIS_URL
redis_url = getattr(settings, "REDIS_URL", "redis://redis:6379/0")
redis_client = aioredis.from_url(redis_url, decode_responses=True)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in self.active_connections:
            del self.active_connections[username]

    async def send_personal_message(self, message: dict, username: str):
        ws = self.active_connections.get(username)
        logger.info(f"[SocketManager] Trying to send message to {username}, connected users: {list(self.active_connections.keys())}, ws={ws}")
        if ws:
            try:
                await ws.send_json(message)
                logger.info(f"[SocketManager] Message sent to {username}")
            except Exception as e:
                logger.error(f"Ошибка отправки {username}: {e}")
                self.disconnect(username)
        else:
            logger.warning(f"[SocketManager] User {username} not in active connections!")

async def generate_verification_token() -> str:
    """Generate a secure random verification token."""
    return secrets.token_urlsafe(32)

async def send_verification_email(to_email: str, token: str):
    """Send verification email using aiosmtplib."""
    # Меняем localhost на 127.0.0.2, раз твой фронтенд сидит там
    verify_url = f"http://127.0.0.2:5173/verify?token={token}"
    
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