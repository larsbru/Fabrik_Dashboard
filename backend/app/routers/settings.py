"""API routes for application settings management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Injected by main.py
settings_service = None


# ------------------------------------------------------------------
# Request models
# ------------------------------------------------------------------

class NetworkSettingsUpdate(BaseModel):
    network_subnet: str | None = None
    host_ip: str | None = None
    scan_interval: int | None = None


class SSHSettingsUpdate(BaseModel):
    ssh_key_path: str | None = None
    ssh_config_path: str | None = None
    default_ssh_user: str | None = None
    default_ssh_port: int | None = None


class GitHubSettingsUpdate(BaseModel):
    github_token: str | None = None
    github_owner: str | None = None
    github_repo: str | None = None


class MachineUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    ssh_user: str | None = None
    ssh_port: int | None = None
    tags: list[str] | None = None
    description: str | None = None


class SSHKeyUpload(BaseModel):
    key_content: str
    filename: str = "id_rsa"


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("")
async def get_all_settings():
    """Return all settings."""
    return settings_service.get_all_settings()


@router.get("/network")
async def get_network_settings():
    return settings_service.get_network_settings()


@router.put("/network")
async def update_network_settings(data: NetworkSettingsUpdate):
    return settings_service.update_network_settings(data.model_dump(exclude_none=True))


@router.get("/ssh")
async def get_ssh_settings():
    return settings_service.get_ssh_settings()


@router.put("/ssh")
async def update_ssh_settings(data: SSHSettingsUpdate):
    return settings_service.update_ssh_settings(data.model_dump(exclude_none=True))


@router.get("/github")
async def get_github_settings():
    return settings_service.get_github_settings()


@router.put("/github")
async def update_github_settings(data: GitHubSettingsUpdate):
    return settings_service.update_github_settings(data.model_dump(exclude_none=True))


@router.get("/machines")
async def get_machines():
    return settings_service.get_machines()


@router.put("/machines/{ip}")
async def update_machine(ip: str, data: MachineUpdate):
    return settings_service.update_machine(ip, data.model_dump(exclude_none=True))


@router.delete("/machines/{ip}")
async def remove_machine(ip: str):
    machines = settings_service.remove_machine(ip)
    return {"status": "removed", "machines": machines}


@router.post("/ssh/key")
async def upload_ssh_key(data: SSHKeyUpload):
    path = settings_service.save_ssh_key(data.key_content, data.filename)
    return {"status": "saved", "path": path}
