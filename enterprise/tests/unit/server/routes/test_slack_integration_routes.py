"""Unit tests for Slack integration routes."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import BackgroundTasks, Request
from server.routes.integration.slack import keycloak_callback
from sqlalchemy.exc import OperationalError, SQLAlchemyError


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request."""
    request = MagicMock(spec=Request)
    request.url = MagicMock()
    request.url.hostname = 'localhost'
    request.url.netloc = 'localhost:8000'
    request.url.path = '/slack/keycloak-callback'
    return request


@pytest.fixture
def mock_background_tasks():
    """Create a mock BackgroundTasks instance."""
    return MagicMock(spec=BackgroundTasks)


class TestKeycloakCallbackStoreTokenFailure:
    """Test cases for store_offline_token failure in keycloak_callback."""

    @pytest.mark.asyncio
    @patch('server.routes.integration.slack.jwt')
    @patch('server.routes.integration.slack.UserStore')
    @patch('server.routes.integration.slack.token_manager')
    @patch('server.routes.integration.slack.config')
    async def test_keycloak_callback_store_token_database_error(
        self,
        mock_config,
        mock_token_manager,
        mock_user_store,
        mock_jwt,
        mock_request,
        mock_background_tasks,
        create_keycloak_user_info,
    ):
        """Test keycloak_callback returns 500 when store_offline_token raises SQLAlchemyError."""
        # Arrange
        state_payload = {
            'slack_user_id': 'U12345',
            'bot_access_token': 'xoxb-test-token',
            'team_id': 'T12345',
        }

        mock_config.jwt_secret.get_secret_value.return_value = 'test_secret'
        mock_jwt.decode.return_value = state_payload

        mock_token_manager.get_keycloak_tokens = AsyncMock(
            return_value=('test_access_token', 'test_refresh_token')
        )
        mock_token_manager.get_user_info = AsyncMock(
            return_value=create_keycloak_user_info(
                sub='test_keycloak_user_id',
                preferred_username='test_user',
                identity_provider='github',
            )
        )
        mock_token_manager.store_offline_token = AsyncMock(
            side_effect=OperationalError(
                'statement', 'params', Exception('Connection refused')
            )
        )

        mock_user = MagicMock()
        mock_user.id = 'test_keycloak_user_id'
        mock_user.current_org_id = 'test_org_id'
        mock_user_store.get_user_by_id = AsyncMock(return_value=mock_user)

        # Act
        result = await keycloak_callback(
            request=mock_request,
            background_tasks=mock_background_tasks,
            code='test_code',
            state='test_state',
        )

        # Assert
        assert result.status_code == 500
        assert 'Failed to store authentication token' in result.body.decode()
        mock_token_manager.store_offline_token.assert_called_once_with(
            'test_keycloak_user_id', 'test_refresh_token'
        )

    @pytest.mark.asyncio
    @patch('server.routes.integration.slack.logger')
    @patch('server.routes.integration.slack.jwt')
    @patch('server.routes.integration.slack.UserStore')
    @patch('server.routes.integration.slack.token_manager')
    @patch('server.routes.integration.slack.config')
    async def test_keycloak_callback_store_token_logs_error(
        self,
        mock_config,
        mock_token_manager,
        mock_user_store,
        mock_jwt,
        mock_logger,
        mock_request,
        mock_background_tasks,
        create_keycloak_user_info,
    ):
        """Test keycloak_callback logs error when store_offline_token raises SQLAlchemyError."""
        # Arrange
        state_payload = {
            'slack_user_id': 'U12345',
            'bot_access_token': 'xoxb-test-token',
            'team_id': 'T12345',
        }

        mock_config.jwt_secret.get_secret_value.return_value = 'test_secret'
        mock_jwt.decode.return_value = state_payload

        mock_token_manager.get_keycloak_tokens = AsyncMock(
            return_value=('test_access_token', 'test_refresh_token')
        )
        mock_token_manager.get_user_info = AsyncMock(
            return_value=create_keycloak_user_info(
                sub='test_keycloak_user_id',
                preferred_username='test_user',
                identity_provider='github',
            )
        )
        mock_token_manager.store_offline_token = AsyncMock(
            side_effect=SQLAlchemyError('Database error')
        )

        mock_user = MagicMock()
        mock_user.id = 'test_keycloak_user_id'
        mock_user.current_org_id = 'test_org_id'
        mock_user_store.get_user_by_id = AsyncMock(return_value=mock_user)

        # Act
        result = await keycloak_callback(
            request=mock_request,
            background_tasks=mock_background_tasks,
            code='test_code',
            state='test_state',
        )

        # Assert
        assert result.status_code == 500
        assert 'Failed to store authentication token' in result.body.decode()

        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert call_args[0][0] == 'failed_to_store_offline_token'
        assert call_args[1]['extra']['keycloak_user_id'] == 'test_keycloak_user_id'
        assert 'Database error' in call_args[1]['extra']['error']

    @pytest.mark.asyncio
    @patch('server.routes.integration.slack.slack_manager')
    @patch('server.routes.integration.slack.a_session_maker')
    @patch('server.routes.integration.slack.AsyncWebClient')
    @patch('server.routes.integration.slack.slack_team_store')
    @patch('server.routes.integration.slack.jwt')
    @patch('server.routes.integration.slack.UserStore')
    @patch('server.routes.integration.slack.token_manager')
    @patch('server.routes.integration.slack.config')
    async def test_keycloak_callback_store_token_success(
        self,
        mock_config,
        mock_token_manager,
        mock_user_store,
        mock_jwt,
        mock_slack_team_store,
        mock_async_web_client,
        mock_a_session_maker,
        mock_slack_manager,
        mock_request,
        mock_background_tasks,
        create_keycloak_user_info,
    ):
        """Test keycloak_callback continues normally when store_offline_token succeeds."""
        # Arrange
        state_payload = {
            'slack_user_id': 'U12345',
            'bot_access_token': 'xoxb-test-token',
            'team_id': 'T12345',
        }

        mock_config.jwt_secret.get_secret_value.return_value = 'test_secret'
        mock_jwt.decode.return_value = state_payload

        mock_token_manager.get_keycloak_tokens = AsyncMock(
            return_value=('test_access_token', 'test_refresh_token')
        )
        mock_token_manager.get_user_info = AsyncMock(
            return_value=create_keycloak_user_info(
                sub='test_keycloak_user_id',
                preferred_username='test_user',
                identity_provider='github',
            )
        )
        mock_token_manager.store_offline_token = AsyncMock(return_value=None)
        mock_token_manager.store_idp_tokens = AsyncMock(return_value=None)

        mock_user = MagicMock()
        mock_user.id = 'test_keycloak_user_id'
        mock_user.current_org_id = 'test_org_id'
        mock_user_store.get_user_by_id = AsyncMock(return_value=mock_user)

        mock_slack_team_store.create_team = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.users_info = AsyncMock(
            return_value=MagicMock(
                data={'user': {'profile': {'display_name': 'Test User'}}}
            )
        )
        mock_async_web_client.return_value = mock_client_instance

        # Act
        result = await keycloak_callback(
            request=mock_request,
            background_tasks=mock_background_tasks,
            code='test_code',
            state='test_state',
        )

        # Assert
        assert result.status_code == 200
        assert 'Authentication Successful' in result.body.decode()
        mock_token_manager.store_offline_token.assert_called_once()
        mock_token_manager.store_idp_tokens.assert_called_once()
