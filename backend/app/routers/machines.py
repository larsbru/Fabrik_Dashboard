"""API routes for machine management and metrics."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models.machine import Machine, NetworkSummary

router = APIRouter(prefix="/api/machines", tags=["machines"])

# These get injected by main.py
scanner = None
ssh_manager = None


@router.get("", response_model=list[Machine])
async def get_machines():
    """Return all known machines with their current state."""
    return scanner.get_all_machines()


@router.get("/summary", response_model=NetworkSummary)
async def get_network_summary():
    """Return network-wide summary metrics."""
    return scanner.get_summary()


@router.get("/{ip}", response_model=Machine)
async def get_machine(ip: str):
    """Return a specific machine by IP."""
    machine = scanner.get_machine(ip)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


@router.post("/{ip}/refresh", response_model=Machine)
async def refresh_machine(ip: str):
    """Force-refresh metrics for a specific machine."""
    machine = scanner.get_machine(ip)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    updated = await ssh_manager.collect_metrics(machine)
    scanner.machines[ip] = updated
    return updated


@router.post("/scan")
async def trigger_scan():
    """Manually trigger a full network scan."""
    new_machines = await scanner.discover_new_machines()
    return {
        "discovered": len(new_machines),
        "total": len(scanner.get_all_machines()),
        "new": [m.model_dump(mode="json") for m in new_machines],
    }


@router.post("", response_model=Machine)
async def add_machine(machine: Machine):
    """Manually register a new machine."""
    scanner.add_machine(machine)
    return machine


@router.delete("/{ip}")
async def remove_machine(ip: str):
    """Remove a machine from tracking."""
    if not scanner.get_machine(ip):
        raise HTTPException(status_code=404, detail="Machine not found")
    scanner.remove_machine(ip)
    return {"status": "removed", "ip": ip}
