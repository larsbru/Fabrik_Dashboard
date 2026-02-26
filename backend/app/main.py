"""Fabrik Dashboard - Main FastAPI Application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import alerts as alerts_router
from .routers import github as github_router
from .routers import machines as machines_router
from .routers import websocket as ws_router
from .services.alerts import AlertService
from .services.github_service import GitHubService
from .services.network_scanner import NetworkScanner
from .services.scheduler import BackgroundScheduler
from .services.ssh_manager import SSHManager
from .services.websocket_manager import WebSocketManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize services
scanner = NetworkScanner()
ssh_manager = SSHManager()
github_service = GitHubService()
ws_manager = WebSocketManager()
alert_service = AlertService()
scheduler = BackgroundScheduler(scanner, ssh_manager, github_service, ws_manager, alert_service)

# Inject services into routers
machines_router.scanner = scanner
machines_router.ssh_manager = ssh_manager
github_router.github_service = github_service
ws_router.ws_manager = ws_manager
alerts_router.alert_service = alert_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    logger.info("Starting Fabrik Dashboard Backend...")
    logger.info("Network: %s | Host: %s", settings.network_subnet, settings.host_ip)
    logger.info("GitHub: %s/%s", settings.github_owner, settings.github_repo)

    await scheduler.start()
    yield
    await scheduler.stop()
    ssh_manager.close_all()
    logger.info("Fabrik Dashboard Backend stopped.")


app = FastAPI(
    title="Fabrik Network Dashboard",
    description="Internal dashboard for the Fabrik coding factory network",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow local frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(machines_router.router)
app.include_router(github_router.router)
app.include_router(alerts_router.router)
app.include_router(ws_router.router)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "fabrik-dashboard",
        "websocket_clients": ws_manager.client_count,
        "machines_tracked": len(scanner.get_all_machines()),
    }


@app.get("/api/config")
async def get_config():
    """Return non-sensitive configuration."""
    return {
        "network_subnet": settings.network_subnet,
        "host_ip": settings.host_ip,
        "scan_interval": settings.scan_interval,
        "github_repo": f"{settings.github_owner}/{settings.github_repo}",
        "github_configured": bool(settings.github_token),
    }
