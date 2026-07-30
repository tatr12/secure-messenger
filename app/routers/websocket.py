import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, redis_mgr
from app.jwt import decode_access_token
from app.models import MessageTable
from app.repositories import MessageRepository
from app.services import socket_manager

router = APIRouter(tags=["Websocket Router"])

logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    token = websocket.query_params.get("token")
    payload = decode_access_token(token) if token else None

    if payload is None:
        await websocket.close(code=1008)
        return

    username = payload.get("sub")
    if not username:
        await websocket.close(code=1008)
        return

    await socket_manager.connect(username, websocket)
    await redis_mgr.set_online(username)
    repo = MessageRepository(db)

    try:
        while True:
            try:
                text_data = await websocket.receive_text()

                print(
                    f"[WS RECEIVE] from={username} bytes={len(text_data)}",
                    flush=True,
                )

                data = json.loads(text_data)

                print(
                    f"[WS PACKET] from={username} to={data.get('to')} "
                    f"type={data.get('type', 'message')} "
                    f"has_ciphertext={bool(data.get('ciphertext'))}",
                    flush=True,
                )

                if data.get("type") == "read_receipt":
                    sender_of_msg = data.get("sender")
                    await repo.mark_as_read(sender=sender_of_msg, receiver=username)
                    receipt_packet = {
                        "type": "read_receipt_update",
                        "reader": username,
                        "to": sender_of_msg,
                    }
                    await redis_mgr.publish_message("messenger_routing", receipt_packet)
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

            except WebSocketDisconnect:
                break  # <-- выходим из while, не continue
            except json.JSONDecodeError:
                logger.warning(f"[{username}] невалидный JSON")
                continue
            except Exception as e:
                logger.error(f"[{username}] ошибка: {e}", exc_info=True)
                continue

    finally:
        socket_manager.disconnect(username, websocket)

        if username not in socket_manager.active_connections:
            await redis_mgr.set_offline(username)
            logger.info(f"[{username}] отключился")
        else:
            logger.info(
                f"[{username}] старый WebSocket закрыт, "
                "новое соединение продолжает работать"
            )
