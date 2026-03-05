"""Staging router – Health-Status aller Staging-Umgebungen.

Endpoints:
  GET /api/staging          – Alle Repos mit Staging-Status
  GET /api/staging/{repo}   – Detail + Deploy-History für ein Repo
"""

from __future__ import annotations

import logging
import os
import glob
from datetime import datetime, timezone
from typing import Optional

import httpx
import yaml
from fastapi import APIRouter, HTTPException

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/staging", tags=["staging"])

STAGING_CONFIGS_DIR = "/app/fabrik/DevFabrik/knowledge/qa/staging"


def _load_staging_configs() -> list[dict]:
    """Liest alle *.yaml aus dem Staging-Config-Verzeichnis."""
    configs = []
    pattern = os.path.join(STAGING_CONFIGS_DIR, "*.yaml")
    for path in glob.glob(pattern):
        try:
            with open(path) as f:
                cfg = yaml.safe_load(f)
                if cfg:
                    cfg["_config_file"] = os.path.basename(path)
                    configs.append(cfg)
        except Exception as e:
            logger.warning(f"Konnte Staging-Config nicht lesen: {path}: {e}")
    return configs


async def _check_endpoint(url: str, timeout: float = 5.0) -> dict:
    """Prüft einen einzelnen HTTP-Endpoint. Gibt Status + Latenz zurück."""
    start = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
            latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
            return {
                "url": url,
                "status_code": resp.status_code,
                "ok": resp.status_code < 400,
                "latency_ms": latency_ms,
            }
    except httpx.TimeoutException:
        return {"url": url, "status_code": None, "ok": False, "error": "timeout", "latency_ms": None}
    except Exception as e:
        return {"url": url, "status_code": None, "ok": False, "error": str(e), "latency_ms": None}


async def _get_staging_status(cfg: dict) -> dict:
    """Ermittelt den vollständigen Health-Status für eine Staging-Config."""
    repo_name = cfg.get("repo_name") or cfg.get("_config_file", "").replace(".yaml", "")
    base_url = cfg.get("base_url", "")
    tests = cfg.get("tests", [])
    github_repo = cfg.get("github_repo", "")

    results = []
    all_ok = True

    for test in tests:
        path = test.get("path", "/")
        url = base_url.rstrip("/") + path
        check = await _check_endpoint(url)
        check["name"] = test.get("name", path)
        check["stage"] = test.get("stage", "A")
        if not check["ok"]:
            all_ok = False
        results.append(check)

    # Wenn keine Tests konfiguriert, /health als Default
    if not tests and base_url:
        check = await _check_endpoint(base_url.rstrip("/") + "/health")
        check["name"] = "health"
        check["stage"] = "A"
        if not check["ok"]:
            all_ok = False
        results.append(check)

    overall = "healthy" if (all_ok and results) else ("degraded" if any(r["ok"] for r in results) else "down")
    if not results:
        overall = "unknown"

    return {
        "repo": repo_name,
        "github_repo": github_repo,
        "base_url": base_url,
        "port": cfg.get("port"),
        "status": overall,
        "tests": results,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("")
async def get_all_staging():
    """Gibt Health-Status aller konfigurierten Staging-Umgebungen zurück."""
    configs = _load_staging_configs()
    if not configs:
        return {"repos": [], "note": "Keine Staging-Configs gefunden"}

    results = []
    for cfg in configs:
        status = await _get_staging_status(cfg)
        results.append(status)

    healthy = sum(1 for r in results if r["status"] == "healthy")
    return {
        "repos": results,
        "summary": {
            "total": len(results),
            "healthy": healthy,
            "degraded": sum(1 for r in results if r["status"] == "degraded"),
            "down": sum(1 for r in results if r["status"] == "down"),
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{repo_name}")
async def get_staging_detail(repo_name: str):
    """Detail-Status für eine spezifische Staging-Umgebung."""
    configs = _load_staging_configs()
    cfg = next(
        (c for c in configs
         if (c.get("repo_name") or c.get("_config_file", "").replace(".yaml", "")) == repo_name),
        None
    )
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Keine Staging-Config für '{repo_name}'")

    return await _get_staging_status(cfg)
