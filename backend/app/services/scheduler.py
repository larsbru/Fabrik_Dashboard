"""Background scheduler for periodic network scanning and GitHub sync."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from ..config import settings

logger = logging.getLogger(__name__)


class BackgroundScheduler:
    """Runs periodic tasks for scanning and syncing."""

    def __init__(self, scanner, ssh_manager, github_service, ws_manager, alert_service=None):
        self.scanner = scanner
        self.ssh = ssh_manager
        self.github = github_service
        self.ws = ws_manager
        self.alerts = alert_service
        self.scan_interval = settings.scan_interval
        self._running = False
        self._tasks: list[asyncio.Task] = []

    async def start(self):
        """Start all background loops."""
        self._running = True
        self._tasks = [
            asyncio.create_task(self._network_scan_loop()),
            asyncio.create_task(self._metrics_collection_loop()),
            asyncio.create_task(self._github_sync_loop()),
        ]
        logger.info("Background scheduler started (scan_interval=%ds)", self.scan_interval)

    def update_scan_interval(self, interval: int):
        """Update the scan interval at runtime."""
        self.scan_interval = max(10, interval)
        logger.info("Scan interval updated to %ds", self.scan_interval)

    async def stop(self):
        """Stop all background loops."""
        self._running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("Background scheduler stopped")

    async def _network_scan_loop(self):
        """Periodically scan the network for new machines."""
        while self._running:
            try:
                logger.info("Starting network scan...")
                new_machines = await self.scanner.discover_new_machines()
                if new_machines:
                    logger.info("Found %d new machines", len(new_machines))
                    await self.ws.broadcast({
                        "type": "network_update",
                        "event": "new_machines",
                        "data": [m.model_dump(mode="json") for m in new_machines],
                        "timestamp": datetime.utcnow().isoformat(),
                    })

                # Broadcast updated machine list
                await self.ws.broadcast({
                    "type": "network_update",
                    "event": "scan_complete",
                    "data": {
                        "machines": [
                            m.model_dump(mode="json")
                            for m in self.scanner.get_all_machines()
                        ],
                        "summary": self.scanner.get_summary().model_dump(mode="json"),
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                })
            except Exception as e:
                logger.error("Network scan error: %s", e)

            await asyncio.sleep(self.scan_interval)

    async def _metrics_collection_loop(self):
        """Periodically collect metrics from all known machines via SSH."""
        # Wait for initial scan to complete
        await asyncio.sleep(10)

        while self._running:
            try:
                machines = self.scanner.get_all_machines()
                tasks = [
                    self.ssh.collect_metrics(m)
                    for m in machines
                    if m.status != "offline" or m.last_scan is None
                ]
                if tasks:
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    for result in results:
                        if isinstance(result, Exception):
                            logger.error("Metrics collection error: %s", result)
                        else:
                            self.scanner.machines[result.ip] = result

                    # Check alerts for each updated machine
                    if self.alerts:
                        all_new_alerts = []
                        for result in results:
                            if not isinstance(result, Exception):
                                new_alerts = self.alerts.check_machine(result)
                                all_new_alerts.extend(new_alerts)
                        if all_new_alerts:
                            await self.ws.broadcast({
                                "type": "alerts_update",
                                "data": [a.model_dump(mode="json") for a in all_new_alerts],
                                "timestamp": datetime.utcnow().isoformat(),
                            })

                    # Broadcast metrics update
                    await self.ws.broadcast({
                        "type": "metrics_update",
                        "data": {
                            "machines": [
                                m.model_dump(mode="json")
                                for m in self.scanner.get_all_machines()
                            ],
                            "summary": self.scanner.get_summary().model_dump(mode="json"),
                        },
                        "timestamp": datetime.utcnow().isoformat(),
                    })
            except Exception as e:
                logger.error("Metrics loop error: %s", e)

            await asyncio.sleep(self.scan_interval)

    async def _github_sync_loop(self):
        """Periodically sync GitHub data."""
        while self._running:
            try:
                logger.info("Syncing GitHub data...")
                await self.github.sync()

                await self.ws.broadcast({
                    "type": "github_update",
                    "data": self.github.get_summary().model_dump(mode="json"),
                    "timestamp": datetime.utcnow().isoformat(),
                })
            except Exception as e:
                logger.error("GitHub sync error: %s", e)

            await asyncio.sleep(120)  # Sync every 2 minutes
