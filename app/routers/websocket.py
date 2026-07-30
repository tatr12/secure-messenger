import asyncio
import json
import logging
import time
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, redis_mgr
from app.dependencies import authenticate_access_token
from app.models import MessageTable
from app.repositories import MessageRepository, SessionRepository
from app.services import socket_manager

router = APIRouter(tags=["Websocket Router"])

logger = logging.getLogger(__name__)

WEBSOCKET_PROTOCOL = "voiden"
WEBSOCKET_AUTH_PREFIX = "voiden.auth."


def get_websocket_credentials(websocket: WebSocket) -> tuple[str | None, str | None]:
    requested_protocols = websocket.headers.get("sec-websocket-protocol", "").split(",")
    for requested_protocol in requested_protocols:
        protocol = requested_protocol.strip()
        if protocol.startswith(WEBSOCKET_AUTH_PREFIX):
            return protocol.removeprefix(WEBSOCKET_AUTH_PREFIX), WEBSOCKET_PROTOCOL

    # Compatibility for clients deployed before the subprotocol transport.
    return websocket.query_params.get("token"), None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    token, selected_protocol = get_websocket_credentials(websocket)
    context = await authenticate_access_token(token, db) if token else None

    if context is None:
        await websocket.close(code=1008)
        return

    username = context.user.username
    session_id = context.session.id if context.session else None
    connection_id = session_id or f"legacy-{uuid4()}"
    access_token_expires_at = float(context.payload["exp"])

    await socket_manager.connect(
        username,
        connection_id,
        websocket,
        subprotocol=selected_protocol,
    )
    await redis_mgr.set_online(username)
    repo = MessageRepository(db)

    try:
        while True:
            try:
                seconds_until_expiry = access_token_expires_at - time.time()
                if seconds_until_expiry <= 0:
                    await websocket.close(code=1008, reason="Access token expired")
                    break

                text_data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=seconds_until_expiry,
                )

                if session_id and not await SessionRepository(db).get_active_by_id(
                    session_id,
                    user_id=context.user.id,
                ):
                    await websocket.close(code=1008, reason="Session revoked")
                    break

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
            except TimeoutError:
                await websocket.close(code=1008, reason="Access token expired")
                break
            except json.JSONDecodeError:
                logger.warning(f"[{username}] невалидный JSON")
                continue
            except Exception as e:
                logger.error(f"[{username}] ошибка: {e}", exc_info=True)
                continue

    finally:
        socket_manager.disconnect(username, connection_id, websocket)

        if not socket_manager.has_connections(username):
            await redis_mgr.set_offline(username)
            logger.info(f"[{username}] отключился")
        else:
            logger.info(
                f"[{username}] старый WebSocket закрыт, "
                "новое соединение продолжает работать"
            )
