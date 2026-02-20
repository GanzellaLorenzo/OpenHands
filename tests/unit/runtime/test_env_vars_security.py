"""Tests for environment variable security in runtime.

Tests that secret values are NOT exposed in error messages when
add_env_vars fails (e.g., due to invalid variable names).
"""

from unittest.mock import MagicMock

import pytest

from openhands.events.observation import CmdOutputObservation


class TestAddEnvVarsSecretRedaction:
    """Tests that add_env_vars redacts secrets from error messages."""

    @pytest.fixture
    def mock_runtime(self):
        """Create a mock runtime with the add_env_vars method."""
        from openhands.runtime.base import Runtime

        runtime = MagicMock(spec=Runtime)

        # Bind the actual methods we need
        runtime._run_cmd_with_retry = Runtime._run_cmd_with_retry.__get__(
            runtime, Runtime
        )
        runtime._is_bash_session_timeout = Runtime._is_bash_session_timeout.__get__(
            runtime, Runtime
        )
        runtime._calculate_retry_delay = Runtime._calculate_retry_delay.__get__(
            runtime, Runtime
        )
        runtime._extract_error_content = Runtime._extract_error_content.__get__(
            runtime, Runtime
        )
        runtime.add_env_vars = Runtime.add_env_vars.__get__(runtime, Runtime)

        # Mock plugins to be empty (no Jupyter)
        runtime.plugins = []

        return runtime

    def test_invalid_env_var_name_error_does_not_contain_secret_value(
        self, mock_runtime
    ):
        """Test that invalid env var names raise error WITHOUT exposing secret values.

        This tests the fix for the security issue where error messages like:
        'bash: export: `MY_DUMMY-SECRET=secret_value': not a valid identifier'
        were being logged, exposing the secret value.
        """
        # Simulate bash rejecting an invalid variable name (contains hyphen)
        # The error output would normally contain the full export command with secret
        error_output = (
            "bash: export: `MY_INVALID-VAR=super_secret_password': "
            'not a valid identifier'
        )
        error_obs = CmdOutputObservation(
            content=error_output,
            command='export MY_INVALID-VAR="super_secret_password"',
            exit_code=1,
        )
        mock_runtime.run = MagicMock(return_value=error_obs)

        # Call add_env_vars with an invalid variable name
        with pytest.raises(RuntimeError) as exc_info:
            mock_runtime.add_env_vars({'MY_INVALID-VAR': 'super_secret_password'})

        error_message = str(exc_info.value)

        # The error message should contain the variable NAME (key)
        assert 'MY_INVALID-VAR' in error_message

        # The error message should NOT contain the secret VALUE
        assert 'super_secret_password' not in error_message

        # The error message should NOT contain the raw bash error output
        assert 'not a valid identifier' not in error_message

        # The error message should provide helpful guidance
        assert (
            'valid bash identifier' in error_message.lower()
            or 'valid identifier' in error_message.lower()
        )

    def test_multiple_env_vars_error_does_not_expose_any_secrets(self, mock_runtime):
        """Test that when multiple env vars fail, no secrets are exposed."""
        # Simulate bash error with multiple secrets in the command
        error_output = (
            'export API_KEY="secret123"; export MY-BAD-VAR="another_secret"\n'
            "bash: export: `MY-BAD-VAR=another_secret': not a valid identifier"
        )
        error_obs = CmdOutputObservation(
            content=error_output,
            command='export API_KEY="secret123"; export MY-BAD-VAR="another_secret"',
            exit_code=1,
        )
        mock_runtime.run = MagicMock(return_value=error_obs)

        env_vars = {
            'API_KEY': 'secret123',
            'MY-BAD-VAR': 'another_secret',
        }

        with pytest.raises(RuntimeError) as exc_info:
            mock_runtime.add_env_vars(env_vars)

        error_message = str(exc_info.value)

        # Should NOT contain any secret values
        assert 'secret123' not in error_message
        assert 'another_secret' not in error_message

        # Should contain the variable names (keys)
        assert 'API_KEY' in error_message
        assert 'MY-BAD-VAR' in error_message

    def test_bashrc_error_does_not_expose_secrets(self, mock_runtime):
        """Test that .bashrc persistence errors also don't expose secrets."""
        # First call succeeds (export command)
        success_obs = CmdOutputObservation(content='', command='export', exit_code=0)
        # Second call fails (.bashrc update)
        error_obs = CmdOutputObservation(
            content='bash: some error with SECRET_VALUE',
            command='touch ~/.bashrc; grep...',
            exit_code=1,
        )
        mock_runtime.run = MagicMock(side_effect=[success_obs, error_obs])

        with pytest.raises(RuntimeError) as exc_info:
            mock_runtime.add_env_vars({'VALID_VAR': 'SECRET_VALUE'})

        error_message = str(exc_info.value)

        # Should NOT contain the secret value
        assert 'SECRET_VALUE' not in error_message

        # Should mention .bashrc in the error
        assert '.bashrc' in error_message
