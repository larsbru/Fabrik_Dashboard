"""API routes for alerts and notifications."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# Injected by main.py
alert_service = None


@router.get("")
async def get_alerts(unacknowledged: bool = False):
    """Return all alerts, optionally only unacknowledged ones."""
    return alert_service.get_alerts(unacknowledged_only=unacknowledged)


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    """Mark an alert as acknowledged."""
    success = alert_service.acknowledge_alert(alert_id)
    return {"acknowledged": success}


@router.delete("")
async def clear_alerts():
    """Clear all alerts."""
    alert_service.clear_alerts()
    return {"status": "cleared"}
