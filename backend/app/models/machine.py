"""Data models for machines and system metrics."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MachineStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


class CpuMetrics(BaseModel):
    usage_percent: float = 0.0
    cores: int = 0
    load_avg_1m: float = 0.0
    load_avg_5m: float = 0.0
    load_avg_15m: float = 0.0


class MemoryMetrics(BaseModel):
    total_gb: float = 0.0
    used_gb: float = 0.0
    available_gb: float = 0.0
    usage_percent: float = 0.0


class DiskMetrics(BaseModel):
    total_gb: float = 0.0
    used_gb: float = 0.0
    available_gb: float = 0.0
    usage_percent: float = 0.0
    mount_point: str = "/"


class ServiceStatus(BaseModel):
    name: str
    running: bool = False
    pid: Optional[int] = None
    uptime: Optional[str] = None


class AgentInfo(BaseModel):
    name: str
    role: str = "agent"
    status: str = "unknown"
    current_task: Optional[str] = None
    last_activity: Optional[datetime] = None


class Machine(BaseModel):
    ip: str
    name: str = ""
    hostname: Optional[str] = None
    role: str = "agent"
    status: MachineStatus = MachineStatus.UNKNOWN
    ssh_user: str = "fabrik"
    ssh_port: int = 22
    tags: list[str] = Field(default_factory=list)
    description: str = ""
    os_info: str = ""
    uptime: str = ""
    cpu: CpuMetrics = Field(default_factory=CpuMetrics)
    memory: MemoryMetrics = Field(default_factory=MemoryMetrics)
    disks: list[DiskMetrics] = Field(default_factory=list)
    services: list[ServiceStatus] = Field(default_factory=list)
    agents: list[AgentInfo] = Field(default_factory=list)
    last_seen: Optional[datetime] = None
    last_scan: Optional[datetime] = None
    auto_discovered: bool = False


class NetworkSummary(BaseModel):
    total_machines: int = 0
    online: int = 0
    offline: int = 0
    degraded: int = 0
    total_cpu_usage: float = 0.0
    total_memory_usage: float = 0.0
    total_disk_usage: float = 0.0
    active_agents: int = 0
    last_scan: Optional[datetime] = None
