"""
Service API routes for internal service-to-service communication.

This module provides endpoints for trusted internal services (e.g., automations service)
to perform privileged operations like creating API keys on behalf of users.

Authentication is via a shared secret (X-Service-API-Key header) configured
through the AUTOMATIONS_SERVICE_KEY environment variable.
"""

import os
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, field_validator
from storage.api_key_store import ApiKeyStore
from storage.org_member_store import OrgMemberStore
from storage.user_store import UserStore

from openhands.core.logger import openhands_logger as logger

# Environment variable for the service API key
AUTOMATIONS_SERVICE_KEY = os.getenv('AUTOMATIONS_SERVICE_KEY', '').strip()

service_router = APIRouter(prefix='/api/service', tags=['Service'])


class CreateUserApiKeyRequest(BaseModel):
    """Request model for creating an API key on behalf of a user."""

    name: str  # Required - used to identify the key

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('name is required and cannot be empty')
        return v.strip()


class CreateUserApiKeyResponse(BaseModel):
    """Response model for created API key."""

    key: str
    user_id: str
    org_id: str
    name: str


class ServiceInfoResponse(BaseModel):
    """Response model for service info endpoint."""

    service: str
    authenticated: bool


async def validate_service_api_key(
    x_service_api_key: str | None = Header(default=None, alias='X-Service-API-Key'),
) -> str:
    """
    Validate the service API key from the request header.

    Args:
        x_service_api_key: The service API key from the X-Service-API-Key header

    Returns:
        str: Service identifier for audit logging

    Raises:
        HTTPException: 401 if key is missing or invalid
        HTTPException: 503 if service auth is not configured
    """
    if not AUTOMATIONS_SERVICE_KEY:
        logger.warning(
            'Service authentication not configured (AUTOMATIONS_SERVICE_KEY not set)'
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Service authentication not configured',
        )

    if not x_service_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='X-Service-API-Key header is required',
        )

    if x_service_api_key != AUTOMATIONS_SERVICE_KEY:
        logger.warning('Invalid service API key attempted')
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid service API key',
        )

    return 'automations-service'


@service_router.get('/health')
async def service_health() -> dict:
    """Health check endpoint for the service API.

    This endpoint does not require authentication and can be used
    to verify the service routes are accessible.
    """
    return {
        'status': 'ok',
        'service_auth_configured': bool(AUTOMATIONS_SERVICE_KEY),
    }


