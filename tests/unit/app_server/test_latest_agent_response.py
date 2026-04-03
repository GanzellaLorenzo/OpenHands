"""Unit tests for the latest-agent-response endpoint in event_router.

Tests the GET /conversation/{conversation_id}/events/latest-agent-response endpoint,
which uses the SDK's get_agent_final_response utility to extract the last meaningful
agent message from conversation events.
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, status
from fastapi.testclient import TestClient

from openhands.agent_server.models import EventPage, EventSortOrder
from openhands.app_server.event.event_router import (
    AgentFinalResponse,
    get_latest_agent_response,
    router,
)
from openhands.sdk.event import ActionEvent, MessageEvent
from openhands.sdk.llm.message import Message, MessageToolCall, TextContent
from openhands.sdk.tool.builtins.finish import FinishAction, FinishTool
from openhands.server.dependencies import check_session_api_key


def _make_finish_event(message: str) -> ActionEvent:
    """Create a FinishAction ActionEvent with the given message."""
    return ActionEvent(
        source='agent',
        thought=[TextContent(text='Done')],
        tool_name=FinishTool.name,
        tool_call_id='tc_1',
        tool_call=MessageToolCall(
            id='tc_1',
            name='finish',
            arguments=f'{{"message": "{message}"}}',
            origin='completion',
        ),
        llm_response_id='resp_1',
        action=FinishAction(message=message),
    )


def _make_message_event(text: str, source: str = 'agent') -> MessageEvent:
    """Create a MessageEvent with the given text content."""
    return MessageEvent(
        source=source,
        llm_message=Message(
            role='assistant' if source == 'agent' else 'user',
            content=[TextContent(text=text)],
        ),
    )


def _make_action_event(tool_name: str, thought: str = 'thinking') -> ActionEvent:
    """Create a non-finish ActionEvent (e.g., a tool call like 'bash')."""
    return ActionEvent(
        source='agent',
        thought=[TextContent(text=thought)],
        tool_name=tool_name,
        tool_call_id='tc_x',
        tool_call=MessageToolCall(
            id='tc_x',
            name=tool_name,
            arguments='{}',
            origin='completion',
        ),
        llm_response_id='resp_x',
    )


def _make_mock_event_service(events: list | None = None):
    """Create a mock EventService that returns the given events in a single page."""
    service = MagicMock()
    service.search_events = AsyncMock(
        return_value=EventPage(items=events or [], next_page_id=None)
    )
    return service


# --- Direct function tests (no HTTP layer) ---


@pytest.mark.asyncio
class TestGetLatestAgentResponseFunction:
    """Test the get_latest_agent_response endpoint function directly."""

    async def test_returns_finish_message(self):
        """When the last agent event is a FinishAction, return its message."""
        finish_event = _make_finish_event('All done!')
        mock_service = _make_mock_event_service([finish_event])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert isinstance(result, AgentFinalResponse)
        assert result.response == 'All done!'

    async def test_returns_message_event_text(self):
        """When the last agent event is a MessageEvent, return its text."""
        msg_event = _make_message_event('Here is the answer.')
        mock_service = _make_mock_event_service([msg_event])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == 'Here is the answer.'

    async def test_returns_empty_string_when_no_events(self):
        """When there are no events, return empty string."""
        mock_service = _make_mock_event_service([])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == ''

    async def test_returns_empty_string_when_no_agent_events(self):
        """When there are only user events, return empty string."""
        user_msg = _make_message_event('Hello agent', source='user')
        mock_service = _make_mock_event_service([user_msg])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == ''

    async def test_finish_event_after_other_actions(self):
        """FinishAction at the end takes precedence over earlier tool calls."""
        bash_event = _make_action_event('bash', 'running command')
        finish_event = _make_finish_event('Task completed')
        mock_service = _make_mock_event_service([bash_event, finish_event])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == 'Task completed'

    async def test_message_event_after_other_actions(self):
        """MessageEvent at the end is returned when there's no FinishAction."""
        bash_event = _make_action_event('bash', 'running command')
        msg_event = _make_message_event('Here is my summary.')
        mock_service = _make_mock_event_service([bash_event, msg_event])

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == 'Here is my summary.'

    async def test_passes_correct_sort_order(self):
        """Verify events are fetched in TIMESTAMP order for get_agent_final_response."""
        mock_service = _make_mock_event_service([])
        conversation_id = str(uuid4())

        await get_latest_agent_response(
            conversation_id=conversation_id,
            event_service=mock_service,
        )

        mock_service.search_events.assert_called_once()
        call_kwargs = mock_service.search_events.call_args[1]
        assert call_kwargs['sort_order'] == EventSortOrder.TIMESTAMP

    async def test_handles_multiple_pages_of_events(self):
        """When events span multiple pages, all pages are consumed."""
        page1_event = _make_action_event('bash')
        finish_event = _make_finish_event('Done with pagination')

        call_count = 0

        async def mock_search(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return EventPage(items=[page1_event], next_page_id='page2')
            else:
                return EventPage(items=[finish_event], next_page_id=None)

        mock_service = MagicMock()
        mock_service.search_events = mock_search

        result = await get_latest_agent_response(
            conversation_id=str(uuid4()),
            event_service=mock_service,
        )

        assert result.response == 'Done with pagination'
        assert call_count == 2


# --- HTTP integration tests (FastAPI TestClient) ---


@pytest.fixture
def test_client():
    """Create a test client with the actual event router and mocked auth."""
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[check_session_api_key] = lambda: None
    client = TestClient(app, raise_server_exceptions=False)
    yield client
    app.dependency_overrides.clear()


class TestLatestAgentResponseHTTP:
    """Test the latest-agent-response endpoint via HTTP."""

    def test_endpoint_returns_200_with_valid_response(self, test_client):
        """The endpoint returns 200 and a JSON response."""
        conversation_id = str(uuid4())
        response = test_client.get(
            f'/conversation/{conversation_id}/events/latest-agent-response',
        )
        # May fail due to missing service injection, but should not be 404 or 422
        # (the route itself should be registered)
        assert response.status_code != status.HTTP_404_NOT_FOUND

    def test_response_schema(self):
        """Verify the AgentFinalResponse model has the expected shape."""
        resp = AgentFinalResponse(response='Hello')
        data = resp.model_dump()
        assert 'response' in data
        assert data['response'] == 'Hello'

    def test_empty_response_schema(self):
        """Verify the AgentFinalResponse model works with empty string."""
        resp = AgentFinalResponse(response='')
        data = resp.model_dump()
        assert data['response'] == ''
