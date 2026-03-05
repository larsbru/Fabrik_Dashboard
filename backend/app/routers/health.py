"""Health router – Fabrik-interne Gesundheit (Agents, Ollama, Gateway).

Endpoints:
  GET /api/health/agents   – Heartbeats aller Agents (via Gateway-Logs)
  GET /api/health/ollama   – Ollama-Status + geladenes Modell
  GET /api/health/gateway  – Gateway-Kurzstatus (delegiert an gateway-router)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/health", tags=["health"])

OLLAMA_URL = "http://192.168.44.10:11434"
GATEWAY_URL = "http://192.168.44.70:8080"
GATEWAY_TOKEN = settings.fabrik_gateway_token if hasattr(settings, "fabrik_gateway_token") else ""

# Agent-Definitionen: Name → erwartete Gateway-Aktivität (Sekunden bis SLOW)
AGENTS = [
    {"id": "agent0",          "label": "Agent0",          "slow_after_s": 120,  "dead_after_s": 300},
    {"id": "dispatcher-01",   "label": "Dispatcher",       "slow_after_s": 90,   "dead_after_s": 180},
    {"id": "dev-agent-01",    "label": "Dev-Agent",        "slow_after_s": 120,  "dead_after_s": 300},
    {"id": "qa-agent-01",     "label": "QA-Agent",         "slow_after_s": 120,  "dead_after_s": 300},
    {"id": "staging-monitor", "label": "Staging-Monitor",  "slow_after_s": 1200, "dead_after_s": 2400},
]


async def _fetch_gateway_metrics() -> dict | None:
    """Holt Metriken vom Gateway (Request-Zähler pro Agent-Quelle)."""
    try:
        headers = {"X-Fabrik-Token": GATEWAY_TOKEN} if GATEWAY_TOKEN else {}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{GATEWAY_URL}/metrics", headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Gateway metrics nicht erreichbar: {e}")
    return None


async def _fetch_gateway_history() -> list[dict]:
    """Holt kurze History vom Gateway für Heartbeat-Ableitung."""
    try:
        headers = {"X-Fabrik-Token": GATEWAY_TOKEN} if GATEWAY_TOKEN else {}
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{GATEWAY_URL}/history?hours=1&limit=100",
                headers=headers
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Gateway history nicht erreichbar: {e}")
    return []


def _agent_status(last_seen_s: float | None, slow_after_s: int, dead_after_s: int) -> str:
    if last_seen_s is None:
        return "unknown"
    if last_seen_s <= slow_after_s:
        return "ok"
    if last_seen_s <= dead_after_s:
        return "slow"
    return "dead"


@router.get("/agents")
async def get_agent_heartbeats():
    """Gibt Heartbeat-Status aller Agents zurück.
    
    Heartbeat = letzter Zeitpunkt, an dem der Agent eine Anfrage via Gateway gesendet hat.
    Abgeleitet aus Gateway-History (letzter Eintrag pro Agent-ID in X-Agent-Header).
    """
    now = datetime.now(timezone.utc)
    history = await _fetch_gateway_history()

    # Letzter Eintrag pro Agent-ID aus History ableiten
    last_seen: dict[str, datetime] = {}
    for entry in history:
        agent_id = entry.get("agent_id") or entry.get("source")
        ts_str = entry.get("timestamp") or entry.get("ts")
        if agent_id and ts_str:
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                if agent_id not in last_seen or ts > last_seen[agent_id]:
                    last_seen[agent_id] = ts
            except Exception:
                pass

    results = []
    for agent in AGENTS:
        aid = agent["id"]
        last_ts = last_seen.get(aid)
        if last_ts:
            age_s = (now - last_ts).total_seconds()
            last_seen_str = last_ts.isoformat()
            age_human = _seconds_to_human(int(age_s))
        else:
            age_s = None
            last_seen_str = None
            age_human = "unbekannt"

        status = _agent_status(age_s, agent["slow_after_s"], agent["dead_after_s"])
        results.append({
            "id": aid,
            "label": agent["label"],
            "status": status,
            "last_seen": last_seen_str,
            "last_seen_ago": age_human,
            "last_seen_ago_s": age_s,
        })

    ok_count = sum(1 for r in results if r["status"] == "ok")
    return {
        "agents": results,
        "summary": {
            "total": len(results),
            "ok": ok_count,
            "slow": sum(1 for r in results if r["status"] == "slow"),
            "dead": sum(1 for r in results if r["status"] == "dead"),
            "unknown": sum(1 for r in results if r["status"] == "unknown"),
        },
        "checked_at": now.isoformat(),
    }


@router.get("/ollama")
async def get_ollama_status():
    """Gibt Ollama-Status + geladene Modelle zurück."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Ollama-Versionsprüfung
            ver_resp = await client.get(f"{OLLAMA_URL}/api/version")
            version = ver_resp.json().get("version", "unknown") if ver_resp.status_code == 200 else None

            # Geladene Modelle
            tags_resp = await client.get(f"{OLLAMA_URL}/api/tags")
            models = []
            if tags_resp.status_code == 200:
                for m in tags_resp.json().get("models", []):
                    models.append({
                        "name": m.get("name"),
                        "size_gb": round(m.get("size", 0) / 1e9, 1),
                        "modified_at": m.get("modified_at"),
                    })

            return {
                "reachable": True,
                "url": OLLAMA_URL,
                "version": version,
                "models": models,
                "model_count": len(models),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        return {
            "reachable": False,
            "url": OLLAMA_URL,
            "error": str(e),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


def _seconds_to_human(seconds: int) -> str:
    if seconds < 60:
        return f"vor {seconds}s"
    if seconds < 3600:
        return f"vor {seconds // 60}min {seconds % 60}s"
    hours = seconds // 3600
    mins = (seconds % 3600) // 60
    return f"vor {hours}h {mins}min"
