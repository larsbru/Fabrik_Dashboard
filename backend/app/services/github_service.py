"""GitHub integration service for fetching issues, PRs, and repository data."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import httpx

from ..config import settings
from ..models.github import (
    GitHubSummary,
    GitHubUser,
    Issue,
    IssueState,
    Label,
    PipelineStage,
    PRReviewState,
    PRState,
    PullRequest,
)

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"


class GitHubService:
    """Fetches and caches GitHub repository data."""

    def __init__(self):
        self.owner = settings.github_owner
        self.repo = settings.github_repo
        self.token = settings.github_token
        self._issues: list[Issue] = []
        self._pull_requests: list[PullRequest] = []
        self._summary: Optional[GitHubSummary] = None
        self._last_sync: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._configured: bool = bool(self.owner and self.repo and self.token)

    def apply_settings(self, owner: str | None = None, repo: str | None = None, token: str | None = None):
        """Update GitHub settings at runtime and clear cached data."""
        if owner is not None:
            self.owner = owner
        if repo is not None:
            self.repo = repo
        if token is not None:
            self.token = token
        # Clear cached data so next sync fetches fresh
        self._issues = []
        self._pull_requests = []
        self._summary = None
        self._last_sync = None
        self._last_error = None
        self._configured = bool(self.owner and self.repo and self.token)
        logger.info("GitHub settings updated: %s/%s (configured=%s)", self.owner, self.repo, self._configured)

    @property
    def _headers(self) -> dict:
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    @property
    def _repo_url(self) -> str:
        return f"{GITHUB_API}/repos/{self.owner}/{self.repo}"

    async def sync(self):
        """Fetch all issues and PRs from GitHub."""
        if not self.owner or not self.repo:
            self._last_error = "GitHub Owner/Repo nicht konfiguriert"
            self._configured = False
            logger.warning("GitHub owner/repo not configured")
            return

        if not self.token:
            self._last_error = "GitHub Token nicht konfiguriert"
            self._configured = False
            logger.warning("GitHub token not configured")
            return

        self._configured = True
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                issues_task = self._fetch_issues(client)
                prs_task = self._fetch_pull_requests(client)

                import asyncio
                self._issues, self._pull_requests = await asyncio.gather(
                    issues_task, prs_task
                )

            self._last_sync = datetime.utcnow()
            self._last_error = None
            self._build_summary()
            logger.info(
                "GitHub sync complete: %d issues, %d PRs",
                len(self._issues),
                len(self._pull_requests),
            )
        except Exception as e:
            self._last_error = str(e)
            logger.error("GitHub sync error: %s", e)

    async def _fetch_issues(self, client: httpx.AsyncClient) -> list[Issue]:
        """Fetch all open and recently closed issues."""
        issues = []
        for state in ["open", "closed"]:
            page = 1
            while True:
                resp = await client.get(
                    f"{self._repo_url}/issues",
                    headers=self._headers,
                    params={
                        "state": state,
                        "per_page": 100,
                        "page": page,
                        "sort": "updated",
                        "direction": "desc",
                    },
                )
                if resp.status_code != 200:
                    logger.warning("Issues fetch error: %d", resp.status_code)
                    break

                data = resp.json()
                if not data:
                    break

                for item in data:
                    # Skip pull requests (GitHub API returns them in issues)
                    if "pull_request" in item:
                        continue

                    issue = Issue(
                        number=item["number"],
                        title=item["title"],
                        state=IssueState(item["state"]),
                        body=item.get("body"),
                        labels=[
                            Label(
                                name=l["name"],
                                color=l.get("color", "000000"),
                                description=l.get("description", ""),
                            )
                            for l in item.get("labels", [])
                        ],
                        assignees=[
                            GitHubUser(
                                login=a["login"],
                                avatar_url=a.get("avatar_url", ""),
                            )
                            for a in item.get("assignees", [])
                        ],
                        author=GitHubUser(
                            login=item["user"]["login"],
                            avatar_url=item["user"].get("avatar_url", ""),
                        ) if item.get("user") else None,
                        created_at=_parse_dt(item.get("created_at")),
                        updated_at=_parse_dt(item.get("updated_at")),
                        closed_at=_parse_dt(item.get("closed_at")),
                        comments_count=item.get("comments", 0),
                    )
                    issues.append(issue)

                # Limit closed issues to recent ones
                if state == "closed" and page >= 2:
                    break
                page += 1
                if page > 10:
                    break

        return issues

    async def _fetch_pull_requests(
        self, client: httpx.AsyncClient
    ) -> list[PullRequest]:
        """Fetch all open and recently closed/merged PRs."""
        prs = []
        for state in ["open", "closed"]:
            page = 1
            while True:
                resp = await client.get(
                    f"{self._repo_url}/pulls",
                    headers=self._headers,
                    params={
                        "state": state,
                        "per_page": 100,
                        "page": page,
                        "sort": "updated",
                        "direction": "desc",
                    },
                )
                if resp.status_code != 200:
                    logger.warning("PRs fetch error: %d", resp.status_code)
                    break

                data = resp.json()
                if not data:
                    break

                for item in data:
                    pr_state = PRState.OPEN
                    if item.get("merged_at"):
                        pr_state = PRState.MERGED
                    elif item["state"] == "closed":
                        pr_state = PRState.CLOSED

                    review_state = PRReviewState.PENDING
                    if item.get("draft"):
                        review_state = PRReviewState.PENDING

                    pr = PullRequest(
                        number=item["number"],
                        title=item["title"],
                        state=pr_state,
                        body=item.get("body"),
                        labels=[
                            Label(
                                name=l["name"],
                                color=l.get("color", "000000"),
                            )
                            for l in item.get("labels", [])
                        ],
                        author=GitHubUser(
                            login=item["user"]["login"],
                            avatar_url=item["user"].get("avatar_url", ""),
                        ) if item.get("user") else None,
                        assignees=[
                            GitHubUser(
                                login=a["login"],
                                avatar_url=a.get("avatar_url", ""),
                            )
                            for a in item.get("assignees", [])
                        ],
                        head_branch=item.get("head", {}).get("ref", ""),
                        base_branch=item.get("base", {}).get("ref", "main"),
                        created_at=_parse_dt(item.get("created_at")),
                        updated_at=_parse_dt(item.get("updated_at")),
                        merged_at=_parse_dt(item.get("merged_at")),
                        closed_at=_parse_dt(item.get("closed_at")),
                        review_state=review_state,
                        additions=item.get("additions", 0),
                        deletions=item.get("deletions", 0),
                        changed_files=item.get("changed_files", 0),
                        comments_count=item.get("comments", 0),
                    )
                    prs.append(pr)

                if state == "closed" and page >= 2:
                    break
                page += 1
                if page > 10:
                    break

        return prs

    # Pipeline label definitions (order matters for stage columns)
    PIPELINE_LABELS = [
        "agent:ready",
        "agent:running",
        "needs:qa",
        "ready-for-qa",
        "agent:qa",
        "awaiting-uat",
    ]

    def _parse_assigned_machine(self, labels: list) -> str | None:
        """Extract machine name from assigned:* labels."""
        for label in labels:
            if label.name.lower().startswith("assigned:"):
                return label.name.split(":", 1)[1].strip()
        return None

    def _build_summary(self):
        """Build pipeline summary from current data using label-based stages."""
        open_issues = [i for i in self._issues if i.state == IssueState.OPEN]
        closed_issues = [i for i in self._issues if i.state == IssueState.CLOSED]
        open_prs = [p for p in self._pull_requests if p.state == PRState.OPEN]
        merged_prs = [p for p in self._pull_requests if p.state == PRState.MERGED]

        # Create a stage for each pipeline label
        stages: dict[str, PipelineStage] = {}
        for label_name in self.PIPELINE_LABELS:
            stages[label_name] = PipelineStage(name=label_name)

        # Classify issues into stages by label
        for issue in self._issues:
            label_names = [l.name.lower() for l in issue.labels]
            # Parse assigned machine
            issue.assigned_machine = self._parse_assigned_machine(issue.labels)
            placed = False
            for pipeline_label in self.PIPELINE_LABELS:
                if pipeline_label in label_names:
                    stages[pipeline_label].issues.append(issue)
                    placed = True
                    break
            # Items with no pipeline label are not shown (untracked)

        # Classify PRs into stages by label
        for pr in self._pull_requests:
            label_names = [l.name.lower() for l in pr.labels]
            pr.assigned_machine = self._parse_assigned_machine(pr.labels)
            for pipeline_label in self.PIPELINE_LABELS:
                if pipeline_label in label_names:
                    stages[pipeline_label].pull_requests.append(pr)
                    break

        pipeline = [stages[l] for l in self.PIPELINE_LABELS]

        self._summary = GitHubSummary(
            repo_name=f"{self.owner}/{self.repo}",
            repo_url=f"https://github.com/{self.owner}/{self.repo}",
            open_issues=len(open_issues),
            closed_issues=len(closed_issues),
            open_prs=len(open_prs),
            merged_prs=len(merged_prs),
            pipeline=pipeline,
            last_sync=self._last_sync,
        )

    def get_issues(self, state: Optional[str] = None) -> list[Issue]:
        if state:
            return [i for i in self._issues if i.state.value == state]
        return self._issues

    def get_pull_requests(self, state: Optional[str] = None) -> list[PullRequest]:
        if state:
            return [p for p in self._pull_requests if p.state.value == state]
        return self._pull_requests

    def get_status(self) -> dict:
        """Return current GitHub integration status."""
        return {
            "configured": self._configured,
            "error": self._last_error,
            "last_sync": self._last_sync.isoformat() if self._last_sync else None,
            "owner": self.owner,
            "repo": self.repo,
            "has_token": bool(self.token),
        }

    def get_summary(self) -> GitHubSummary:
        if not self._summary:
            self._build_summary()
        summary = self._summary or GitHubSummary()
        summary.error = self._last_error
        summary.configured = self._configured
        return summary


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
