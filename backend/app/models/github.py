"""Data models for GitHub issues and pull requests."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class IssueState(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class PRState(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    MERGED = "merged"


class PRReviewState(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    COMMENTED = "commented"


class Label(BaseModel):
    name: str
    color: str = "000000"
    description: str = ""


class GitHubUser(BaseModel):
    login: str
    avatar_url: str = ""


class Issue(BaseModel):
    number: int
    title: str
    state: IssueState
    body: Optional[str] = None
    labels: list[Label] = Field(default_factory=list)
    assignees: list[GitHubUser] = Field(default_factory=list)
    author: Optional[GitHubUser] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    comments_count: int = 0
    linked_pr: Optional[int] = None
    assigned_machine: Optional[str] = None


class PullRequest(BaseModel):
    number: int
    title: str
    state: PRState
    body: Optional[str] = None
    labels: list[Label] = Field(default_factory=list)
    author: Optional[GitHubUser] = None
    assignees: list[GitHubUser] = Field(default_factory=list)
    head_branch: str = ""
    base_branch: str = "main"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    merged_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    review_state: PRReviewState = PRReviewState.PENDING
    checks_passed: Optional[bool] = None
    mergeable: Optional[bool] = None
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    comments_count: int = 0
    linked_issue: Optional[int] = None
    assigned_machine: Optional[str] = None


class PipelineStage(BaseModel):
    name: str
    issues: list[Issue] = Field(default_factory=list)
    pull_requests: list[PullRequest] = Field(default_factory=list)


class GitHubSummary(BaseModel):
    repo_name: str = ""
    repo_url: str = ""
    open_issues: int = 0
    closed_issues: int = 0
    open_prs: int = 0
    merged_prs: int = 0
    pipeline: list[PipelineStage] = Field(default_factory=list)
    recent_activity: list[dict] = Field(default_factory=list)
    last_sync: Optional[datetime] = None
    error: Optional[str] = None
    configured: bool = True
