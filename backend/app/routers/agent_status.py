"""Agent-Status Router – zeigt was jeder Agent gerade tut.

Liest die letzten Log-Zeilen der Agent-Container via SSH auf den jeweiligen VMs.
Kein persistenter State – immer aktuell aus den Logs.

Endpoints:
  GET /api/agents/status  – Status aller Agents (letzter Log-Eintrag + Aktivität)
"""

from __future__ import annotations

import logging
import re
import subprocess
from datetime import datetime

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["agents"])

# SSH-Key für VM-Zugriff (gemountet im Container)
SSH_KEY = "/app/config/ssh_keys/brain_access"
SSH_USER = "fabriksys"
SSH_OPTS = [
    "ssh", "-i", SSH_KEY,
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=4",
    "-o", "BatchMode=yes",
]

# Agent-Definitionen
AGENTS = [
    {
        "id": "agent0",
        "name": "Agent0",
        "ip": "192.168.44.10",
        "log_cmd": None,  # Kein SSH – Log via Volume-Mount gelesen
        "local_log": "/app/agent0/agent0.out.log",
        "role": "Planung & Governance",
        "color": "#8b5cf6",
    },
    {
        "id": "dispatcher",
        "name": "Dispatcher",
        "ip": "192.168.44.70",
        "log_cmd": "docker logs dispatcher 2>&1 | tail -n 30 2>/dev/null || echo 'NO_LOG'",
        "role": "State Machine",
        "color": "#a78bfa",
    },
    {
        "id": "dev-agent",
        "name": "Dev-Agent",
        "ip": "192.168.44.101",
        "log_cmd": "docker logs dev-agent 2>&1 | tail -n 30 2>/dev/null || echo 'NO_LOG'",
        "role": "Code-Generierung",
        "color": "#f59e0b",
    },
    {
        "id": "qa-agent",
        "name": "QA-Agent",
        "ip": "192.168.44.40",
        "log_cmd": "docker logs qa-agent 2>&1 | tail -n 30 2>/dev/null || echo 'NO_LOG'",
        "role": "Code-Review",
        "color": "#06b6d4",
    },
    {
        "id": "ci-runner",
        "name": "CI-Runner",
        "ip": "192.168.44.20",
        "log_cmd": "sudo journalctl -u actions.runner* -n 20 --no-pager 2>/dev/null | tail -20 || echo 'NO_LOG'",
        "role": "CI/Tests & Deploy",
        "color": "#0ea5e9",
    },
]

# Welche Log-Muster bedeuten was (Priorität: erstes Match gewinnt)
ACTIVITY_PATTERNS = [
    # Agent0-spezifische Patterns (Prefix: "agent0: ")
    (r"agent0:.*Plan.*#\d+", "📋 Plant Issue", "busy"),
    (r"agent0:.*Labels.*assigned:", "✅ Dispatched", "busy"),
    (r"agent0:.*Governance|agent0:.*FL|agent0:.*ADR|agent0:.*Feature-Map", "📚 Governance-Write", "busy"),
    (r"agent0:.*Gefunden.*Issues", "🔍 Pollt Issues", "idle"),
    (r"agent0:.*repos.yaml", "⏳ Wartet auf Issues", "idle"),
    # Coding / LLM aktiv
    (r"(call_opus|call_sonnet|Tier 2|claude.*running|Opus|Sonnet|Tier-2)", "🤖 LLM aktiv (Tier 2)", "active"),
    (r"(ollama|Tier 1|qwen|generating)", "⚙️ LLM aktiv (Tier 1)", "active"),
    # Spezifische Aktionen
    (r"(Coding Issue|generate_code|coding_engine)", "💻 Schreibt Code", "busy"),
    (r"(QA.*review|reviewing.*PR|qa_review|LLM.*review)", "🔍 Reviewt PR", "busy"),
    (r"(planning.*issue|plan_issue|Planung)", "📋 Plant Issue", "busy"),
    (r"(governance|fix.*learning|feature.*map|ADR)", "📚 Governance-Write", "busy"),
    (r"(deploy|staging|docker.*up)", "🚀 Deploy läuft", "busy"),
    (r"(CI.*running|running.*workflow|ci_status)", "🔧 CI läuft", "busy"),
    (r"(git.*push|git.*commit|Creating PR|pull_request)", "📤 Git Push/PR", "busy"),
    (r"(git.*clone|git.*pull|checkout)", "📥 Git Pull/Clone", "busy"),
    # Warten / Polling
    (r"(No issues found|Keine.*Issues|nothing to do|idle|polling|Waiting)", "⏳ Wartet auf Issues", "idle"),
    (r"(Poll.*interval|sleeping|sleep \d+)", "💤 Schläft (Poll-Intervall)", "idle"),
    (r"(Loaded.*repos|repos.yaml|active repos)", "⏳ Pollt (idle)", "idle"),
    # Fehler
    (r"(ERROR|Exception|Traceback|failed|Failed|FAILED)", "❌ Fehler", "error"),
    # Retry
    (r"(retry|Retry|retrying)", "🔄 Retry", "warn"),
]


