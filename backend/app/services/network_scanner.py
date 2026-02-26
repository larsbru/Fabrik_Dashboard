"""Network scanner service for discovering and monitoring machines."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
from datetime import datetime
from typing import Optional

import yaml

from ..config import settings
from ..models.machine import Machine, MachineStatus, NetworkSummary

logger = logging.getLogger(__name__)


class NetworkScanner:
    """Scans the local network for machines and maintains their state."""

    def __init__(self):
        self.machines: dict[str, Machine] = {}
        self.subnet = settings.network_subnet
        self._config: dict = {}
        self._load_config()

    def _load_config(self):
        """Load machine configuration from YAML file."""
        try:
            with open(settings.ssh_config_path, "r") as f:
                self._config = yaml.safe_load(f) or {}

            # Pre-populate known machines
            for machine_cfg in self._config.get("machines", []):
                ip = machine_cfg["ip"]
                self.machines[ip] = Machine(
                    ip=ip,
                    name=machine_cfg.get("name", f"Machine-{ip}"),
                    role=machine_cfg.get("role", "agent"),
                    ssh_user=machine_cfg.get(
                        "ssh_user",
                        self._config.get("defaults", {}).get("ssh_user", "fabrik"),
                    ),
                    ssh_port=machine_cfg.get(
                        "ssh_port",
                        self._config.get("defaults", {}).get("ssh_port", 22),
                    ),
                    tags=machine_cfg.get("tags", []),
                    description=machine_cfg.get("description", ""),
                    auto_discovered=False,
                )
            logger.info(
                "Loaded %d machines from config", len(self.machines)
            )
        except FileNotFoundError:
            logger.warning("Config file not found: %s", settings.ssh_config_path)
        except Exception as e:
            logger.error("Error loading config: %s", e)

    async def ping_host(self, ip: str, timeout: float = 1.0) -> bool:
        """Check if a host is reachable via ping."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", "1", "-W", str(int(timeout)), ip,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=timeout + 1)
            return proc.returncode == 0
        except (asyncio.TimeoutError, Exception):
            return False

    async def scan_network(self) -> list[str]:
        """Scan the entire subnet for reachable hosts."""
        network = ipaddress.ip_network(self.subnet, strict=False)
        exclude = set(
            self._config.get("auto_discovery", {}).get("exclude_ips", [])
        )

        # Ping all hosts concurrently
        tasks = {}
        for host in network.hosts():
            ip = str(host)
            if ip not in exclude:
                tasks[ip] = asyncio.create_task(self.ping_host(ip))

        discovered = []
        results = await asyncio.gather(
            *[self._check_host(ip, task) for ip, task in tasks.items()]
        )
        for ip, is_up in results:
            if is_up:
                discovered.append(ip)

        return discovered

    async def _check_host(self, ip: str, task) -> tuple[str, bool]:
        result = await task
        return (ip, result)

    async def discover_new_machines(self) -> list[Machine]:
        """Scan network and register any new machines."""
        discovered_ips = await self.scan_network()
        new_machines = []

        for ip in discovered_ips:
            if ip not in self.machines:
                defaults = self._config.get("defaults", {})
                auto_cfg = self._config.get("auto_discovery", {})
                machine = Machine(
                    ip=ip,
                    name=f"Auto-{ip.split('.')[-1]}",
                    role=auto_cfg.get("default_role", "agent"),
                    ssh_user=defaults.get("ssh_user", "fabrik"),
                    ssh_port=defaults.get("ssh_port", 22),
                    auto_discovered=True,
                    last_seen=datetime.utcnow(),
                )
                self.machines[ip] = machine
                new_machines.append(machine)
                logger.info("Discovered new machine: %s", ip)

        # Update last_seen for all discovered IPs
        now = datetime.utcnow()
        for ip in discovered_ips:
            if ip in self.machines:
                self.machines[ip].last_seen = now
                if self.machines[ip].status == MachineStatus.UNKNOWN:
                    self.machines[ip].status = MachineStatus.ONLINE

        # Mark unreachable machines as offline
        for ip, machine in self.machines.items():
            if ip not in discovered_ips:
                machine.status = MachineStatus.OFFLINE

        return new_machines

    def get_machine(self, ip: str) -> Optional[Machine]:
        return self.machines.get(ip)

    def get_all_machines(self) -> list[Machine]:
        return list(self.machines.values())

    def get_summary(self) -> NetworkSummary:
        machines = self.get_all_machines()
        online = [m for m in machines if m.status == MachineStatus.ONLINE]
        offline = [m for m in machines if m.status == MachineStatus.OFFLINE]
        degraded = [m for m in machines if m.status == MachineStatus.DEGRADED]

        avg_cpu = 0.0
        avg_mem = 0.0
        avg_disk = 0.0
        active_agents = 0

        if online:
            avg_cpu = sum(m.cpu.usage_percent for m in online) / len(online)
            avg_mem = sum(m.memory.usage_percent for m in online) / len(online)
            disk_usages = []
            for m in online:
                if m.disks:
                    disk_usages.append(m.disks[0].usage_percent)
            avg_disk = sum(disk_usages) / len(disk_usages) if disk_usages else 0.0
            active_agents = sum(
                len([a for a in m.agents if a.status == "running"]) for m in online
            )

        return NetworkSummary(
            total_machines=len(machines),
            online=len(online),
            offline=len(offline),
            degraded=len(degraded),
            total_cpu_usage=round(avg_cpu, 1),
            total_memory_usage=round(avg_mem, 1),
            total_disk_usage=round(avg_disk, 1),
            active_agents=active_agents,
            last_scan=datetime.utcnow(),
        )

    def add_machine(self, machine: Machine):
        """Manually add or update a machine."""
        self.machines[machine.ip] = machine
        self._save_config()

    def remove_machine(self, ip: str):
        """Remove a machine from tracking."""
        self.machines.pop(ip, None)
        self._save_config()

    def _save_config(self):
        """Persist current machine list back to config."""
        try:
            machines_list = []
            for m in self.machines.values():
                machines_list.append({
                    "name": m.name,
                    "ip": m.ip,
                    "role": m.role,
                    "ssh_user": m.ssh_user,
                    "ssh_port": m.ssh_port,
                    "tags": m.tags,
                    "description": m.description,
                })
            self._config["machines"] = machines_list
            with open(settings.ssh_config_path, "w") as f:
                yaml.dump(self._config, f, default_flow_style=False)
        except Exception as e:
            logger.error("Error saving config: %s", e)
