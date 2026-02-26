"""API routes for GitHub integration."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from ..models.github import GitHubSummary, Issue, PullRequest

router = APIRouter(prefix="/api/github", tags=["github"])

# Injected by main.py
github_service = None


@router.get("/summary", response_model=GitHubSummary)
async def get_summary():
    """Return full GitHub pipeline summary."""
    return github_service.get_summary()


@router.get("/issues", response_model=list[Issue])
async def get_issues(state: Optional[str] = None):
    """Return issues, optionally filtered by state."""
    return github_service.get_issues(state)


@router.get("/pulls", response_model=list[PullRequest])
async def get_pull_requests(state: Optional[str] = None):
    """Return pull requests, optionally filtered by state."""
    return github_service.get_pull_requests(state)


@router.post("/sync")
async def trigger_sync():
    """Manually trigger a GitHub sync."""
    await github_service.sync()
    summary = github_service.get_summary()
    return {
        "status": "synced",
        "issues": summary.open_issues,
        "prs": summary.open_prs,
    }
