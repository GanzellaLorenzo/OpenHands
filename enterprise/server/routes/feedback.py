from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from storage.database import a_session_maker
from storage.feedback import ConversationFeedback
from storage.stored_conversation_metadata_saas import StoredConversationMetadataSaas

from openhands.app_server.app_conversation.sql_app_conversation_info_service import (
    StoredConversationMetadata,
)
from openhands.app_server.config import depends_event_service
from openhands.app_server.event.event_service import EventService
from openhands.events.event_store import EventStore
from openhands.sdk.utils.paging import page_iterator
from openhands.server.dependencies import get_dependencies
from openhands.server.shared import file_store
from openhands.server.user_auth import get_user_id

# We use the get_dependencies method here to signal to the OpenAPI docs that this endpoint
# is protected. The actual protection is provided by SetAuthCookieMiddleware
# TODO: It may be an error by you can actually post feedback to a conversation you don't
# own right now - maybe this is useful in the context of public shared conversations?
router = APIRouter(
    prefix='/feedback', tags=['feedback'], dependencies=get_dependencies()
)


def _not_found(conversation_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f'Conversation {conversation_id} not found',
    )


async def get_conversation_version(conversation_id: str, user_id: str) -> str:
    async with a_session_maker() as session:
        result = await session.execute(
            select(StoredConversationMetadata.conversation_version)
            .join(
                StoredConversationMetadataSaas,
                StoredConversationMetadata.conversation_id
                == StoredConversationMetadataSaas.conversation_id,
            )
            .where(
                StoredConversationMetadata.conversation_id == conversation_id,
                StoredConversationMetadataSaas.user_id == user_id,
            )
        )
        conversation_version = result.scalar_one_or_none()

    if conversation_version is None:
        raise _not_found(conversation_id)

    return conversation_version


async def get_v0_event_ids(conversation_id: str, user_id: str) -> list[str]:
    event_store = EventStore(
        sid=conversation_id,
        file_store=file_store,
        user_id=user_id,
    )
    return [str(event.id) for event in event_store.search_events(start_id=0)]


async def get_v1_event_ids(
    conversation_id: str, event_service: EventService
) -> list[str]:
    try:
        conversation_uuid = UUID(conversation_id)
    except ValueError as exc:
        raise _not_found(conversation_id) from exc

    return [
        event.id
        async for event in page_iterator(
            event_service.search_events,
            conversation_id=conversation_uuid,
            limit=100,
        )
    ]


async def get_event_ids(
    conversation_id: str, user_id: str, event_service: EventService
) -> list[str]:
    conversation_version = await get_conversation_version(conversation_id, user_id)

    if conversation_version == 'V1':
        return await get_v1_event_ids(conversation_id, event_service)

    return await get_v0_event_ids(conversation_id, user_id)


class FeedbackRequest(BaseModel):
    conversation_id: str
    event_id: str | int | None = None
    rating: int = Field(..., ge=1, le=5)
    reason: str | None = None
    metadata: dict[str, Any] | None = None


@router.post('/conversation', status_code=status.HTTP_201_CREATED)
async def submit_conversation_feedback(feedback: FeedbackRequest):
    """
    Submit feedback for a conversation.

    This endpoint accepts a rating (1-5) and optional reason for the feedback.
    The feedback is associated with a specific conversation and optionally a specific event.
    """
    if feedback.rating < 1 or feedback.rating > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Rating must be between 1 and 5',
        )

    new_feedback = ConversationFeedback(
        conversation_id=feedback.conversation_id,
        event_id=str(feedback.event_id) if feedback.event_id is not None else None,
        rating=feedback.rating,
        reason=feedback.reason,
        feedback_metadata=feedback.metadata,
    )

    async with a_session_maker() as session:
        session.add(new_feedback)
        await session.commit()

    return {'status': 'success', 'message': 'Feedback submitted successfully'}


@router.get('/conversation/{conversation_id}/batch')
async def get_batch_feedback(
    conversation_id: str,
    user_id: str = Depends(get_user_id),
    event_service: EventService = Depends(depends_event_service().dependency),
):
    """
    Get feedback for all events in a conversation.

    Returns feedback status for each event, including whether feedback exists
    and if so, the rating and reason.
    """
    event_ids = await get_event_ids(conversation_id, user_id, event_service)
    if not event_ids:
        return {}

    async with a_session_maker() as session:
        result = await session.execute(
            select(ConversationFeedback).where(
                ConversationFeedback.conversation_id == conversation_id,
                ConversationFeedback.event_id.in_(event_ids),
            )
        )

        feedback_map = {
            feedback.event_id: {
                'exists': True,
                'rating': feedback.rating,
                'reason': feedback.reason,
                'metadata': feedback.feedback_metadata,
            }
            for feedback in result.scalars()
            if feedback.event_id is not None
        }

    return {
        event_id: feedback_map.get(event_id, {'exists': False})
        for event_id in event_ids
    }
