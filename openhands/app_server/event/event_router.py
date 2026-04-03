"""Event router for OpenHands App Server."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field

from openhands.agent_server.models import EventPage, EventSortOrder
from openhands.app_server.config import depends_event_service
from openhands.app_server.event.event_service import EventService
from openhands.app_server.event_callback.event_callback_models import EventKind
from openhands.sdk import Event
from openhands.sdk.conversation.response_utils import get_agent_final_response
from openhands.sdk.utils.models import OpenHandsModel
from openhands.sdk.utils.paging import page_iterator
from openhands.server.dependencies import get_dependencies


class AgentFinalResponse(OpenHandsModel):
    """Response model for the latest agent response endpoint."""

    response: str = Field(
        description='The final response message from the agent, '
        'or an empty string if not found.'
    )


# We use the get_dependencies method here to signal to the OpenAPI docs that this endpoint
# is protected. The actual protection is provided by SetAuthCookieMiddleware
router = APIRouter(
    prefix='/conversation/{conversation_id}/events',
    tags=['Events'],
    dependencies=get_dependencies(),
)
event_service_dependency = depends_event_service()


# Read methods


@router.get('/search')
async def search_events(
    conversation_id: str,
    kind__eq: Annotated[
        EventKind | None,
        Query(title='Optional filter by event kind'),
    ] = None,
    timestamp__gte: Annotated[
        datetime | None,
        Query(title='Optional filter by timestamp greater than or equal to'),
    ] = None,
    timestamp__lt: Annotated[
        datetime | None,
        Query(title='Optional filter by timestamp less than'),
    ] = None,
    sort_order: Annotated[
        EventSortOrder,
        Query(title='Sort order for results'),
    ] = EventSortOrder.TIMESTAMP,
    page_id: Annotated[
        str | None,
        Query(title='Optional next_page_id from the previously returned page'),
    ] = None,
    limit: Annotated[
        int,
        Query(title='The max number of results in the page', gt=0, le=100),
    ] = 100,
    event_service: EventService = event_service_dependency,
) -> EventPage:
    """Search / List events."""
    return await event_service.search_events(
        conversation_id=UUID(conversation_id),
        kind__eq=kind__eq,
        timestamp__gte=timestamp__gte,
        timestamp__lt=timestamp__lt,
        sort_order=sort_order,
        page_id=page_id,
        limit=limit,
    )


@router.get('/count')
async def count_events(
    conversation_id: str,
    kind__eq: Annotated[
        EventKind | None,
        Query(title='Optional filter by event kind'),
    ] = None,
    timestamp__gte: Annotated[
        datetime | None,
        Query(title='Optional filter by timestamp greater than or equal to'),
    ] = None,
    timestamp__lt: Annotated[
        datetime | None,
        Query(title='Optional filter by timestamp less than'),
    ] = None,
    event_service: EventService = event_service_dependency,
) -> int:
    """Count events matching the given filters."""
    return await event_service.count_events(
        conversation_id=UUID(conversation_id),
        kind__eq=kind__eq,
        timestamp__gte=timestamp__gte,
        timestamp__lt=timestamp__lt,
    )


@router.get('')
async def batch_get_events(
    conversation_id: str,
    id: Annotated[list[str], Query()],
    event_service: EventService = event_service_dependency,
) -> list[Event | None]:
    """Get a batch of events given their ids, returning null for any missing event."""
    if len(id) > 100:
        raise HTTPException(
            status_code=400,
            detail=f'Cannot request more than 100 events at once, got {len(id)}',
        )
    event_ids = [UUID(id_) for id_ in id]
    events = await event_service.batch_get_events(UUID(conversation_id), event_ids)
    return events


@router.get('/latest-agent-response')
async def get_latest_agent_response(
    conversation_id: str,
    event_service: EventService = event_service_dependency,
) -> AgentFinalResponse:
    """Get the final response from the agent for this conversation.

    This extracts the last meaningful agent message from the conversation events.
    The agent can end a conversation in two ways:
    1. By calling the finish tool — returns the finish message
    2. By returning a text message with no tool calls — returns that message

    Returns:
        AgentFinalResponse with the agent's final response string,
        or an empty string if no agent response was found.
    """
    events: list[Event] = []
    async for event in page_iterator(
        event_service.search_events,
        conversation_id=UUID(conversation_id),
        sort_order=EventSortOrder.TIMESTAMP,
    ):
        events.append(event)

    response = get_agent_final_response(events)
    return AgentFinalResponse(response=response)
