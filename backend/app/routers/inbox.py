"""API routes for Inbox -> Backlog pipeline visualization."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter

router = APIRouter(prefix="/api/inbox", tags=["inbox"])
logger = logging.getLogger(__name__)

# Paths (mounted as volumes in Docker)
INBOX_DIR = Path(os.environ.get("INBOX_DIR", "/app/fabrik/Documents/DevFabrik/inbox"))
INBOX_PROCESSED_DIR = Path(os.environ.get("INBOX_PROCESSED_DIR", "/app/fabrik/DevFabrik/management/inbox_processed"))
BACKLOG_PATH = Path(os.environ.get("BACKLOG_PATH", "/app/fabrik/DevFabrik/backlog.md"))
GARDENER_REPORT = Path(os.environ.get("GARDENER_REPORT", "/app/fabrik/DevFabrik/management/gardener/backlog_report.yaml"))


def _safe_yaml(path: Path) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        logger.warning("Could not read YAML %s: %s", path, e)
        return {}


def _parse_processed_item(folder: Path) -> Optional[dict]:
    """Parse a single inbox_processed folder into a summary dict."""
    try:
        name = folder.name
        date_str = None
        slug = name
        m = re.match(r"^(\d{4}-\d{2}-\d{2})_(.*)", name)
        if m:
            date_str = m.group(1)
            slug = m.group(2)

        analysis_file = None
        for fname in ["analysis.yaml", "idea.yaml", "IDEA.yaml", "auftrag.yaml"]:
            p = folder / fname
            if p.exists():
                analysis_file = p
                break
        if analysis_file is None:
            yamls = list(folder.glob("*.yaml")) + list(folder.glob("*.yml"))
            if yamls:
                analysis_file = yamls[0]

        meta = {}
        if analysis_file:
            meta = _safe_yaml(analysis_file)

        typ = meta.get("typ") or meta.get("type") or ""
        if not typ:
            for t in ["idee", "anweisung", "backlog", "ssot-change", "infrastruktur", "feature", "bug"]:
                if t in slug:
                    typ = t
                    break

        typ_icons = {
            "idee": "💡", "anweisung": "📌", "backlog": "📋",
            "ssot-change": "📜", "infrastruktur": "🏗️",
            "feature": "✨", "bug": "🐛",
        }

        status = meta.get("status") or "verarbeitet"
        backlog_ref = meta.get("backlog_ref") or meta.get("b_nummer") or ""
        title = (
            meta.get("titel") or meta.get("title") or meta.get("name")
            or slug.replace("-", " ").replace("_", " ").title()
        )

        return {
            "id": name, "slug": slug, "date": date_str,
            "title": title, "typ": typ,
            "typ_icon": typ_icons.get(typ, "📄"),
            "status": status, "backlog_ref": backlog_ref,
            "source_file": str(analysis_file.name) if analysis_file else None,
        }
    except Exception as e:
        logger.warning("Could not parse inbox item %s: %s", folder.name, e)
        return None


def _parse_backlog(path: Path) -> dict:
    """Parse backlog.md into structured sections with items."""
    if not path.exists():
        return {"sections": [], "stats": {}}

    text = path.read_text(encoding="utf-8")
    sections = []
    current_section = None
    current_items = []

    prio_map = {
        "HOHE PRIORITÄT": "high", "HOCH": "high",
        "MITTLERE PRIORITÄT": "medium", "MITTEL": "medium",
        "NIEDRIGE PRIORITÄT": "low", "NIEDRIG": "low",
        "LANGFRISTIG": "low", "ERLEDIGT": "done", "OBSOLET": "done",
    }

    def flush_section():
        if current_section is not None:
            sections.append({
                "title": current_section["title"],
                "priority": current_section["priority"],
                "emoji": current_section["emoji"],
                "items": list(current_items),
            })

    for line in text.splitlines():
        h2 = re.match(r"^##\s+(.*)", line)
        if h2:
            flush_section()
            current_items.clear()
            raw_title = h2.group(1).strip()
            emoji = "📋"
            for e in ["🔴", "🟡", "🟢", "✅", "🗑️"]:
                if e in raw_title:
                    emoji = e
                    break
            prio = "medium"
            for keyword, p in prio_map.items():
                if keyword in raw_title.upper():
                    prio = p
                    break
            current_section = {"title": raw_title, "priority": prio, "emoji": emoji}
            continue

        h3 = re.match(r"^###\s+(.*)", line)
        if h3 and current_section:
            raw = h3.group(1).strip()
            obsolete = "~~" in raw
            raw_clean = re.sub(r"~~(.*?)~~", r"\1", raw).strip()
            raw_clean = re.sub(r"\s*✅.*$", "", raw_clean).strip()
            b_match = re.match(r"(B\d+(?:-\w+)?)\s*[–-]\s*(.*)", raw_clean)
            b_id = b_match.group(1) if b_match else ""
            title = b_match.group(2).strip() if b_match else raw_clean
            title = re.sub(r"\s*\(.*?\)\s*$", "", title).strip()
            current_items.append({"id": b_id, "title": title, "obsolete": obsolete, "raw": raw_clean})
            continue

        check = re.match(r"^-\s+\[([x ])\]\s+(.*)", line)
        if check and current_section:
            done = check.group(1) == "x"
            raw = check.group(2).strip()
            current_items.append({
                "id": "", "title": raw[:80] + ("…" if len(raw) > 80 else ""),
                "obsolete": done, "raw": raw,
            })

    flush_section()

    all_items = [i for s in sections for i in s["items"]]
    stats = {
        "total": len(all_items),
        "high": sum(1 for s in sections if s["priority"] == "high" for i in s["items"] if not i["obsolete"]),
        "medium": sum(1 for s in sections if s["priority"] == "medium" for i in s["items"] if not i["obsolete"]),
        "low": sum(1 for s in sections if s["priority"] == "low" for i in s["items"] if not i["obsolete"]),
        "done": sum(1 for s in sections for i in s["items"] if i["obsolete"]),
        "sections": len([s for s in sections if s["priority"] != "done"]),
    }
    return {"sections": sections, "stats": stats}


@router.get("/overview")
async def get_overview():
    """Full Inbox to Backlog pipeline overview."""
    pending_inbox = []
    if INBOX_DIR.exists():
        for f in sorted(INBOX_DIR.iterdir()):
            if f.suffix in (".md", ".txt", ".pdf") and not f.name.startswith("."):
                stat = f.stat()
                pending_inbox.append({
                    "name": f.name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })

    processed = []
    if INBOX_PROCESSED_DIR.exists():
        folders = sorted(
            [d for d in INBOX_PROCESSED_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")],
            reverse=True,
        )
        for folder in folders[:50]:
            item = _parse_processed_item(folder)
            if item:
                processed.append(item)

    backlog = _parse_backlog(BACKLOG_PATH)

    gardener = {}
    if GARDENER_REPORT.exists():
        gardener = _safe_yaml(GARDENER_REPORT)

    stats = {
        "inbox_pending": len(pending_inbox),
        "inbox_processed": len(processed),
        "backlog_items": backlog["stats"].get("total", 0),
        "backlog_high": backlog["stats"].get("high", 0),
        "backlog_medium": backlog["stats"].get("medium", 0),
        "backlog_low": backlog["stats"].get("low", 0),
        "gardener_last_run": gardener.get("_meta", {}).get("generiert_am"),
    }

    return {
        "stats": stats,
        "pending_inbox": pending_inbox,
        "processed": processed,
        "backlog": backlog,
        "gardener_meta": gardener.get("_meta", {}),
    }


@router.get("/backlog")
async def get_backlog():
    """Return parsed backlog only."""
    return _parse_backlog(BACKLOG_PATH)
