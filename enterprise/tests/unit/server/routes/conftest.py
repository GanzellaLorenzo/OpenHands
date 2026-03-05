"""Pytest configuration for server.routes tests.

This module sets up the test environment for server routes, particularly
for tests that import modules which initialize GitHub-related objects at
module load time.

Note: This conftest.py runs when pytest DISCOVERS tests, which is before
the test file modules are imported. However, since the constants.py module
caches environment variables at import time, the env vars need to be set
in pyproject.toml [tool.pytest.ini_options] env section or via command line.
"""
