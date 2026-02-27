"""SSH manager for connecting to machines and collecting system metrics."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

import paramiko

from ..config import settings
from ..models.machine import (
    AgentInfo,
    CpuMetrics,
    DiskMetrics,
    Machine,
    MachineStatus,
    MemoryMetrics,
    ServiceStatus,
)

logger = logging.getLogger(__name__)


class SSHManager:
    """Manages SSH connections and remote command execution."""

    def __init__(self):
        self._key_path = settings.ssh_key_path
        self._connections: dict[str, paramiko.SSHClient] = {}

    def apply_settings(self, key_path: str | None = None):
        """Update SSH settings at runtime."""
        if key_path:
            self._key_path = key_path
            logger.info("SSH key path updated to %s", key_path)
        # Close existing connections so they reconnect with new settings
        self.close_all()

    def _get_client(self, machine: Machine) -> Optional[paramiko.SSHClient]:
        """Create or reuse an SSH connection to a machine."""
        try:
            if machine.ip in self._connections:
                client = self._connections[machine.ip]
                # Test if connection is still alive
                transport = client.get_transport()
                if transport and transport.is_active():
                    return client
                else:
                    client.close()
                    del self._connections[machine.ip]

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            try:
                pkey = paramiko.RSAKey.from_private_key_file(self._key_path)
            except Exception:
                pkey = None

            client.connect(
                hostname=machine.ip,
                port=machine.ssh_port,
                username=machine.ssh_user,
                pkey=pkey,
                timeout=10,
                banner_timeout=10,
                auth_timeout=10,
                allow_agent=True,
                look_for_keys=True if pkey is None else False,
            )
            self._connections[machine.ip] = client
            return client
        except Exception as e:
            logger.warning("SSH connection to %s failed: %s", machine.ip, e)
            return None

    def _exec(self, client: paramiko.SSHClient, command: str) -> str:
        """Execute a command and return stdout."""
        try:
            _, stdout, stderr = client.exec_command(command, timeout=15)
            return stdout.read().decode("utf-8", errors="replace").strip()
        except Exception as e:
            logger.debug("Command failed on remote: %s", e)
            return ""

    async def collect_metrics(self, machine: Machine) -> Machine:
        """Collect full system metrics from a machine via SSH."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._collect_sync, machine)

    def _collect_sync(self, machine: Machine) -> Machine:
        """Synchronous metric collection."""
        client = self._get_client(machine)
        if not client:
            # SSH unavailable — preserve ping-based ONLINE status.
            # Only mark OFFLINE if the machine wasn't pingable either.
            if machine.status == MachineStatus.UNKNOWN:
                machine.status = MachineStatus.OFFLINE
            machine.last_scan = datetime.utcnow()
            return machine

        machine.status = MachineStatus.ONLINE
        machine.last_scan = datetime.utcnow()
        machine.last_seen = datetime.utcnow()

        # Hostname
        machine.hostname = self._exec(client, "hostname") or machine.ip

        # OS info
        machine.os_info = self._exec(
            client, "uname -s -r 2>/dev/null || cat /etc/os-release 2>/dev/null | head -1"
        )

        # Uptime
        machine.uptime = self._exec(client, "uptime -p 2>/dev/null || uptime")

        # CPU
        machine.cpu = self._collect_cpu(client)

        # Memory
        machine.memory = self._collect_memory(client)

        # Disk
        machine.disks = self._collect_disks(client)

        # Services
        machine.services = self._collect_services(client, machine)

        # Agents
        machine.agents = self._collect_agents(client)

        # Determine degraded status
        if machine.cpu.usage_percent > 90 or machine.memory.usage_percent > 90:
            machine.status = MachineStatus.DEGRADED
        for disk in machine.disks:
            if disk.usage_percent > 95:
                machine.status = MachineStatus.DEGRADED

        return machine

    def _collect_cpu(self, client: paramiko.SSHClient) -> CpuMetrics:
        metrics = CpuMetrics()
        try:
            # Number of cores
            cores_str = self._exec(client, "nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null")
            metrics.cores = int(cores_str) if cores_str.isdigit() else 1

            # Load averages
            loadavg = self._exec(client, "cat /proc/loadavg 2>/dev/null || sysctl -n vm.loadavg 2>/dev/null")
            if loadavg:
                parts = loadavg.replace("{", "").replace("}", "").split()
                if len(parts) >= 3:
                    metrics.load_avg_1m = float(parts[0])
                    metrics.load_avg_5m = float(parts[1])
                    metrics.load_avg_15m = float(parts[2])
                    metrics.usage_percent = round(
                        (metrics.load_avg_1m / max(metrics.cores, 1)) * 100, 1
                    )

            # More accurate CPU via top snapshot
            cpu_line = self._exec(
                client,
                "top -bn1 2>/dev/null | grep 'Cpu(s)' | head -1"
            )
            if cpu_line and "id" in cpu_line:
                # Extract idle percentage
                for part in cpu_line.split(","):
                    if "id" in part:
                        idle = float(part.strip().split()[0])
                        metrics.usage_percent = round(100.0 - idle, 1)
                        break
        except Exception as e:
            logger.debug("CPU metrics error: %s", e)
        return metrics

    def _collect_memory(self, client: paramiko.SSHClient) -> MemoryMetrics:
        metrics = MemoryMetrics()
        try:
            # Try Linux free command
            mem_info = self._exec(client, "free -b 2>/dev/null")
            if mem_info:
                for line in mem_info.split("\n"):
                    if line.startswith("Mem:"):
                        parts = line.split()
                        if len(parts) >= 4:
                            total = int(parts[1])
                            used = int(parts[2])
                            available = int(parts[6]) if len(parts) >= 7 else total - used
                            metrics.total_gb = round(total / (1024**3), 2)
                            metrics.used_gb = round(used / (1024**3), 2)
                            metrics.available_gb = round(available / (1024**3), 2)
                            metrics.usage_percent = round(
                                (used / total) * 100, 1
                            ) if total > 0 else 0.0
                        break
            else:
                # macOS fallback
                page_size = self._exec(client, "sysctl -n hw.pagesize 2>/dev/null")
                total_mem = self._exec(client, "sysctl -n hw.memsize 2>/dev/null")
                if total_mem:
                    total = int(total_mem)
                    metrics.total_gb = round(total / (1024**3), 2)
                    # Rough estimate from vm_stat
                    vm_stat = self._exec(client, "vm_stat 2>/dev/null")
                    if vm_stat and page_size:
                        ps = int(page_size)
                        free_pages = 0
                        for line in vm_stat.split("\n"):
                            if "Pages free" in line:
                                free_pages = int(line.split(":")[1].strip().rstrip("."))
                        free_bytes = free_pages * ps
                        metrics.available_gb = round(free_bytes / (1024**3), 2)
                        metrics.used_gb = round(metrics.total_gb - metrics.available_gb, 2)
                        metrics.usage_percent = round(
                            (metrics.used_gb / metrics.total_gb) * 100, 1
                        ) if metrics.total_gb > 0 else 0.0
        except Exception as e:
            logger.debug("Memory metrics error: %s", e)
        return metrics

    def _collect_disks(self, client: paramiko.SSHClient) -> list[DiskMetrics]:
        disks = []
        try:
            df_output = self._exec(
                client, "df -B1 / 2>/dev/null || df -k / 2>/dev/null"
            )
            if df_output:
                lines = df_output.strip().split("\n")
                for line in lines[1:]:  # Skip header
                    parts = line.split()
                    if len(parts) >= 6:
                        # Detect if bytes or KB
                        try:
                            total = int(parts[1])
                            used = int(parts[2])
                            avail = int(parts[3])
                        except ValueError:
                            continue
                        # If values are small, they're probably in KB
                        divisor = 1024**3
                        if total < 1_000_000:
                            # KB values
                            divisor = 1024**2
                        mount = parts[5] if len(parts) >= 6 else "/"
                        disk = DiskMetrics(
                            total_gb=round(total / divisor, 2),
                            used_gb=round(used / divisor, 2),
                            available_gb=round(avail / divisor, 2),
                            usage_percent=round(
                                (used / total) * 100, 1
                            ) if total > 0 else 0.0,
                            mount_point=mount,
                        )
                        disks.append(disk)
        except Exception as e:
            logger.debug("Disk metrics error: %s", e)

        return disks if disks else [DiskMetrics()]

    def _collect_services(
        self, client: paramiko.SSHClient, machine: Machine
    ) -> list[ServiceStatus]:
        """Check status of expected services on this machine."""
        services = []
        # Check Docker
        docker_status = self._exec(
            client, "systemctl is-active docker 2>/dev/null || pgrep -x dockerd >/dev/null && echo active || echo inactive"
        )
        services.append(ServiceStatus(
            name="docker",
            running="active" in docker_status or docker_status.strip().isdigit(),
        ))

        # Check for agent processes
        agent_check = self._exec(
            client, "pgrep -af 'fabrik' 2>/dev/null || echo ''"
        )
        if agent_check:
            for line in agent_check.strip().split("\n"):
                if line.strip():
                    parts = line.strip().split(None, 1)
                    if len(parts) >= 2:
                        services.append(ServiceStatus(
                            name=parts[1][:50],
                            running=True,
                            pid=int(parts[0]) if parts[0].isdigit() else None,
                        ))

        return services

    def _collect_agents(self, client: paramiko.SSHClient) -> list[AgentInfo]:
        """Detect running containers with detailed stats."""
        agents = []
        # Collect docker ps info (names, status, command)
        ps_output = self._exec(
            client,
            "docker ps --format '{{.Names}}|{{.Status}}|{{.Command}}' 2>/dev/null || echo ''"
        )
        # Collect docker stats (cpu, memory)
        stats_output = self._exec(
            client,
            "docker stats --no-stream --format '{{.Names}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' 2>/dev/null || echo ''"
        )

        # Parse stats into a lookup dict
        stats_map: dict[str, dict] = {}
        if stats_output:
            for line in stats_output.strip().split("\n"):
                if line.strip() and "|" in line:
                    parts = line.split("|")
                    if len(parts) >= 4:
                        name = parts[0].strip()
                        try:
                            cpu_pct = float(parts[1].strip().rstrip("%"))
                        except (ValueError, IndexError):
                            cpu_pct = 0.0
                        mem_usage = parts[2].strip()
                        try:
                            mem_pct = float(parts[3].strip().rstrip("%"))
                        except (ValueError, IndexError):
                            mem_pct = 0.0
                        stats_map[name] = {
                            "cpu_percent": cpu_pct,
                            "memory_usage": mem_usage,
                            "memory_percent": mem_pct,
                        }

        if ps_output:
            for line in ps_output.strip().split("\n"):
                if line.strip() and "|" in line:
                    parts = line.split("|", 2)
                    name = parts[0].strip()
                    status = parts[1].strip() if len(parts) > 1 else ""
                    command = parts[2].strip().strip('"') if len(parts) > 2 else ""
                    st = stats_map.get(name, {})
                    agents.append(AgentInfo(
                        name=name,
                        role="container",
                        status="running" if "Up" in status else "stopped",
                        last_activity=datetime.utcnow(),
                        cpu_percent=st.get("cpu_percent", 0.0),
                        memory_usage=st.get("memory_usage", ""),
                        memory_percent=st.get("memory_percent", 0.0),
                        command=command[:80],
                    ))
        return agents

    def close_all(self):
        """Close all SSH connections."""
        for ip, client in self._connections.items():
            try:
                client.close()
            except Exception:
                pass
        self._connections.clear()
