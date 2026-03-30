import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import google
import pytest

# Mock modules that require unavailable infrastructure during unit tests.
sys.modules['google'] = google
sys.modules['google.cloud'] = MagicMock()
sys.modules['google.cloud.sql'] = MagicMock()
sys.modules['google.cloud.sql.connector'] = MagicMock()
sys.modules['google.api_core'] = MagicMock()
sys.modules['google.api_core.exceptions'] = MagicMock()
sys.modules['google.cloud.storage'] = MagicMock()
sys.modules['google.cloud.storage.blob'] = MagicMock()
sys.modules['google.cloud.storage.client'] = MagicMock()
sys.modules['google.cloud.storage.bucket'] = MagicMock()



sys.modules['google.cloud.sql.connector.Connector'] = MagicMock()
mock_db_module = MagicMock()
mock_db_module.a_session_maker = MagicMock()
sys.modules['storage.database'] = mock_db_module

from server.routes import feedback as feedback_routes  # noqa: E402
from server.routes.feedback import FeedbackRequest  # noqa: E402
from storage.feedback import ConversationFeedback  # noqa: E402


@asynccontextmanager
async def session_context(session):
    yield session


@pytest.mark.asyncio
async def test_submit_feedback_normalizes_event_id_to_string():
    mock_session = MagicMock()
    mock_session.commit = AsyncMock()

    feedback_data = FeedbackRequest(
        conversation_id='test-conversation-123',
        event_id=42,
        rating=5,
        reason='The agent was very helpful',
        metadata={'browser': 'Chrome', 'os': 'Windows'},
    )

    with patch.object(
        feedback_routes, 'a_session_maker', lambda: session_context(mock_session)
    ):
        result = await feedback_routes.submit_conversation_feedback(feedback_data)

    assert result == {
        'status': 'success',
        'message': 'Feedback submitted successfully',
    }
    mock_session.add.assert_called_once()
    mock_session.commit.assert_called_once()

    added_feedback = mock_session.add.call_args[0][0]
    assert isinstance(added_feedback, ConversationFeedback)
    assert added_feedback.conversation_id == 'test-conversation-123'
    assert added_feedback.event_id == '42'
    assert added_feedback.rating == 5
    assert added_feedback.reason == 'The agent was very helpful'
    assert added_feedback.feedback_metadata == {
        'browser': 'Chrome',
        'os': 'Windows',
    }


@pytest.mark.asyncio
async def test_get_batch_feedback_returns_v0_feedback_using_string_keys():
    mock_session = MagicMock()
    mock_session.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(scalar_one_or_none=lambda: 'V0'),
            SimpleNamespace(
                scalars=lambda: [
                    SimpleNamespace(
                        event_id='1',
                        rating=4,
                        reason='useful',
                        feedback_metadata={'source': 'likert-scale'},
                    )
                ]
            ),
        ]
    )

    mock_event_store = MagicMock()
    mock_event_store.search_events.return_value = [
        SimpleNamespace(id=1),
        SimpleNamespace(id=2),
    ]

    with (
        patch.object(
            feedback_routes, 'a_session_maker', lambda: session_context(mock_session)
        ),
        patch.object(feedback_routes, 'EventStore', return_value=mock_event_store),
    ):
        response = await feedback_routes.get_batch_feedback(
            'test-conversation-123',
            user_id='user-123',
            event_service=MagicMock(),
        )

    assert response == {
        '1': {
            'exists': True,
            'rating': 4,
            'reason': 'useful',
            'metadata': {'source': 'likert-scale'},
        },
        '2': {'exists': False},
    }


@pytest.mark.asyncio
async def test_get_batch_feedback_reads_v1_event_ids_from_event_service():
    mock_session = MagicMock()
    mock_session.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(scalar_one_or_none=lambda: 'V1'),
            SimpleNamespace(
                scalars=lambda: [
                    SimpleNamespace(
                        event_id='evt-1',
                        rating=5,
                        reason='great',
                        feedback_metadata={'source': 'likert-scale'},
                    )
                ]
            ),
        ]
    )

    async def fake_page_iterator(*args, **kwargs):
        yield SimpleNamespace(id='evt-1')
        yield SimpleNamespace(id='evt-2')

    with (
        patch.object(
            feedback_routes, 'a_session_maker', lambda: session_context(mock_session)
        ),
        patch.object(feedback_routes, 'page_iterator', fake_page_iterator),
    ):
        response = await feedback_routes.get_batch_feedback(
            '00000000-0000-0000-0000-000000000123',
            user_id='user-123',
            event_service=MagicMock(),
        )

    assert response == {
        'evt-1': {
            'exists': True,
            'rating': 5,
            'reason': 'great',
            'metadata': {'source': 'likert-scale'},
        },
        'evt-2': {'exists': False},
    }
