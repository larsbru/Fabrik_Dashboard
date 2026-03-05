"""API routes for GitHub integration."""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from ..models.github import GitHubSummary, Issue, PullRequest
from ..services.github_service import GitHubService

router = APIRouter(prefix="/api/github", tags=["github"])

# Injected by main.py
github_service = None

# Per-repo service cache for multi-repo support
_repo_services: dict[str, GitHubService] = {}


def _get_service_for_repo(repo_full: str | None) -> GitHubService:
    """Return a GitHubService scoped to repo_full (owner/name).
    Falls back to the default github_service if repo_full is None."""
    if not repo_full:
        return github_service
    if repo_full not in _repo_services:
        owner, _, name = repo_full.partition("/")
        svc = GitHubService()
        svc.owner = owner
        svc.repo = name
        svc.token = github_service.token
        svc._configured = bool(owner and name and svc.token)
        _repo_services[repo_full] = svc
    return _repo_services[repo_full]


class UATConfirmRequest(BaseModel):
    issue_number: int


@router.get("/summary", response_model=GitHubSummary)
async def get_summary(repo: Optional[str] = None):
    """Return full GitHub pipeline summary. Optional ?repo=owner/name filter."""
    svc = _get_service_for_repo(repo)
    if repo and not svc._last_sync:
        await svc.sync()
    return svc.get_summary()


@router.get("/issues", response_model=list[Issue])
async def get_issues(state: Optional[str] = None, repo: Optional[str] = None):
    """Return issues, optionally filtered by state and repo."""
    svc = _get_service_for_repo(repo)
    if repo and not svc._last_sync:
        await svc.sync()
    return svc.get_issues(state)


@router.get("/pulls", response_model=list[PullRequest])
async def get_pull_requests(state: Optional[str] = None, repo: Optional[str] = None):
    """Return pull requests, optionally filtered by state and repo."""
    svc = _get_service_for_repo(repo)
    if repo and not svc._last_sync:
        await svc.sync()
    return svc.get_pull_requests(state)


@router.get("/status")
async def get_status():
    """Return current GitHub integration status."""
    return github_service.get_status()


@router.post("/sync")
async def trigger_sync():
    """Manually trigger a GitHub sync."""
    await github_service.sync()
    summary = github_service.get_summary()
    status = github_service.get_status()
    return {
        "status": "synced",
        "issues": summary.open_issues,
        "prs": summary.open_prs,
        "error": status.get("error"),
        "configured": status.get("configured"),
    }


@router.post("/uat-confirm")
async def confirm_uat(req: UATConfirmRequest):
    """Confirm UAT for an issue: remove awaiting-uat, close the issue."""
    result = await github_service.confirm_uat(req.issue_number)
    return result
