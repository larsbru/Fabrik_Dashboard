"""Alert service for monitoring threshold violations."""

from __future__ import annotations

import logging
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from ..models.machine import Machine

logger = logging.getLogger(__name__)


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Alert(BaseModel):
    id: str
    severity: AlertSeverity
    machine_ip: str
    machine_name: str
    title: str
    message: str
    metric: str = ""
    value: float = 0
    threshold: float = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    acknowledged: bool = False


# Default thresholds
THRESHOLDS = {
    "cpu_warning": 80.0,
    "cpu_critical": 95.0,
    "memory_warning": 85.0,
    "memory_critical": 95.0,
    "disk_warning": 85.0,
    "disk_critical": 95.0,
}


class AlertService:
    """Monitors machines and generates alerts based on thresholds."""

    def __init__(self):
        self._alerts: list[Alert] = []
        self._max_alerts = 200

    def check_machine(self, machine: Machine) -> list[Alert]:
        """Check a machine's metrics against thresholds and generate alerts."""
        new_alerts = []
        name = machine.name or machine.hostname or machine.ip

        # CPU check
        cpu = machine.cpu.usage_percent
        if cpu >= THRESHOLDS["cpu_critical"]:
            new_alerts.append(self._create_alert(
                AlertSeverity.CRITICAL, machine.ip, name,
                "CPU kritisch", f"CPU-Auslastung bei {cpu}%",
                "cpu", cpu, THRESHOLDS["cpu_critical"],
            ))
        elif cpu >= THRESHOLDS["cpu_warning"]:
            new_alerts.append(self._create_alert(
                AlertSeverity.WARNING, machine.ip, name,
                "CPU hoch", f"CPU-Auslastung bei {cpu}%",
                "cpu", cpu, THRESHOLDS["cpu_warning"],
            ))

        # Memory check
        mem = machine.memory.usage_percent
        if mem >= THRESHOLDS["memory_critical"]:
            new_alerts.append(self._create_alert(
                AlertSeverity.CRITICAL, machine.ip, name,
                "RAM kritisch", f"RAM-Auslastung bei {mem}%",
                "memory", mem, THRESHOLDS["memory_critical"],
            ))
        elif mem >= THRESHOLDS["memory_warning"]:
            new_alerts.append(self._create_alert(
                AlertSeverity.WARNING, machine.ip, name,
                "RAM hoch", f"RAM-Auslastung bei {mem}%",
                "memory", mem, THRESHOLDS["memory_warning"],
            ))

        # Disk check
        for disk in machine.disks:
            usage = disk.usage_percent
            if usage >= THRESHOLDS["disk_critical"]:
                new_alerts.append(self._create_alert(
                    AlertSeverity.CRITICAL, machine.ip, name,
                    "Speicher kritisch",
                    f"Disk {disk.mount_point} bei {usage}%",
                    "disk", usage, THRESHOLDS["disk_critical"],
                ))
            elif usage >= THRESHOLDS["disk_warning"]:
                new_alerts.append(self._create_alert(
                    AlertSeverity.WARNING, machine.ip, name,
                    "Speicher hoch",
                    f"Disk {disk.mount_point} bei {usage}%",
                    "disk", usage, THRESHOLDS["disk_warning"],
                ))

        # Machine went offline
        if machine.status == "offline":
            new_alerts.append(self._create_alert(
                AlertSeverity.CRITICAL, machine.ip, name,
                "Maschine offline",
                f"{name} ({machine.ip}) ist nicht erreichbar",
                "status", 0, 0,
            ))

        self._alerts.extend(new_alerts)
        # Trim old alerts
        if len(self._alerts) > self._max_alerts:
            self._alerts = self._alerts[-self._max_alerts:]

        return new_alerts

    def _create_alert(
        self, severity, ip, name, title, message, metric, value, threshold
    ) -> Alert:
        alert_id = f"{ip}-{metric}-{int(datetime.utcnow().timestamp())}"
        return Alert(
            id=alert_id,
            severity=severity,
            machine_ip=ip,
            machine_name=name,
            title=title,
            message=message,
            metric=metric,
            value=value,
            threshold=threshold,
        )

    def get_alerts(self, unacknowledged_only: bool = False) -> list[Alert]:
        if unacknowledged_only:
            return [a for a in self._alerts if not a.acknowledged]
        return list(self._alerts)

    def acknowledge_alert(self, alert_id: str) -> bool:
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def clear_alerts(self):
        self._alerts.clear()
