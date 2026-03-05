"""Fabrik Dashboard – Repos Router (B40 Stub).

Liefert die Liste aller konfigurierten Repos aus repos.yaml.
Erweiterung für Repo-Filter in B40.
"""
from __future__ import annotations

import logging
import os

import yaml
from fastapi import APIRouter

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/repos", tags=["repos"])

REPOS_YAML = os.environ.get(
    "REPOS_YAML_PATH",
    "/app/fabrik/DevFabrik/config/repos.yaml"
)


@router.get("/")
async def list_repos():
    """Gibt alle konfigurierten Repos aus repos.yaml zurück."""
    try:
        with open(REPOS_YAML) as f:
            data = yaml.safe_load(f)
        repos = data.get("repos", [])
        return {"repos": repos, "count": len(repos)}
    except FileNotFoundError:
        return {"repos": [], "count": 0, "error": "repos.yaml nicht gefunden"}
    except Exception as e:
        log.error("Fehler beim Laden von repos.yaml: %s", e)
        return {"repos": [], "count": 0, "error": str(e)}
