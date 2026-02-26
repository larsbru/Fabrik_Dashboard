"""WebSocket endpoint for real-time updates."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["websocket"])

# Injected by main.py
ws_manager = None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; handle client messages if needed
            data = await websocket.receive_text()
            # Could handle commands from frontend here
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
