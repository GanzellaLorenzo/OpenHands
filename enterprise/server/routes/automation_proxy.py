"""Reverse-proxy for the Automations service.

The Automation service authenticates via ``Authorization: Bearer <api_key>``
but the SaaS frontend uses cookie-based auth.  This thin proxy translates
between the two: it validates the user's session, obtains (or creates) a
system API key, and forwards the request to the internal automation service.
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from storage.api_key_store import ApiKeyStore
from storage.user_store import UserStore

from openhands.core.logger import openhands_logger as logger
from openhands.server.user_auth import get_user_id

# Internal URL of the automation service (K8s service name).
# Falls back to empty string which disables the proxy.
AUTOMATION_INTERNAL_URL = os.getenv("AUTOMATION_INTERNAL_URL", "").rstrip("/")

SYSTEM_KEY_NAME = "automation-frontend"

automation_proxy_router = APIRouter(
    prefix="/api/automations",
    tags=["Automations Proxy"],
)

# Shared httpx client – created lazily on first request
_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


async def _get_bearer_token(user_id: str) -> str:
    """Get or create a system API key for the authenticated user."""
    user = await UserStore.get_user_by_id(user_id)
    if not user or not user.current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User or org not found",
        )

    store = ApiKeyStore.get_instance()
    api_key = await store.get_or_create_system_api_key(
        user_id=user_id,
        org_id=user.current_org_id,
        name=SYSTEM_KEY_NAME,
    )
    return api_key


@automation_proxy_router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
)
async def proxy_automation(
    request: Request,
    path: str,
    user_id: str = Depends(get_user_id),
) -> Response:
    """Forward any request to the internal Automation service."""
    if not AUTOMATION_INTERNAL_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Automation service not configured",
        )

    bearer_token = await _get_bearer_token(user_id)

    # Build target URL: AUTOMATION_INTERNAL_URL + /v1/ + path
    target_url = f"{AUTOMATION_INTERNAL_URL}/v1/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": request.headers.get("Content-Type", "application/json"),
    }

    body = await request.body()

    client = _get_client()
    try:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body if body else None,
        )
    except httpx.RequestError as exc:
        logger.error("Automation proxy request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach automation service",
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type"),
    )