@service_router.post('/users/{user_id}/orgs/{org_id}/api-keys')
async def get_or_create_api_key_for_user(
    user_id: str,
    org_id: UUID,
    request: CreateUserApiKeyRequest,
    x_service_api_key: str | None = Header(default=None, alias='X-Service-API-Key'),
) -> CreateUserApiKeyResponse:
    """
    Get or create an API key for a user on behalf of the automations service.

    If a key with the given name already exists for the user/org and is not expired,
    returns the existing key. Otherwise, creates a new key.

    The created/returned keys are system keys and are:
    - Not visible to the user in their API keys list
    - Not deletable by the user
    - Never expire

    Args:
        user_id: The user ID
        org_id: The organization ID
        request: Request body containing name (required)
        x_service_api_key: Service API key header for authentication

    Returns:
        CreateUserApiKeyResponse: The API key and metadata

    Raises:
        HTTPException: 401 if service key is invalid
        HTTPException: 404 if user not found
        HTTPException: 403 if user is not a member of the specified org
    """
    # Validate service API key
    service_id = await validate_service_api_key(x_service_api_key)

    # Verify user exists
    user = await UserStore.get_user_by_id(user_id)
    if not user:
        logger.warning(
            'Service attempted to create key for non-existent user',
            extra={'user_id': user_id},
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'User {user_id} not found',
        )

    # Verify user is a member of the specified org
    org_member = await OrgMemberStore.get_org_member(org_id, UUID(user_id))
    if not org_member:
        logger.warning(
            'Service attempted to create key for user not in org',
            extra={
                'user_id': user_id,
                'org_id': str(org_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f'User {user_id} is not a member of org {org_id}',
        )

    # Get or create the system API key
    api_key_store = ApiKeyStore.get_instance()

    try:
        api_key = await api_key_store.get_or_create_system_api_key(
            user_id=user_id,
            org_id=org_id,
            name=request.name,
        )
    except Exception as e:
        logger.exception(
            'Failed to get or create system API key',
            extra={
                'user_id': user_id,
                'org_id': str(org_id),
                'error': str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Failed to get or create API key',
        )

    logger.info(
        'Service created API key for user',
        extra={
            'service_id': service_id,
            'user_id': user_id,
            'org_id': str(org_id),
            'key_name': request.name,
        },
    )

    return CreateUserApiKeyResponse(
        key=api_key,
        user_id=user_id,
        org_id=str(org_id),
        name=request.name,
    )


@service_router.delete('/users/{user_id}/orgs/{org_id}/api-keys/{key_name}')
async def delete_user_api_key(
    user_id: str,
    org_id: UUID,
    key_name: str,
    x_service_api_key: str | None = Header(default=None, alias='X-Service-API-Key'),
) -> dict:
    """
    Delete a system API key created by the service.

    This endpoint allows the automations service to clean up API keys
    it previously created for users.

    Args:
        user_id: The user ID
        org_id: The organization ID
        key_name: The name of the key to delete (without __SYSTEM__: prefix)
        x_service_api_key: Service API key header for authentication

    Returns:
        dict: Success message

    Raises:
        HTTPException: 401 if service key is invalid
        HTTPException: 404 if key not found
    """
    # Validate service API key
    service_id = await validate_service_api_key(x_service_api_key)

    api_key_store = ApiKeyStore.get_instance()

    # Delete the key by name (wrap with system key prefix since service creates system keys)
    system_key_name = api_key_store.make_system_key_name(key_name)
    success = await api_key_store.delete_api_key_by_name(
        user_id=user_id,
        org_id=org_id,
        name=system_key_name,
        allow_system=True,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'API key with name "{key_name}" not found for user {user_id} in org {org_id}',
        )

    logger.info(
        'Service deleted API key for user',
        extra={
            'service_id': service_id,
            'user_id': user_id,
            'org_id': str(org_id),
            'key_name': key_name,
        },
    )

    return {'message': 'API key deleted successfully'}


# Sandbox automation metadata endpoints


class SetSandboxAutomationMetadataRequest(BaseModel):
    """Request model for setting automation metadata on a sandbox."""

    automation_id: str | None = None
    automation_name: str | None = None
    trigger_type: str | None = None
    run_id: str | None = None
    extra_metadata: dict | None = None


class SandboxAutomationMetadataResponse(BaseModel):
    """Response model for sandbox automation metadata."""

    sandbox_id: str
    automation_id: str | None = None
    automation_name: str | None = None
    trigger_type: str | None = None
    run_id: str | None = None
    extra_metadata: dict | None = None


@service_router.put('/sandboxes/{sandbox_id}/automation-metadata')
async def set_sandbox_automation_metadata(
    sandbox_id: str,
    request: SetSandboxAutomationMetadataRequest,
    x_service_api_key: str | None = Header(default=None, alias='X-Service-API-Key'),
) -> SandboxAutomationMetadataResponse:
    """
    Set automation metadata for a sandbox.

    This endpoint allows the automations service to associate metadata with a sandbox
    so that any conversations created within that sandbox inherit the automation context.

    The metadata includes:
    - automation_id: The automation definition ID
    - automation_name: Human-readable name of the automation
    - trigger_type: Type of trigger (e.g., 'cron', 'webhook')
    - run_id: The specific automation run ID
    - extra_metadata: Additional key-value pairs

    Args:
        sandbox_id: The sandbox ID to set metadata for
        request: The metadata to set
        x_service_api_key: Service API key header for authentication

    Returns:
        SandboxAutomationMetadataResponse: The stored metadata

    Raises:
        HTTPException: 401 if service key is invalid
        HTTPException: 503 if service auth is not configured
    """
    # Validate service API key
    service_id = await validate_service_api_key(x_service_api_key)

    from storage.sandbox_automation_metadata_store import SandboxAutomationMetadataStore

    metadata = await SandboxAutomationMetadataStore.set_metadata(
        sandbox_id=sandbox_id,
        automation_id=request.automation_id,
        automation_name=request.automation_name,
        trigger_type=request.trigger_type,
        run_id=request.run_id,
        extra_metadata=request.extra_metadata,
    )

    logger.info(
        'Service set sandbox automation metadata',
        extra={
            'service_id': service_id,
            'sandbox_id': sandbox_id,
            'automation_id': request.automation_id,
            'trigger_type': request.trigger_type,
        },
    )

    return SandboxAutomationMetadataResponse(
        sandbox_id=metadata.sandbox_id,
        automation_id=metadata.automation_id,
        automation_name=metadata.automation_name,
        trigger_type=metadata.trigger_type,
        run_id=metadata.run_id,
        extra_metadata=metadata.extra_metadata,
    )


@service_router.get('/sandboxes/{sandbox_id}/automation-metadata')
async def get_sandbox_automation_metadata(
    sandbox_id: str,
    x_service_api_key: str | None = Header(default=None, alias='X-Service-API-Key'),
) -> SandboxAutomationMetadataResponse | None:
    """
    Get automation metadata for a sandbox.

    Args:
        sandbox_id: The sandbox ID to get metadata for
        x_service_api_key: Service API key header for authentication

    Returns:
        SandboxAutomationMetadataResponse if found, None otherwise

    Raises:
        HTTPException: 401 if service key is invalid
        HTTPException: 404 if metadata not found
    """
    # Validate service API key
    await validate_service_api_key(x_service_api_key)

    from storage.sandbox_automation_metadata_store import SandboxAutomationMetadataStore

    metadata = await SandboxAutomationMetadataStore.get_metadata(sandbox_id)
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'No automation metadata found for sandbox {sandbox_id}',
        )

    return SandboxAutomationMetadataResponse(
        sandbox_id=metadata.sandbox_id,
        automation_id=metadata.automation_id,
        automation_name=metadata.automation_name,
        trigger_type=metadata.trigger_type,
        run_id=metadata.run_id,
        extra_metadata=metadata.extra_metadata,
    )