def _detect_activity(log_lines: list[str]) -> tuple[str, str, str]:
    """Gibt (aktivitaet_label, status, letzte_relevante_zeile) zurück."""
    # Von hinten durchsuchen – neuester Eintrag zuerst
    for line in reversed(log_lines[-20:]):
        for pattern, label, status in ACTIVITY_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                clean = line.strip()
                # Timestamp am Anfang wegschneiden für Lesbarkeit
                clean = re.sub(r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,\d]*\s*', '', clean)
                clean = re.sub(r'^\[.*?\]\s*', '', clean)
                return label, status, clean[:120]
    return "❓ Unbekannt", "unknown", ""


def _extract_issue_nr(log_lines: list[str]) -> str | None:
    """Versucht Issue-Nummer aus Logs zu extrahieren."""
    for line in reversed(log_lines[-20:]):
        m = re.search(r'[Ii]ssue\s*#?(\d+)', line)
        if m:
            return m.group(1)
        m = re.search(r'#(\d{3,})', line)
        if m:
            return m.group(1)
    return None


def _local_logs(agent: dict) -> tuple[bool, list[str]]:
    """Liest Log-Zeilen direkt aus gemounteter Datei (kein SSH)."""
    log_path = agent.get("local_log")
    if not log_path:
        return False, []
    try:
        import os
        if not os.path.exists(log_path):
            logger.debug("Lokale Log-Datei nicht gefunden: %s", log_path)
            return False, []
        with open(log_path, "r", errors="replace") as f:
            lines = f.readlines()
        last_lines = [l.rstrip() for l in lines[-30:] if l.strip()]
        return bool(last_lines), last_lines
    except Exception as e:
        logger.debug("Lokaler Log-Fehler für %s: %s", agent["id"], e)
        return False, []


def _ssh_logs(agent: dict) -> tuple[bool, list[str]]:
    """Holt Log-Zeilen via SSH. Gibt (success, lines) zurück."""
    ip = agent["ip"]
    cmd = agent.get("log_cmd")
    if not cmd:
        return False, []
    try:
        result = subprocess.run(
            SSH_OPTS + [f"{SSH_USER}@{ip}", cmd],
            capture_output=True, text=True, timeout=6,
        )
        if result.returncode == 0 and result.stdout.strip() and result.stdout.strip() != "NO_LOG":
            lines = [l for l in result.stdout.splitlines() if l.strip()]
            return True, lines
        return False, []
    except subprocess.TimeoutExpired:
        logger.debug("SSH timeout für %s (%s)", agent["id"], ip)
        return False, []
    except Exception as e:
        logger.debug("SSH-Fehler für %s: %s", agent["id"], e)
        return False, []


def _get_agent_status(agent: dict) -> dict:
    """Vollständiger Status-Check für einen Agent."""
    # Agent0: Log via Volume-Mount, alle anderen via SSH
    if agent.get("local_log"):
        success, lines = _local_logs(agent)
    else:
        success, lines = _ssh_logs(agent)

    if not success or not lines:
        return {
            "id": agent["id"],
            "name": agent["name"],
            "role": agent["role"],
            "color": agent["color"],
            "reachable": False,
            "status": "unreachable",
            "activity": "🔌 Nicht erreichbar",
            "current_issue": None,
            "last_log": None,
            "log_lines": [],
            "checked_at": datetime.utcnow().isoformat(),
        }

    activity, status, last_relevant = _detect_activity(lines)
    issue_nr = _extract_issue_nr(lines)

    # Letzte 5 Zeilen als Preview
    preview = [l.strip()[:120] for l in lines[-5:] if l.strip()]

    return {
        "id": agent["id"],
        "name": agent["name"],
        "role": agent["role"],
        "color": agent["color"],
        "reachable": True,
        "status": status,
        "activity": activity,
        "current_issue": f"#{issue_nr}" if issue_nr else None,
        "last_log": last_relevant or (preview[-1] if preview else None),
        "log_lines": preview,
        "checked_at": datetime.utcnow().isoformat(),
    }


@router.get("/status")
async def get_agent_status():
    """Status aller Agents – was tun sie gerade?"""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=len(AGENTS)) as pool:
        futures = [
            loop.run_in_executor(pool, _get_agent_status, agent)
            for agent in AGENTS
        ]
        results = await asyncio.gather(*futures)

    agents = list(results)

    # Zusammenfassung
    busy = sum(1 for a in agents if a["status"] in ("active", "busy"))
    errors = sum(1 for a in agents if a["status"] == "error")
    unreachable = sum(1 for a in agents if not a["reachable"])

    return {
        "agents": agents,
        "summary": {
            "total": len(agents),
            "busy": busy,
            "errors": errors,
            "unreachable": unreachable,
            "idle": len(agents) - busy - errors - unreachable,
        },
        "fetched_at": datetime.utcnow().isoformat(),
    }
