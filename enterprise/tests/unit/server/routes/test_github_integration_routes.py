"""Unit tests for GitHub integration routes - ClientDisconnect handling.

These tests verify that ClientDisconnect exceptions are properly handled
when the FastAPI endpoint times out before the request body can be fully
received from the client.

These tests import and test the actual github_events endpoint from
server.routes.integration.github, mocking only external dependencies.
"""

import hashlib
import hmac
import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from starlette.requests import ClientDisconnect


@pytest.fixture
def mock_request():
    """Create a mock FastAPI Request object."""
    req = MagicMock(spec=Request)
    req.headers = {}
    return req


def create_valid_signature(payload: bytes, secret: str = 'test-secret') -> str:
    """Create a valid HMAC signature for the given payload."""
    signature = hmac.new(
        secret.encode('utf-8'),
        msg=payload,
        digestmod=hashlib.sha256,
    ).hexdigest()
    return f'sha256={signature}'


def get_github_module():
    """Import the github module dynamically.

    This ensures conftest.py environment variables are set before the module loads.
    """
    return importlib.import_module('server.routes.integration.github')


class TestClientDisconnect:
    """Test cases for ClientDisconnect handling in github_events endpoint."""

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_client_disconnect_returns_499(self, mock_logger, mock_request):
        """Test that ClientDisconnect is caught and returns 499 status code.

        This tests the scenario where the FastAPI endpoint times out before
        the request body can be fully received, causing starlette to raise
        ClientDisconnect.
        """
        github_module = get_github_module()
        github_events = github_module.github_events

        # Create a mock request that raises ClientDisconnect when body() is called
        # This simulates what happens when the client disconnects or times out
        mock_request.body = AsyncMock(side_effect=ClientDisconnect())

        # Call the endpoint
        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        assert response.status_code == 499
        assert response.body == b'{"error":"Client disconnected."}'

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.verify_github_signature')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_client_disconnect_during_json_parsing(
        self, mock_verify_sig, mock_logger, mock_request
    ):
        """Test ClientDisconnect during request.json() call returns 499."""
        github_module = get_github_module()
        github_events = github_module.github_events

        payload = b'{"test": "data"}'
        mock_request.body = AsyncMock(return_value=payload)
        # ClientDisconnect can also happen during json parsing
        mock_request.json = AsyncMock(side_effect=ClientDisconnect())
        mock_verify_sig.return_value = None  # Skip signature verification

        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        assert response.status_code == 499
        assert response.body == b'{"error":"Client disconnected."}'

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_client_disconnect_does_not_propagate_as_unhandled_exception(
        self, mock_logger, mock_request
    ):
        """Test that ClientDisconnect doesn't cause unhandled exception logging."""
        github_module = get_github_module()
        github_events = github_module.github_events

        mock_request.body = AsyncMock(side_effect=ClientDisconnect())

        # The function should return normally without raising
        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        # The generic exception handler should NOT be triggered
        # (it uses logger.exception which includes 'Error processing GitHub event')
        mock_logger.exception.assert_not_called()

        assert response.status_code == 499

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_client_disconnect_is_not_caught_by_generic_exception_handler(
        self, mock_logger, mock_request
    ):
        """Test that ClientDisconnect is caught by its specific handler, not the generic one.

        The generic exception handler returns 400 and logs with exception().
        ClientDisconnect should return 499 and log with debug().
        """
        github_module = get_github_module()
        github_events = github_module.github_events

        mock_request.body = AsyncMock(side_effect=ClientDisconnect())

        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        # Should be 499 (ClientDisconnect), not 400 (generic exception)
        assert response.status_code == 499

        # Should use debug(), not exception()
        mock_logger.debug.assert_called_once()
        mock_logger.exception.assert_not_called()


class TestWebhooksDisabled:
    """Test cases for when webhooks are disabled."""

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', False)
    async def test_webhooks_disabled_returns_200(self, mock_logger, mock_request):
        """Test that disabled webhooks return 200 with appropriate message."""
        github_module = get_github_module()
        github_events = github_module.github_events

        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        assert response.status_code == 200
        assert b'GitHub webhooks are currently disabled' in response.body


class TestSuccessfulRequest:
    """Test cases for successful webhook processing."""

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.github_manager')
    @patch('server.routes.integration.github.verify_github_signature')
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_successful_request_returns_200(
        self, mock_logger, mock_verify_sig, mock_github_manager, mock_request
    ):
        """Test that a successful request returns 200."""
        github_module = get_github_module()
        github_events = github_module.github_events

        payload = b'{"installation": {"id": 123}}'
        mock_request.body = AsyncMock(return_value=payload)
        mock_request.json = AsyncMock(return_value={'installation': {'id': 123}})
        mock_verify_sig.return_value = None
        mock_github_manager.receive_message = AsyncMock()

        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        assert response.status_code == 200
        assert b'GitHub events endpoint reached successfully' in response.body

    @pytest.mark.asyncio
    @patch('server.routes.integration.github.verify_github_signature')
    @patch('server.routes.integration.github.logger')
    @patch('server.routes.integration.github.GITHUB_WEBHOOKS_ENABLED', True)
    async def test_missing_installation_id_returns_400(
        self, mock_logger, mock_verify_sig, mock_request
    ):
        """Test that missing installation ID returns 400."""
        github_module = get_github_module()
        github_events = github_module.github_events

        payload = b'{"action": "opened"}'
        mock_request.body = AsyncMock(return_value=payload)
        mock_request.json = AsyncMock(return_value={'action': 'opened'})
        mock_verify_sig.return_value = None

        response = await github_events(
            request=mock_request,
            x_hub_signature_256='sha256=test',
        )

        assert response.status_code == 400
        assert b'Installation ID is missing' in response.body
