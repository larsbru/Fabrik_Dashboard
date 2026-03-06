"""API routes for Inbox -> Backlog pipeline visualization."""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import threading
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
                "id": name,
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
                "betroffene_komponenten": data.get("betroffene_komponenten") or [],
                "notizen": data.get("notizen") or "",
                "ssot_relevanz": data.get("ssot_relevanz") or False,
                "analyse_ok": "Analyse fehlgeschlagen" not in (data.get("zusammenfassung") or "")
                              and meta.get("modell") not in ("PENDING-OPUS", None, ""),
                "dedup_empfehlung": gardener.get("dedup_ergebnis", {}).get("empfehlung") or "",
            })
        except Exception as e:
            logger.warning("Could not parse draft %s: %s", folder.name, e)
    return ideas


def _next_b_nummer() -> str:
    """Nächste freie B-Nummer aus backlog.md UND allen draft.yaml ermitteln."""
    nums = []
    # 1. Aus backlog.md
    if BACKLOG_PATH.exists():
        text = BACKLOG_PATH.read_text(encoding="utf-8")
        nums.extend(int(m) for m in re.findall(r'\bB(\d+)\b', text))
    # 2. Aus allen draft.yaml (verhindert Duplikate bei Batch-Approve)
    if INBOX_PROCESSED_DIR.exists():
        for draft in INBOX_PROCESSED_DIR.glob("*/draft.yaml"):
            try:
                with open(draft, encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                bn = data.get("b_nummer") or ""
                m = re.match(r'^B(\d+)$', str(bn))
                if m:
                    nums.append(int(m.group(1)))
            except Exception:
                continue
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



@router.post("/ideas/{idea_id}/reset")
async def reset_idea(idea_id: str):
    """CEO-Aktion: Entscheidung zurücksetzen → status=neu, b_nummer entfernt."""
    path = _idea_draft_path(idea_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(path)

    # Entscheidungs-Felder entfernen
    for key in ("status", "b_nummer", "begruendung", "ceo_notiz",
                "approved_at", "rejected_at", "deferred_at"):
        data.pop(key, None)

    # _meta.status zurücksetzen
    if "_meta" in data:
        data["_meta"]["status"] = "neu"

    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)

    logger.info("CEO reset decision for %s", idea_id)
    return {"status": "neu", "idea_id": idea_id}


# ── Reanalyze-Tracking (in-memory, kein persistenter State) ──────────────────
_reanalyze_running: dict[str, dict] = {}  # idea_id → {status, started_at, log}


def _container_to_host_path(container_path: Path) -> str:
    """Übersetzt Container-Pfad (/app/fabrik/...) in Host-Pfad (/Users/larsbruckschen/...)."""
    s = str(container_path)
    s = s.replace("/app/fabrik/DevFabrik/", "/Users/larsbruckschen/DevFabrik/")
    s = s.replace("/app/fabrik/Documents/DevFabrik/", "/Users/larsbruckschen/Documents/DevFabrik/")
    return s


ANALYZE_SERVER_URL = os.environ.get("ANALYZE_SERVER_URL", "http://192.168.44.10:9090")


def _run_reanalyze(idea_id: str, extracted_path: Path, draft_path: Path):
    """Startet analyze_inbox.py via lokalem HTTP-Service auf Host (Port 9090).
    
    Kein SSH mehr – inbox_analyze_server.py läuft als launchd-Service auf ai-brain-01
    und hat vollen Zugriff auf Claude Code CLI Auth (macOS Keychain).
    """
    _reanalyze_running[idea_id] = {
        "status": "running",
        "started_at": datetime.utcnow().isoformat(),
        "log": [],
    }

    # Pfade auf Host übersetzen (Volume: /app/fabrik/ → /Users/larsbruckschen/)
    host_extracted = _container_to_host_path(extracted_path)
    host_draft     = _container_to_host_path(draft_path)

    logs = []
    try:
        import urllib.request
        payload = json.dumps({
            "extracted_path": host_extracted,
            "draft_path": host_draft,
        }).encode()
        req = urllib.request.Request(
            f"{ANALYZE_SERVER_URL}/analyze",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=400) as resp:
            data = json.loads(resp.read())
        logs = data.get("log", [])
        if data.get("status") == "ok":
            _reanalyze_running[idea_id]["status"] = "done"
            logger.info("Reanalyze done for %s (via analyze-server)", idea_id)
        else:
            _reanalyze_running[idea_id]["status"] = "error"
            logger.warning("Reanalyze server error for %s: %s", idea_id, logs[-1] if logs else "?")
    except Exception as e:
        _reanalyze_running[idea_id]["status"] = "error"
        logs = [str(e)]
        logger.error("Reanalyze server call failed for %s: %s", idea_id, e)

    _reanalyze_running[idea_id]["log"] = logs
    _reanalyze_running[idea_id]["finished_at"] = datetime.utcnow().isoformat()


@router.post("/ideas/{idea_id}/reanalyze")
async def reanalyze_idea(idea_id: str):
    """Re-Analyse einer Idee via Opus (Hintergrund-Subprocess)."""
    folder = INBOX_PROCESSED_DIR / idea_id
    draft_path = folder / "draft.yaml"
    if not draft_path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")

    # Bereits laufend?
    existing = _reanalyze_running.get(idea_id, {})
    if existing.get("status") == "running":
        return {"status": "already_running", "idea_id": idea_id, "started_at": existing.get("started_at")}

    # extracted.md suchen
    extracted = folder / "extracted.md"
    if not extracted.exists():
        # Fallback: irgendeine .md-Datei im Ordner
        mds = list(folder.glob("*.md"))
        if not mds:
            raise HTTPException(status_code=422, detail="Keine extracted.md in diesem Inbox-Ordner")
        extracted = mds[0]

    logger.info("Starting reanalyze for %s (source: %s)", idea_id, extracted.name)

    t = threading.Thread(target=_run_reanalyze, args=(idea_id, extracted, draft_path), daemon=True)
    t.start()

    return {"status": "started", "idea_id": idea_id, "source": extracted.name}


@router.get("/ideas/{idea_id}/reanalyze-status")
async def reanalyze_status(idea_id: str):
    """Status einer laufenden oder abgeschlossenen Re-Analyse."""
    info = _reanalyze_running.get(idea_id)
    if not info:
        # Prüfe ob draft.yaml frisch analysiert (modell != PENDING-OPUS)
        draft_path = _idea_draft_path(idea_id)
        if draft_path.exists():
            data = _safe_yaml(draft_path)
            meta = data.get("_meta", {})
            return {
                "status": "idle",
                "idea_id": idea_id,
                "last_model": meta.get("modell"),
                "last_analysiert_am": meta.get("analysiert_am"),
            }
        return {"status": "idle", "idea_id": idea_id}
    return {"idea_id": idea_id, **info}


# ── Batch-Reanalyze ───────────────────────────────────────────────────────────

_batch_reanalyze: dict = {
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "total": 0,
    "done": 0,
    "failed": 0,
    "skipped": 0,
    "queue": [],
    "current": None,
    "errors": [],
}


def _needs_reanalysis(data: dict) -> bool:
    """True wenn diese Idee neu (mit Opus/Sonnet) analysiert werden soll."""
    meta = data.get("_meta", {})
    zusammenfassung = data.get("zusammenfassung") or ""
    modell = meta.get("modell") or ""
    # Bereits mit echtem Claude analysiert und kein Fehlertext → skip
    if "claude" in modell and "fehlgeschlagen" not in zusammenfassung:
        return False
    return True


def _run_batch_reanalyze(ideas_to_process: list):
    """Batch-Worker – max 2 parallele Claude-Aufrufe via Semaphore."""
    global _batch_reanalyze
    _batch_reanalyze["status"] = "running"
    _batch_reanalyze["total"] = len(ideas_to_process)
    _batch_reanalyze["done"] = 0
    _batch_reanalyze["failed"] = 0
    _batch_reanalyze["errors"] = []

    sem = threading.Semaphore(2)

    def process_one(idea_id: str, extracted: Path, draft_path: Path):
        with sem:
            _batch_reanalyze["current"] = idea_id
            try:
                _run_reanalyze(idea_id, extracted, draft_path)
                result = _reanalyze_running.get(idea_id, {})
                if result.get("status") == "done":
                    _batch_reanalyze["done"] += 1
                else:
                    _batch_reanalyze["failed"] += 1
                    _batch_reanalyze["errors"].append(
                        (idea_id, (result.get("log") or ["unbekannt"])[-1])
                    )
            except Exception as e:
                _batch_reanalyze["failed"] += 1
                _batch_reanalyze["errors"].append((idea_id, str(e)))

    threads = []
    for idea_id, extracted, draft_path in ideas_to_process:
        t = threading.Thread(target=process_one, args=(idea_id, extracted, draft_path), daemon=True)
        threads.append(t)
        t.start()
    for t in threads:
        t.join()

    _batch_reanalyze["status"] = "done"
    _batch_reanalyze["finished_at"] = datetime.utcnow().isoformat()
    _batch_reanalyze["current"] = None
    logger.info("Batch-Reanalyze: %d/%d ok, %d Fehler",
                _batch_reanalyze["done"], _batch_reanalyze["total"], _batch_reanalyze["failed"])


@router.post("/ideas/reanalyze-all")
async def reanalyze_all_ideas():
    """Alle Ideen mit Parse-Fehler oder Ollama-Analyse neu analysieren (Opus → Sonnet)."""
    global _batch_reanalyze
    if _batch_reanalyze.get("status") == "running":
        return {
            "status": "already_running",
            "current": _batch_reanalyze.get("current"),
            "done": _batch_reanalyze.get("done"),
            "total": _batch_reanalyze.get("total"),
        }

    to_process = []
    skipped = 0
    for folder in sorted(INBOX_PROCESSED_DIR.iterdir()):
        draft_path = folder / "draft.yaml"
        if not draft_path.exists():
            continue
        data = _safe_yaml(draft_path)
        if not data:
            continue
        if not _needs_reanalysis(data):
            skipped += 1
            continue
        extracted = folder / "extracted.md"
        if not extracted.exists():
            mds = list(folder.glob("*.md"))
            if not mds:
                skipped += 1
                continue
            extracted = mds[0]
        to_process.append((folder.name, extracted, draft_path))

    if not to_process:
        return {"status": "nothing_to_do", "skipped": skipped}

    _batch_reanalyze.update({
        "status": "starting",
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": None,
        "total": len(to_process),
        "done": 0, "failed": 0, "skipped": skipped,
        "queue": [t[0] for t in to_process],
        "current": None, "errors": [],
    })

    t = threading.Thread(target=_run_batch_reanalyze, args=(to_process,), daemon=True)
    t.start()

    logger.info("Batch-Reanalyze gestartet: %d Ideen, %d übersprungen", len(to_process), skipped)
    return {
        "status": "started",
        "total": len(to_process),
        "skipped": skipped,
        "queue": [t[0] for t in to_process],
    }


@router.get("/ideas/reanalyze-all/status")
async def reanalyze_all_status():
    """Status des laufenden oder letzten Batch-Reanalyze."""
    return {**_batch_reanalyze}



# ── Lifecycle & Briefing Endpoints (B56) ──────────────────────────────────────

BRIEFINGS_DIR = Path(os.environ.get("BRIEFINGS_DIR", "/app/fabrik/DevFabrik/management/briefings"))
PREP_DIR = Path(os.environ.get("PREP_DIR", "/app/fabrik/DevFabrik/management/prep"))


@router.get("/lifecycle")
async def get_lifecycle():
    """Aggregierter Status aller Items über alle 7 Lifecycle-Phasen."""
    phases = {
        "inbox": [],       # Phase 1: Dateien in ~/Documents/DevFabrik/inbox/
        "analyse": [],     # Phase 2: Analyse läuft
        "review": [],      # Phase 3: CEO-Review ausstehend
        "briefing": [],    # Phase 4+5: Stabschef-Briefing + CEO-Freigabe
        "umsetzung": [],   # Phase 6: Executor arbeitet
        "erledigt": [],    # Phase 7: Done
        "rejected": [],
        "deferred": [],
    }
    counts = {k: 0 for k in phases}

    # Phase 1: Inbox-Dateien
    if INBOX_DIR.exists():
        for f in sorted(INBOX_DIR.iterdir()):
            if f.suffix in (".md", ".txt", ".pdf") and not f.name.startswith("."):
                stat = f.stat()
                phases["inbox"].append({
                    "name": f.name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
                counts["inbox"] += 1

    # Phase 2-7: Alle draft.yaml durchgehen
    if INBOX_PROCESSED_DIR.exists():
        for folder in sorted(INBOX_PROCESSED_DIR.iterdir()):
            draft = folder / "draft.yaml"
            if not draft.exists():
                continue
            try:
                data = _safe_yaml(draft)
                if not data:
                    continue
                meta = data.get("_meta", {})
                stab = data.get("_stabschef", {})
                status = meta.get("status") or data.get("status") or "neu"
                name = folder.name
                m_date = re.match(r"^(\d{4}-\d{2}-\d{2})_(.*)", name)
                item = {
                    "id": name,
                    "titel": data.get("titel") or data.get("title") or name,
                    "status": status,
                    "b_nummer": data.get("b_nummer") or "",
                    "eingang": m_date.group(1) if m_date else "",
                    "kategorie": data.get("kategorie") or "",
                    "briefing_ref": stab.get("briefing_ref") or "",
                    "verdict": stab.get("verdict") or "",
                    "arbeitspakete": stab.get("arbeitspakete") or 0,
                    "has_briefing": bool(stab.get("briefing_ref")),
                    "analyse_ok": "fehlgeschlagen" not in (data.get("zusammenfassung") or ""),
                }

                # Tracking-Status laden (für Phase 5+6)
                tracking_status = "vorbereitet"
                idea_ref = stab.get("idea_ref") or ""
                if idea_ref:
                    tracking_path = PREP_DIR / idea_ref / "TRACKING.yaml"
                    if tracking_path.exists():
                        tracking = _safe_yaml(tracking_path)
                        tracking_status = tracking.get("status") or "vorbereitet"
                        item["tracking_status"] = tracking_status
                        item["aps_vorbereitet"] = tracking.get("arbeitspakete_vorbereitet") or 0
                        item["aps_erledigt"] = tracking.get("arbeitspakete_abgeschlossen") or 0
                        item["aps_total"] = tracking.get("arbeitspakete_total") or 0

                # Phase zuordnen
                if status == "rejected":
                    phases["rejected"].append(item)
                    counts["rejected"] += 1
                elif status == "deferred":
                    phases["deferred"].append(item)
                    counts["deferred"] += 1
                elif status in ("neu", "analysiert") and not item["has_briefing"]:
                    if not item["analyse_ok"]:
                        phases["analyse"].append(item)
                        counts["analyse"] += 1
                    else:
                        phases["review"].append(item)
                        counts["review"] += 1
                elif status == "approved" and item["has_briefing"]:
                    if tracking_status in ("erledigt",):
                        phases["erledigt"].append(item)
                        counts["erledigt"] += 1
                    elif tracking_status in ("freigegeben", "in_umsetzung", "review_ausstehend"):
                        phases["umsetzung"].append(item)
                        counts["umsetzung"] += 1
                    elif tracking_status in ("blocked",):
                        item["blocked"] = True
                        phases["umsetzung"].append(item)
                        counts["umsetzung"] += 1
                    else:
                        # vorbereitet oder pending → Briefing-Phase (CEO muss noch freigeben)
                        phases["briefing"].append(item)
                        counts["briefing"] += 1
                elif status == "approved" and not item["has_briefing"]:
                    # Approved aber Stabschef noch nicht gelaufen
                    phases["briefing"].append(item)
                    counts["briefing"] += 1
                else:
                    phases["review"].append(item)
                    counts["review"] += 1
            except Exception as e:
                logger.warning("Lifecycle parse error %s: %s", folder.name, e)

    return {"phases": phases, "counts": counts}


@router.get("/briefings/{idea_id}")
async def get_briefing(idea_id: str):
    """Briefing-YAML für eine Idee lesen."""
    # Finde briefing_ref aus draft.yaml
    draft_path = _idea_draft_path(idea_id)
    if not draft_path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(draft_path)
    stab = data.get("_stabschef", {})
    briefing_ref = stab.get("briefing_ref")
    if not briefing_ref:
        return {"status": "no_briefing", "idea_id": idea_id}

    briefing_path = BRIEFINGS_DIR / f"{briefing_ref}.yaml"
    if not briefing_path.exists():
        return {"status": "briefing_missing", "idea_id": idea_id, "ref": briefing_ref}

    briefing = _safe_yaml(briefing_path)

    # Tracking-Status laden
    idea_ref = stab.get("idea_ref") or ""
    tracking = {}
    if idea_ref:
        tracking_path = PREP_DIR / idea_ref / "TRACKING.yaml"
        if tracking_path.exists():
            tracking = _safe_yaml(tracking_path)

    return {
        "status": "ok",
        "idea_id": idea_id,
        "briefing": briefing,
        "tracking": tracking,
        "draft_status": data.get("status"),
    }


class ReleaseRequest(BaseModel):
    ceo_antworten: dict = {}  # Antworten auf CEO-Fragen


@router.post("/briefings/{idea_id}/release")
async def release_for_execution(idea_id: str, req: ReleaseRequest):
    """CEO gibt Briefing zur Umsetzung frei."""
    draft_path = _idea_draft_path(idea_id)
    if not draft_path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(draft_path)
    stab = data.get("_stabschef", {})
    idea_ref = stab.get("idea_ref")
    if not idea_ref:
        raise HTTPException(status_code=422, detail="Kein Stabschef-Briefing vorhanden")

    # TRACKING.yaml aktualisieren
    tracking_path = PREP_DIR / idea_ref / "TRACKING.yaml"
    if not tracking_path.exists():
        raise HTTPException(status_code=422, detail=f"Keine Prep-Dateien für {idea_ref}")
    tracking = _safe_yaml(tracking_path)
    tracking["status"] = "freigegeben"
    tracking["freigegeben_am"] = datetime.utcnow().isoformat()
    if req.ceo_antworten:
        tracking["ceo_antworten"] = req.ceo_antworten
    # Alle APs auf freigegeben setzen
    for ap_id, ap_status in tracking.get("paket_status", {}).items():
        if isinstance(ap_status, dict) and ap_status.get("status") == "vorbereitet":
            ap_status["status"] = "freigegeben"
    with open(tracking_path, "w", encoding="utf-8") as f:
        yaml.dump(tracking, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    logger.info("CEO released %s for execution", idea_id)
    return {"status": "freigegeben", "idea_id": idea_id, "idea_ref": idea_ref}


class AnswerRequest(BaseModel):
    frage_index: int
    antwort: str


@router.post("/briefings/{idea_id}/answer")
async def answer_ceo_question(idea_id: str, req: AnswerRequest):
    """CEO beantwortet eine offene Frage im Briefing."""
    draft_path = _idea_draft_path(idea_id)
    if not draft_path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(draft_path)
    stab = data.get("_stabschef", {})
    briefing_ref = stab.get("briefing_ref")
    if not briefing_ref:
        raise HTTPException(status_code=422, detail="Kein Briefing vorhanden")

    briefing_path = BRIEFINGS_DIR / f"{briefing_ref}.yaml"
    if not briefing_path.exists():
        raise HTTPException(status_code=404, detail=f"Briefing {briefing_ref} nicht gefunden")
    briefing = _safe_yaml(briefing_path)
    fragen = briefing.get("ceo_fragen") or []
    if req.frage_index >= len(fragen):
        raise HTTPException(status_code=422, detail=f"Frage-Index {req.frage_index} ungültig")
    fragen[req.frage_index]["ceo_antwort"] = req.antwort
    fragen[req.frage_index]["beantwortet_am"] = datetime.utcnow().isoformat()
    briefing["ceo_fragen"] = fragen
    with open(briefing_path, "w", encoding="utf-8") as f:
        yaml.dump(briefing, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
    logger.info("CEO answered question %d for %s", req.frage_index, idea_id)
    return {"status": "answered", "idea_id": idea_id, "frage_index": req.frage_index}


@router.post("/briefings/{idea_id}/hold")
async def hold_briefing(idea_id: str):
    """CEO stellt Briefing zurück (deferred nach Review)."""
    draft_path = _idea_draft_path(idea_id)
    if not draft_path.exists():
        raise HTTPException(status_code=404, detail=f"Draft für {idea_id} nicht gefunden")
    data = _safe_yaml(draft_path)
    data.setdefault("_meta", {})["status"] = "deferred"
    data["status"] = "deferred"
    data["deferred_at"] = datetime.utcnow().isoformat()
    with open(draft_path, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
    logger.info("CEO held briefing for %s", idea_id)
    return {"status": "deferred", "idea_id": idea_id}


@router.get("/executor/status")
async def get_executor_status():
    """Laufende Executor-Jobs (liest alle TRACKING.yaml mit status in_umsetzung)."""
    jobs = []
    if PREP_DIR.exists():
        for tracking_path in PREP_DIR.glob("*/TRACKING.yaml"):
            try:
                tracking = _safe_yaml(tracking_path)
                if tracking.get("status") in ("in_umsetzung", "freigegeben", "review_ausstehend"):
                    jobs.append({
                        "idea_ref": tracking.get("idea_ref") or tracking_path.parent.name,
                        "briefing_ref": tracking.get("briefing_ref") or "",
                        "status": tracking.get("status"),
                        "aps_total": tracking.get("arbeitspakete_total") or 0,
                        "aps_erledigt": tracking.get("arbeitspakete_abgeschlossen") or 0,
                        "naechstes_paket": tracking.get("naechstes_paket") or "",
                        "last_updated": tracking.get("last_updated") or "",
                    })
            except Exception:
                continue
    return {"jobs": jobs, "total": len(jobs)}
