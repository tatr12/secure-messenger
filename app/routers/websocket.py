import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, redis_mgr
from app.models import MessageTable
from app.repositories import MessageRepository
from app.services import socket_manager

router = APIRouter(tags=["Websocket Router"])

logger = logging.getLogger(__name__)


@router.websocket("/ws/{username}")
async def websocket_endpoint(
    websocket: WebSocket, username: str, db: AsyncSession = Depends(get_db)
):
    await socket_manager.connect(username, websocket)
    await redis_mgr.set_online(username)
    repo = MessageRepository(db)

    try:
        while True:
            try:
                text_data = await websocket.receive_text()
                data = json.loads(text_data)

                if data.get("type") == "read_receipt":
                    sender_of_msg = data.get("sender")
                    await repo.mark_as_read(sender=sender_of_msg, receiver=username)
                    receipt_packet = {
                        "type": "read_receipt_update",
                        "reader": username,
                        "to": sender_of_msg,
                    }
                    await redis_mgr.publish_message("messenger_routing", receipt_packet)
                    await socket_manager.send_personal_message(
                        receipt_packet, sender_of_msg
                    )
                else:
                    db_msg = MessageTable(
                        sender=username,
                        receiver=data.get("to"),
                        ciphertext=data.get("ciphertext"),
                        iv=data.get("iv"),
                        time_str=data.get("time"),
                        status="sent",
                    )
                    await repo.save_message(db_msg)
                    packet = {
                        "type": "message",
                        "id": db_msg.id,
                        "from": username,
                        "to": db_msg.receiver,
                        "ciphertext": db_msg.ciphertext,
                        "iv": db_msg.iv,
                        "time": db_msg.time_str,
                        "status": "sent",
                    }
                    await redis_mgr.publish_message("messenger_routing", packet)
                    await socket_manager.send_personal_message(packet, db_msg.receiver)

            except WebSocketDisconnect:
                break  # <-- выходим из while, не continue
            except json.JSONDecodeError:
                logger.warning(f"[{username}] невалидный JSON")
                continue
            except Exception as e:
                logger.error(f"[{username}] ошибка: {e}", exc_info=True)
                continue

    finally:
        socket_manager.disconnect(username)
        await redis_mgr.set_offline(username)
        logger.info(f"[{username}] отключился")
