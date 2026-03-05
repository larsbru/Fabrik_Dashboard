"""
Batch-Reanalyze Endpoint – wird in inbox.py eingefügt.
Nicht direkt importieren – nur als Vorlage für edit_block.
"""

# Batch-Status-Tracking
_batch_reanalyze: dict = {
    "status": "idle",   # idle | running | done | error
    "started_at": None,
    "finished_at": None,
    "total": 0,
    "done": 0,
    "failed": 0,
    "skipped": 0,
    "queue": [],        # Liste aller idea_ids im aktuellen Batch
    "current": None,    # Aktuell analysierte idea_id
    "errors": [],       # (idea_id, fehler) Tupel
}


def _needs_reanalysis(data: dict) -> bool:
    """True wenn diese Idee (neu) analysiert werden soll."""
    meta = data.get("_meta", {})
    zusammenfassung = data.get("zusammenfassung") or ""
    # Bereits mit Opus/Sonnet analysiert und kein Fehler → überspringen
    modell = meta.get("modell") or ""
    if "claude" in modell and "fehlgeschlagen" not in zusammenfassung:
        return False
    return True


def _run_batch_reanalyze(ideas_to_process: list[tuple[Path, Path]]):
    """Batch-Worker – läuft in eigenem Thread, max 2 parallel via Semaphore."""
    import threading
    global _batch_reanalyze

    _batch_reanalyze["status"] = "running"
    _batch_reanalyze["total"] = len(ideas_to_process)
    _batch_reanalyze["done"] = 0
    _batch_reanalyze["failed"] = 0
    _batch_reanalyze["errors"] = []

    # Semaphore: max 2 gleichzeitige Claude-Aufrufe (Rate-Limiting)
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
                        (idea_id, result.get("log", ["unbekannter Fehler"])[-1])
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
    logger.info(
        "Batch-Reanalyze abgeschlossen: %d/%d ok, %d Fehler",
        _batch_reanalyze["done"], _batch_reanalyze["total"], _batch_reanalyze["failed"]
    )
