from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.repositories import ChatPreferenceRepository, UserRepository
from app.schemas import (
    ChatPreferenceResponseSchema,
    UpdateChatPreferenceSchema,
)

router = APIRouter(prefix="/chat-preferences", tags=["Chat Preferences"])


def serialize_chat_preference(preference, partner_username: str) -> dict:
    return {
        "partner": partner_username,
        "is_pinned": preference.is_pinned,
        "is_muted": preference.is_muted,
        "is_archived": preference.is_archived,
        "updated_at": preference.updated_at,
    }


@router.get("", response_model=list[ChatPreferenceResponseSchema])
async def list_chat_preferences(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    preferences = await ChatPreferenceRepository(db).list_for_user(current_user.id)
    return [
        serialize_chat_preference(preference, partner_username)
        for preference, partner_username in preferences
    ]


@router.patch("/{partner_username}", response_model=ChatPreferenceResponseSchema)
async def update_chat_preference(
    partner_username: str,
    data: UpdateChatPreferenceSchema,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if partner_username == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot configure your own chat")

    partner = await UserRepository(db).get_by_username(partner_username)
    if partner is None:
        raise HTTPException(status_code=404, detail="Chat partner not found")

    preference = await ChatPreferenceRepository(db).upsert(
        user_id=current_user.id,
        partner_id=partner.id,
        update_data=data,
    )
    return serialize_chat_preference(preference, partner.username)
