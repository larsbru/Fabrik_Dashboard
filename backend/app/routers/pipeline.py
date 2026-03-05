"""Pipeline router – Kanban-Board + CEO-Aktionen.

Endpoints:
  GET  /api/pipeline          – Issues nach Kanban-Stage gruppiert
  GET  /api/pipeline/{nr}/timeline – Label-Verlauf (via Issue-Comments)
  POST /api/pipeline/{nr}/reset-blocked  – blocked → agent:ready
  POST /api/pipeline/{nr}/confirm-uat    – awaiting-uat → closed
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

from ..config import settings
from ..services.github_service import GitHubService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

# Injected by main.py
github_service: GitHubService | None = None

GITHUB_API = "https://api.github.com"

# Kanban-Spalten: SSOT-Label → Anzeigename + Farbe
KANBAN_STAGES = [
    {"label": None,                      "name": "BACKLOG",  "color": "#6b7280"},
    {"label": "agent:ready",             "name": "BEREIT",   "color": "#3b82f6"},
    {"label": "assigned:agent0",         "name": "PLANUNG",  "color": "#8b5cf6"},
    {"label": "assigned:dispatcher-01",  "name": "DISPATCH", "color": "#a78bfa"},
    {"label": "status:coding",           "name": "CODING",   "color": "#f59e0b"},
    {"label": "assigned:dev-agent-01",   "name": "CODING",   "color": "#f59e0b"},
    {"label": "ready-for-qa",            "name": "QA",       "color": "#06b6d4"},
    {"label": "assigned:qa-agent-01",    "name": "QA",       "color": "#06b6d4"},
    {"label": "status:ci-running",       "name": "CI",       "color": "#0ea5e9"},
    {"label": "checks:passed",           "name": "CI ✅",    "color": "#10b981"},
    {"label": "merged",                  "name": "DEPLOY",   "color": "#14b8a6"},
    {"label": "deployed-staging",        "name": "STAGING",  "color": "#22c55e"},
    {"label": "awaiting-uat",            "name": "UAT",      "color": "#84cc16"},
    {"label": "blocked",                 "name": "BLOCKED",  "color": "#ef4444"},
    {"label": "status:failed-ci",        "name": "FEHLER",   "color": "#f97316"},
    {"label": "status:failed-qa",        "name": "FEHLER",   "color": "#f97316"},
    {"label": "status:failed-merge",     "name": "FEHLER",   "color": "#f97316"},
    {"label": "status:failed-deploy",    "name": "FEHLER",   "color": "#f97316"},
]

# Prioritäts-Reihenfolge: welches Label bestimmt die Stage
STAGE_PRIORITY = [
    "blocked",
    "awaiting-uat",
    "deployed-staging",
    "merged",
    "checks:passed",
    "status:ci-running",
    "ready-for-qa",
    "assigned:qa-agent-01",
    "status:coding",
    "assigned:dev-agent-01",
    "assigned:dispatcher-01",
    "assigned:agent0",
    "agent:ready",
    "status:failed-ci",
    "status:failed-qa",
    "status:failed-merge",
    "status:failed-deploy",
]


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _repo_url(owner: str, repo: str) -> str:
    return f"{GITHUB_API}/repos/{owner}/{repo}"


def _classify_stage(label_names: list[str]) -> dict:
    """Determine Kanban stage from issue labels."""
    for priority_label in STAGE_PRIORITY:
        if priority_label in label_names:
            for stage in KANBAN_STAGES:
                if stage["label"] == priority_label:
                    return stage
    return {"label": None, "name": "BACKLOG", "color": "#6b7280"}


def _extract_retry(label_names: list[str]) -> int:
    for label in label_names:
        if label.startswith("retry:"):
            try:
                return int(label.split(":")[1])
            except (ValueError, IndexError):
                pass
    return 0


def _time_ago(dt_str: str | None) -> str | None:
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = now - dt
        secs = int(delta.total_seconds())
        if secs < 60:
            return f"{secs}s"
        elif secs < 3600:
            return f"{secs // 60}min"
        elif secs < 86400:
            return f"{secs // 3600}h"
        else:
            return f"{secs // 86400}d"
    except Exception:
        return None


def _format_issue(issue: dict, owner: str, repo: str) -> dict:
    label_names = [l["name"] for l in issue.get("labels", [])]
    stage = _classify_stage(label_names)
    retry = _extract_retry(label_names)
    updated_at = issue.get("updated_at")
    is_new = False
    if updated_at:
        try:
            dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            delta = datetime.now(timezone.utc) - dt
            is_new = delta.total_seconds() < 7200  # letzte 2h
        except Exception:
            pass

    return {
        "number": issue["number"],
        "title": issue["title"],
        "state": issue.get("state", "open"),
        "stage": stage["name"],
        "stage_color": stage["color"],
        "stage_label": stage["label"],
        "labels": label_names,
        "retry": retry,
        "is_new": is_new,
        "time_ago": _time_ago(updated_at),
        "updated_at": updated_at,
        "created_at": issue.get("created_at"),
        "html_url": issue.get("html_url"),
        "repo": f"{owner}/{repo}",
    }


@router.get("")
async def get_pipeline(repo: Optional[str] = None):
    """Return all open issues grouped by Kanban stage."""
    svc = github_service
    if not svc or not svc._configured:
        raise HTTPException(status_code=503, detail="GitHub nicht konfiguriert")

    # Bestimme Owner/Repo
    if repo and "/" in repo:
        owner, _, repo_name = repo.partition("/")
    else:
        owner = svc.owner
        repo_name = svc.repo

    token = svc.token
    url = f"{GITHUB_API}/repos/{owner}/{repo_name}/issues"

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            url,
            headers=_headers(token),
            params={"state": "open", "per_page": 100, "sort": "updated", "direction": "desc"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"GitHub API: {resp.text[:200]}")

        raw_issues = [i for i in resp.json() if "pull_request" not in i]

    issues = [_format_issue(i, owner, repo_name) for i in raw_issues]

    # Gruppiere nach Stage
    stages: dict[str, list] = {}
    for issue in issues:
        stage_name = issue["stage"]
        if stage_name not in stages:
            stages[stage_name] = []
        stages[stage_name].append(issue)

    # Reihenfolge der Stages für Frontend
    stage_order = ["BEREIT", "PLANUNG", "DISPATCH", "CODING", "QA", "CI", "CI ✅",
                   "DEPLOY", "STAGING", "UAT", "BLOCKED", "FEHLER", "BACKLOG"]

    ordered = []
    for name in stage_order:
        if name in stages:
            ordered.append({
                "stage": name,
                "color": next((s["color"] for s in KANBAN_STAGES if s["name"] == name), "#6b7280"),
                "issues": sorted(stages[name], key=lambda x: x.get("updated_at", ""), reverse=True),
            })

    return {
        "total": len(issues),
        "repo": f"{owner}/{repo_name}",
        "stages": ordered,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/{issue_number}/detail")
async def get_issue_detail(issue_number: int, repo: Optional[str] = None):
    """Return full issue details including body, labels, PR-link."""
    svc = github_service
    if not svc or not svc._configured:
        raise HTTPException(status_code=503, detail="GitHub nicht konfiguriert")

    owner = svc.owner
    repo_name = svc.repo
    if repo and "/" in repo:
        owner, _, repo_name = repo.partition("/")

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo_name}/issues/{issue_number}",
            headers=_headers(svc.token),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code)

        issue = resp.json()
        label_names = [l["name"] for l in issue.get("labels", [])]

        # Suche zugehörigen PR
        pr_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo_name}/pulls",
            headers=_headers(svc.token),
            params={"state": "open", "per_page": 20},
        )
        pr_url = None
        if pr_resp.status_code == 200:
            for pr in pr_resp.json():
                if f"#{issue_number}" in (pr.get("title") or "") or \
                   f"#{issue_number}" in (pr.get("body") or ""):
                    pr_url = pr.get("html_url")
                    break

    return {
        **_format_issue(issue, owner, repo_name),
        "body": issue.get("body", ""),
        "pr_url": pr_url,
        "comments_count": issue.get("comments", 0),
    }


@router.post("/{issue_number}/reset-blocked")
async def reset_blocked(issue_number: int, repo: Optional[str] = None):
    """CEO-Aktion: blocked resetten → agent:ready.
    Entfernt: blocked, blocked:*, retry:*, status:failed-*, assigned:*.
    Setzt: agent:ready
    """
    svc = github_service
    if not svc or not svc._configured:
        raise HTTPException(status_code=503, detail="GitHub nicht konfiguriert")

    owner = svc.owner
    repo_name = svc.repo
    if repo and "/" in repo:
        owner, _, repo_name = repo.partition("/")

    base = f"{GITHUB_API}/repos/{owner}/{repo_name}"

    async with httpx.AsyncClient(timeout=20) as client:
        # Aktuelle Labels holen
        resp = await client.get(
            f"{base}/issues/{issue_number}",
            headers=_headers(svc.token),
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code)

        current_labels = [l["name"] for l in resp.json().get("labels", [])]

        # Labels zum Entfernen
        remove_prefixes = ("blocked", "retry:", "status:failed-", "assigned:", "status:coding",
                           "status:planning", "status:dispatching", "status:reviewing")
        to_remove = [l for l in current_labels
                     if any(l.startswith(p) for p in remove_prefixes)]

        for label in to_remove:
            await client.delete(
                f"{base}/issues/{issue_number}/labels/{label}",
                headers=_headers(svc.token),
            )

        # agent:ready setzen
        await client.post(
            f"{base}/issues/{issue_number}/labels",
            headers=_headers(svc.token),
            json={"labels": ["agent:ready"]},
        )

        logger.info("CEO reset-blocked: Issue #%d (%s/%s), entfernt: %s",
                    issue_number, owner, repo_name, to_remove)

    # Cache invalidieren
    await svc.sync()

    return {
        "status": "reset",
        "issue_number": issue_number,
        "removed_labels": to_remove,
        "added_labels": ["agent:ready"],
    }


@router.post("/{issue_number}/confirm-uat")
async def confirm_uat(issue_number: int, repo: Optional[str] = None):
    """CEO-Aktion: UAT bestätigen → Issue schließen."""
    svc = github_service
    if not svc or not svc._configured:
        raise HTTPException(status_code=503, detail="GitHub nicht konfiguriert")

    owner = svc.owner
    repo_name = svc.repo
    if repo and "/" in repo:
        owner, _, repo_name = repo.partition("/")

    base = f"{GITHUB_API}/repos/{owner}/{repo_name}"

    async with httpx.AsyncClient(timeout=20) as client:
        # awaiting-uat entfernen
        await client.delete(
            f"{base}/issues/{issue_number}/labels/awaiting-uat",
            headers=_headers(svc.token),
        )
        # Issue schließen
        resp = await client.patch(
            f"{base}/issues/{issue_number}",
            headers=_headers(svc.token),
            json={"state": "closed", "state_reason": "completed"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code,
                                detail=f"Schließen fehlgeschlagen: {resp.status_code}")

    logger.info("CEO confirm-uat: Issue #%d (%s/%s) geschlossen", issue_number, owner, repo_name)
    await svc.sync()

    return {"status": "confirmed", "issue_number": issue_number, "repo": f"{owner}/{repo_name}"}
