"""WebSocket manager for real-time dashboard updates."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages WebSocket connections for live dashboard updates."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("WebSocket client connected. Total: %d", len(self._connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self._connections:
            self._connections.remove(websocket)
        logger.info("WebSocket client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, data: dict[str, Any]):
        """Send data to all connected WebSocket clients."""
        if not self._connections:
            return

        message = json.dumps(data, default=str)
        disconnected = []

        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    @property
    def client_count(self) -> int:
        return len(self._connections)
