"""API routes for application settings management."""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])
logger = logging.getLogger(__name__)

# Injected by main.py
settings_service = None
scanner = None
github_service = None
ssh_manager = None
scheduler = None


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
    result = settings_service.update_network_settings(data.model_dump(exclude_none=True))
    # Apply to running services
    if scanner:
        scanner.apply_settings(subnet=data.network_subnet)
    if scheduler and data.scan_interval:
        scheduler.update_scan_interval(data.scan_interval)
    logger.info("Network settings applied at runtime")
    return result


@router.get("/ssh")
async def get_ssh_settings():
    return settings_service.get_ssh_settings()


@router.put("/ssh")
async def update_ssh_settings(data: SSHSettingsUpdate):
    result = settings_service.update_ssh_settings(data.model_dump(exclude_none=True))
    # Apply to running services
    if ssh_manager and data.ssh_key_path:
        ssh_manager.apply_settings(key_path=data.ssh_key_path)
    logger.info("SSH settings applied at runtime")
    return result


@router.get("/github")
async def get_github_settings():
    return settings_service.get_github_settings()


@router.put("/github")
async def update_github_settings(data: GitHubSettingsUpdate):
    result = settings_service.update_github_settings(data.model_dump(exclude_none=True))
    # Apply to running services using actual stored values (not masked)
    if github_service:
        real = settings_service.get_github_settings_raw()
        github_service.apply_settings(
            owner=real.get("github_owner"),
            repo=real.get("github_repo"),
            token=real.get("github_token"),
        )
        await github_service.sync()
    logger.info("GitHub settings applied at runtime")
    return result


@router.get("/machines")
async def get_machines():
    return settings_service.get_machines()


@router.put("/machines/{ip}")
async def update_machine(ip: str, data: MachineUpdate):
    result = settings_service.update_machine(ip, data.model_dump(exclude_none=True))
    # Reload machine config in scanner
    if scanner:
        scanner.apply_settings()
    return result


@router.delete("/machines/{ip}")
async def remove_machine(ip: str):
    machines = settings_service.remove_machine(ip)
    # Reload machine config in scanner
    if scanner:
        scanner.apply_settings()
    return {"status": "removed", "machines": machines}


@router.post("/ssh/key")
async def upload_ssh_key(data: SSHKeyUpload):
    path = settings_service.save_ssh_key(data.key_content, data.filename)
    # Apply new key to SSH manager
    if ssh_manager:
        ssh_manager.apply_settings(key_path=path)
    return {"status": "saved", "path": path}


@router.post("/apply")
async def apply_all_settings():
    """Manually trigger a full settings reload across all services."""
    all_settings = settings_service.get_all_settings()

    if scanner:
        scanner.apply_settings(subnet=all_settings["network"].get("network_subnet"))
    if scheduler:
        scheduler.update_scan_interval(all_settings["network"].get("scan_interval", 60))
    if ssh_manager:
        ssh_manager.apply_settings(key_path=all_settings["ssh"].get("ssh_key_path"))
    if github_service:
        gh = settings_service.get_github_settings_raw()
        github_service.apply_settings(
            owner=gh.get("github_owner"),
            repo=gh.get("github_repo"),
            token=gh.get("github_token"),
        )
        await github_service.sync()

    logger.info("All settings applied at runtime")
    return {"status": "applied"}
