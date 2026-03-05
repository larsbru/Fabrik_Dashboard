"""API route – proxies Gateway metrics to the Dashboard frontend."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter

from ..config import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gateway", tags=["gateway"])


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if settings.fabrik_gateway_token:
        h["X-Fabrik-Token"] = settings.fabrik_gateway_token
    return h


@router.get("/metrics")
async def get_gateway_metrics():
    """Proxy Gateway /metrics endpoint for the Dashboard."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.fabrik_gateway_url}/metrics", headers=_headers())
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        log.warning("Gateway metrics unavailable: %s", exc)
        return {
            "error": str(exc),
            "github_calls_total": 0,
            "rate_limit_remaining": None,
            "cache_hits": 0,
            "write_queue_size": 0,
            "by_caller": {},
            "db_stats_1h": {},
            "db_stats_24h": {},
        }


@router.get("/health")
async def get_gateway_health():
    """Proxy Gateway /health endpoint."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.fabrik_gateway_url}/health", headers=_headers())
            resp.raise_for_status()
            data = resp.json()
            data["gateway_url"] = settings.fabrik_gateway_url
            data["reachable"] = True
            return data
    except Exception as exc:
        log.warning("Gateway health check failed: %s", exc)
        return {"reachable": False, "gateway_url": settings.fabrik_gateway_url, "error": str(exc)}
