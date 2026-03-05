"""API routes for Inbox -> Backlog pipeline visualization."""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/inbox", tags=["inbox"])
logger = logging.getLogger(__name__)

# Paths (mounted as volumes in Docker)
INBOX_DIR = Path(os.environ.get("INBOX_DIR", "/app/fabrik/Documents/DevFabrik/inbox"))
INBOX_PROCESSED_DIR = Path(os.environ.get("INBOX_PROCESSED_DIR", "/app/fabrik/DevFabrik/management/inbox_processed"))
BACKLOG_PATH = Path(os.environ.get("BACKLOG_PATH", "/app/fabrik/DevFabrik/backlog.md"))
GARDENER_REPORT = Path(os.environ.get("GARDENER_REPORT", "/app/fabrik/DevFabrik/management/gardener/backlog_report.yaml"))
IDEAS_DIR = Path(os.environ.get("IDEAS_DIR", "/app/fabrik/DevFabrik/backlog/ideas"))


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


# ── IDEA-YAML Endpoints ───────────────────────────────────────────────────────

def _read_ideas() -> list[dict]:
    """Alle draft.yaml aus inbox_processed/ lesen — das ist die echte Inbox."""
    if not INBOX_PROCESSED_DIR.exists():
        return []
    ideas = []
    folders = sorted(
        [d for d in INBOX_PROCESSED_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")],
        reverse=True,
    )
    for folder in folders:
        draft = folder / "draft.yaml"
        if not draft.exists():
            continue
        try:
            data = _safe_yaml(draft)
            if not data:
                continue
            name = folder.name
            m = re.match(r"^(\d{4}-\d{2}-\d{2})_(.*)", name)
            date_str = m.group(1) if m else ""
            slug = m.group(2) if m else name

            meta = data.get("_meta", {})
            gardener = data.get("_gardener", {})
            status = meta.get("status") or data.get("status") or "neu"

            ideas.append({
                "filename": f"{name}/draft.yaml",
                "id": name,                          # folder-name als ID
                "titel": data.get("titel") or data.get("title") or slug.replace("-", " ").title(),
                "beschreibung": data.get("zusammenfassung") or data.get("beschreibung") or "",
                "status": status,
                "prioritaet": data.get("prioritaet_vorschlag") or data.get("prioritaet") or "",
                "b_nummer": data.get("b_nummer") or data.get("backlog_ref") or "",
                "eingang": date_str,
                "begruendung": data.get("begruendung") or "",
                "kategorie": data.get("kategorie") or "",
                "vorgeschlagene_aktion": data.get("vorgeschlagene_aktion") or "",
                "bezug_zu_backlog": data.get("bezug_zu_backlog") or "",
                "analyse_ok": "Analyse fehlgeschlagen" not in (data.get("zusammenfassung") or ""),
                "dedup_empfehlung": gardener.get("dedup_ergebnis", {}).get("empfehlung") or "",
            })
        except Exception as e:
            logger.warning("Could not parse draft %s: %s", folder.name, e)
    return ideas


def _next_b_nummer() -> str:
    """Nächste freie B-Nummer aus backlog.md ermitteln."""
    if not BACKLOG_PATH.exists():
        return "B99"
    text = BACKLOG_PATH.read_text(encoding="utf-8")
    nums = [int(m) for m in re.findall(r'\bB(\d+)\b', text)]
    return f"B{max(nums) + 1}" if nums else "B01"


def _idea_draft_path(idea_id: str) -> Path:
    """Gibt den draft.yaml-Pfad für eine idea_id zurück."""
    return INBOX_PROCESSED_DIR / idea_id / "draft.yaml"


class ApproveRequest(BaseModel):
    b_nummer: str = ""   # leer = auto-vergeben
    notiz: str = ""


class RejectRequest(BaseModel):
    begruendung: str


class DeferRequest(BaseModel):
    notiz: str = ""


@router.get("/ideas")
async def list_ideas():
    """Alle IDEA-YAMLs aus backlog/ideas/."""
    return {"ideas": _read_ideas()}


@router.post("/ideas/{idea_id}/approve")
async def approve_idea(idea_id: str, req: ApproveRequest):
    path = _idea_draft_path(idea_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(path)
    b_num = req.b_nummer.strip() or _next_b_nummer()
    data.setdefault("_meta", {})["status"] = "approved"
    data["b_nummer"] = b_num
    data["status"] = "approved"
    if req.notiz:
        data["ceo_notiz"] = req.notiz
    data["approved_at"] = datetime.utcnow().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
    logger.info("CEO approved %s → %s", idea_id, b_num)
    return {"status": "approved", "idea_id": idea_id, "b_nummer": b_num}


@router.post("/ideas/{idea_id}/reject")
async def reject_idea(idea_id: str, req: RejectRequest):
    path = _idea_draft_path(idea_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(path)
    data.setdefault("_meta", {})["status"] = "rejected"
    data["status"] = "rejected"
    data["begruendung"] = req.begruendung
    data["rejected_at"] = datetime.utcnow().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
    logger.info("CEO rejected %s: %s", idea_id, req.begruendung[:80])
    return {"status": "rejected", "idea_id": idea_id}


@router.post("/ideas/{idea_id}/defer")
async def defer_idea(idea_id: str, req: DeferRequest):
    path = _idea_draft_path(idea_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(path)
    data.setdefault("_meta", {})["status"] = "deferred"
    data["status"] = "deferred"
    if req.notiz:
        data["ceo_notiz"] = req.notiz
    data["deferred_at"] = datetime.utcnow().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
    logger.info("CEO deferred %s", idea_id)
    return {"status": "deferred", "idea_id": idea_id}

