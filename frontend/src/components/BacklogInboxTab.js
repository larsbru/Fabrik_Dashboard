import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Clock, Inbox, BookOpen, Check, X, Pause, AlertTriangle, Zap
} from 'lucide-react';

// ── Farben & Konstanten ───────────────────────────────────────────────────────

const PRIO_COLORS = {
  high: '#ef4444', medium: '#f59e0b', low: '#22c55e', done: '#4b5563',
};

const STATUS_CONFIG = {
  'neu':       { color: '#6b7280', icon: '🆕', label: 'Neu' },
  'analysiert':{ color: '#3b82f6', icon: '🔍', label: 'Analysiert' },
  'approved':  { color: '#22c55e', icon: '✅', label: 'Approved' },
  'rejected':  { color: '#ef4444', icon: '❌', label: 'Rejected' },
  'deferred':  { color: '#f59e0b', icon: '⏸',  label: 'Deferred' },
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function Badge({ text, color }) {
  return (
    <span style={{
      fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
      background: color + '22', color, border: `1px solid ${color}44`,
      fontWeight: 600,
    }}>
      {text}
    </span>
  );
}

// ── Backlog Epic-Baum ────────────────────────────────────────────────────────

function EpicItem({ item }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 24px',
      borderLeft: '2px solid #ffffff11', marginLeft: 8,
      opacity: item.obsolete ? 0.4 : 1,
    }}>
      {item.obsolete
        ? <CheckCircle2 size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
        : <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4b5563', flexShrink: 0 }} />
      }
      {item.id && (
        <span style={{ fontSize: '0.65rem', color: '#6b7280', fontFamily: 'monospace', flexShrink: 0 }}>
          {item.id}
        </span>
      )}
      <span style={{
        fontSize: '0.75rem', color: item.obsolete ? '#4b5563' : 'var(--text-primary, #e2e8f0)',
        textDecoration: item.obsolete ? 'line-through' : 'none',
      }}>
        {item.title}
      </span>
    </div>
  );
}

function BacklogSection({ section }) {
  const [open, setOpen] = useState(section.priority !== 'done');
  const active = section.items.filter(i => !i.obsolete);
  const done = section.items.filter(i => i.obsolete);
  const pct = section.items.length > 0 ? Math.round((done.length / section.items.length) * 100) : 0;
  const color = PRIO_COLORS[section.priority] || '#6b7280';

  return (
    <div style={{
      marginBottom: 6,
      border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 6,
      background: 'var(--bg-card, #141824)',
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{section.emoji}</span>
        <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #e2e8f0)' }}>
          {section.title}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{active.length} offen</span>
        {/* Progress bar */}
        {section.items.length > 0 && (
          <div style={{ width: 60, height: 4, background: '#ffffff11', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
          </div>
        )}
        <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>{pct}%</span>
        {open ? <ChevronDown size={12} style={{ color: '#6b7280' }} />
               : <ChevronRight size={12} style={{ color: '#6b7280' }} />}
      </button>
      {open && (
        <div style={{ paddingBottom: 6 }}>
          {active.map((item, i) => <EpicItem key={i} item={item} />)}
          {done.length > 0 && active.length === 0 && (
            <div style={{ padding: '4px 24px', fontSize: '0.7rem', color: '#22c55e' }}>Alle erledigt ✅</div>
          )}
          {done.length > 0 && active.length > 0 && (
            <div style={{ padding: '2px 24px', fontSize: '0.65rem', color: '#4b5563' }}>
              + {done.length} erledigte (versteckt)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inbox / IDEA-Karten ───────────────────────────────────────────────────────

const PRIO_STYLE = {
  hoch:    { bg: '#fee2e233', color: '#f87171', label: '🔴 Hoch' },
  mittel:  { bg: '#fef9c333', color: '#fbbf24', label: '🟡 Mittel' },
  niedrig: { bg: '#f0fdf433', color: '#4ade80', label: '🟢 Niedrig' },
};

function InfoRow({ label, value, color }) {
  if (!value || value === 'keiner' || value === 'false' || value === false) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0',
      borderBottom: '1px solid #ffffff08', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.65rem', color: '#6b7280', minWidth: 110, flexShrink: 0,
        textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: '0.75rem', color: color || '#c9d1d9', lineHeight: 1.4, flex: 1 }}>
        {value}
      </span>
    </div>
  );
}

function IdeaCard({ idea, onAction, actionLoading }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [reanalyzeStatus, setReanalyzeStatus] = useState(null); // null|'running'|'done'|'error'|'timeout'
  const { post, get } = useApi();
  const cfg = STATUS_CONFIG[idea.status] || STATUS_CONFIG['neu'];
  const isPending = idea.status === 'neu' || idea.status === 'analysiert';
  const prio = PRIO_STYLE[idea.prioritaet] || PRIO_STYLE['mittel'];

  const handleReanalyze = async (e) => {
    e.stopPropagation();
    setReanalyzeStatus('running');
    const res = await post(`/api/inbox/ideas/${idea.id}/reanalyze`, {});
    if (!res || res.error) {
      setReanalyzeStatus('error');
      return;
    }
    // Poll bis fertig
    const poll = setInterval(async () => {
      const s = await get(`/api/inbox/ideas/${idea.id}/reanalyze-status`);
      if (!s || s.status === 'running' || s.status === 'already_running') return;
      clearInterval(poll);
      setReanalyzeStatus(s.status === 'done' ? 'done' : 'error');
      // Nach kurzer Pause: onAction('refresh') triggern
      setTimeout(() => { onAction(idea.id, '_refresh', {}); setReanalyzeStatus(null); }, 1500);
    }, 3000);
    // Spätestens nach 5min aufhören
    setTimeout(() => { clearInterval(poll); if (reanalyzeStatus === 'running') setReanalyzeStatus('timeout'); }, 310000);
  };

  return (
    <div style={{
      background: 'var(--bg-card, #141824)',
      border: `1px solid ${cfg.color}33`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: 6, marginBottom: 8, overflow: 'hidden',
    }}>

      {/* ── Header (immer sichtbar, klickbar) ── */}
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex',
        flexDirection: 'column', gap: 4 }}
        onClick={() => !showReject && setExpanded(v => !v)}>

        {/* Zeile 1: Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.8rem' }}>{cfg.icon}</span>
          <span style={{ fontSize: '0.65rem', color: '#4b5563', flexShrink: 0 }}>
            {idea.eingang?.slice(0, 10) || ''}
          </span>
          <Badge text={cfg.label} color={cfg.color} />
          {idea.prioritaet && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px',
              borderRadius: 4, background: prio.bg, color: prio.color }}>
              {prio.label}
            </span>
          )}
          {idea.kategorie && <Badge text={idea.kategorie} color="#8b5cf6" />}
          {idea.b_nummer && <Badge text={idea.b_nummer} color="#3b82f6" />}
          {idea.ssot_relevanz === true && <Badge text="SSOT" color="#f59e0b" />}
          {!idea.analyse_ok && <Badge text="⚠ re-analyse läuft" color="#6b7280" />}
          <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={12} style={{ color: '#6b7280' }} />
                      : <ChevronRight size={12} style={{ color: '#6b7280' }} />}
          </span>
        </div>

        {/* Zeile 2: Titel */}
        <div style={{ fontSize: '0.85rem', fontWeight: 600,
          color: 'var(--text-primary, #e2e8f0)', lineHeight: 1.3 }}>
          {idea.titel}
        </div>

        {/* Zeile 3: Zusammenfassung (immer sichtbar – kurz) */}
        {idea.beschreibung && !idea.beschreibung.includes('fehlgeschlagen') && (
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {idea.beschreibung}
          </div>
        )}
      </div>

      {/* ── Ausgeklappte Detailansicht (Entscheidungsvorlage) ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff11', padding: '10px 12px' }}
          onClick={e => e.stopPropagation()}>

          {/* Volltext Zusammenfassung */}
          {idea.beschreibung && !idea.beschreibung.includes('fehlgeschlagen') && (
            <div style={{ marginBottom: 10, padding: '8px 10px',
              background: '#0f172a', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 4 }}>Zusammenfassung (Opus)</div>
              <div style={{ fontSize: '0.78rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                {idea.beschreibung}
              </div>
            </div>
          )}

          {/* Strukturierte Fakten */}
          <div style={{ marginBottom: 10 }}>
            <InfoRow label="Vorgeschlagene Aktion" value={idea.vorgeschlagene_aktion} color="#93c5fd" />
            <InfoRow label="Bezug zu Backlog" value={idea.bezug_zu_backlog} color="#86efac" />
            <InfoRow label="SSOT-Relevant" value={idea.ssot_relevanz === true ? 'Ja – betrifft Fabrik-Architektur' : null} color="#fbbf24" />
            <InfoRow label="Komponenten" value={idea.betroffene_komponenten?.join(', ')} color="#c4b5fd" />
            <InfoRow label="Dedup-Check" value={idea.dedup_empfehlung} color="#94a3b8" />
            {idea.notizen && idea.notizen.trim() && !idea.notizen.includes('Parse-Fehler') && (
              <InfoRow label="Notizen / Risiken" value={idea.notizen} color="#fca5a5" />
            )}
          </div>

          {/* Analyse-Warnung + Re-Analyse-Button */}
          {!idea.analyse_ok && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginBottom: 6,
                padding: '6px 10px', background: '#fbbf2411', borderRadius: 5,
                border: '1px solid #fbbf2433' }}>
                ⏳ Analyse unvollständig oder fehlgeschlagen.
              </div>
              <button
                onClick={handleReanalyze}
                disabled={reanalyzeStatus === 'running'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: '0.75rem', fontWeight: 600,
                  color: reanalyzeStatus === 'done' ? '#22c55e' : reanalyzeStatus === 'error' ? '#ef4444' : '#6366f1',
                  padding: '5px 12px', borderRadius: 5,
                  border: `1px solid ${reanalyzeStatus === 'done' ? '#22c55e44' : reanalyzeStatus === 'error' ? '#ef444444' : '#6366f144'}`,
                  background: reanalyzeStatus === 'done' ? '#22c55e11' : reanalyzeStatus === 'error' ? '#ef444411' : '#6366f111',
                  cursor: reanalyzeStatus === 'running' ? 'wait' : 'pointer',
                  opacity: reanalyzeStatus === 'running' ? 0.7 : 1,
                }}
              >
                {reanalyzeStatus === 'running' && <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />}
                {reanalyzeStatus === 'done' && '✅'}
                {reanalyzeStatus === 'error' && '❌'}
                {reanalyzeStatus === 'timeout' && '⏱'}
                {!reanalyzeStatus && <RefreshCw size={11} />}
                {reanalyzeStatus === 'running' ? 'Opus analysiert… (bis 5min)' :
                 reanalyzeStatus === 'done' ? 'Fertig! Wird aktualisiert…' :
                 reanalyzeStatus === 'error' ? 'Fehler – nochmal versuchen?' :
                 reanalyzeStatus === 'timeout' ? 'Timeout – nochmal versuchen?' :
                 'Neu analysieren (Opus)'}
              </button>
            </div>
          )}

          {/* Bereits entschieden */}
          {!isPending && (
            <div style={{ paddingTop: 6, borderTop: '1px solid #ffffff11' }}>
              <div style={{ fontSize: '0.72rem', padding: '6px 10px', borderRadius: 5,
                background: cfg.color + '11', color: cfg.color,
                border: `1px solid ${cfg.color}33`, marginBottom: 8 }}>
                {cfg.icon} {cfg.label}
                {idea.b_nummer && ` → ${idea.b_nummer}`}
                {idea.begruendung && ` — ${idea.begruendung}`}
              </div>
              <button onClick={() => onAction(idea.id, 'reset', {})}
                disabled={actionLoading === idea.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.75rem', color: '#6b7280', padding: '5px 12px',
                  borderRadius: 5, border: '1px solid #ffffff22',
                  background: 'transparent', cursor: 'pointer',
                  opacity: actionLoading === idea.id ? 0.5 : 1 }}>
                ↩ Entscheidung zurücksetzen
              </button>
            </div>
          )}

          {/* CEO-Aktionen */}
          {isPending && !showReject && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6,
              borderTop: '1px solid #ffffff11' }}>
              <button onClick={() => onAction(idea.id, 'approve', {})}
                disabled={actionLoading === idea.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.78rem', fontWeight: 600, color: '#22c55e',
                  padding: '6px 14px', borderRadius: 5,
                  border: '1px solid #22c55e44', background: '#22c55e11',
                  cursor: 'pointer', opacity: actionLoading === idea.id ? 0.5 : 1 }}>
                <Check size={12} /> Approve
              </button>
              <button onClick={() => setShowReject(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.78rem', fontWeight: 600, color: '#ef4444',
                  padding: '6px 14px', borderRadius: 5,
                  border: '1px solid #ef444444', background: '#ef444411',
                  cursor: 'pointer' }}>
                <X size={12} /> Reject
              </button>
              <button onClick={() => onAction(idea.id, 'defer', {})}
                disabled={actionLoading === idea.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.78rem', fontWeight: 600, color: '#f59e0b',
                  padding: '6px 14px', borderRadius: 5,
                  border: '1px solid #f59e0b44', background: '#f59e0b11',
                  cursor: 'pointer', opacity: actionLoading === idea.id ? 0.5 : 1 }}>
                <Pause size={12} /> Defer
              </button>
            </div>
          )}

          {/* Reject-Formular */}
          {showReject && (
            <div style={{ paddingTop: 6, borderTop: '1px solid #ffffff11' }}>
              <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6 }}>
                Begründung für Ablehnung:
              </div>
              <input autoFocus placeholder="z.B. bereits in B22 abgedeckt, zu früh, nicht relevant..."
                value={rejectText} onChange={e => setRejectText(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 5, fontSize: '0.78rem',
                  background: '#0f172a', border: '1px solid #ef444444', color: '#e2e8f0',
                  outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { onAction(idea.id, 'reject', { begruendung: rejectText }); setShowReject(false); }}
                  style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ef4444',
                    padding: '5px 12px', borderRadius: 5,
                    border: '1px solid #ef444444', background: '#ef444411', cursor: 'pointer' }}>
                  Ablehnen bestätigen
                </button>
                <button onClick={() => setShowReject(false)}
                  style={{ fontSize: '0.78rem', color: '#6b7280',
                    padding: '5px 12px', borderRadius: 5,
                    border: '1px solid #ffffff22', background: 'transparent', cursor: 'pointer' }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

function IdeaSection({ title, icon, color, ideas, defaultOpen, onAction, actionLoading }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
      {/* Sektion-Header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          borderRadius: 6, cursor: 'pointer', userSelect: 'none',
          background: color + '0d', border: `1px solid ${color}22`,
          marginBottom: open ? 8 : 0,
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{icon}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          {title}
        </span>
        <span style={{
          fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10,
          background: color + '22', color, fontWeight: 700,
        }}>
          {ideas.length}
        </span>
        {open
          ? <ChevronDown size={13} style={{ color, flexShrink: 0 }} />
          : <ChevronRight size={13} style={{ color: '#4b5563', flexShrink: 0 }} />
        }
      </div>
      {/* Inhalt */}
      {open && (
        ideas.length === 0
          ? <div style={{ padding: '8px 12px', fontSize: '0.72rem', color: '#4b5563',
              border: '1px dashed #ffffff08', borderRadius: 5 }}>
              Keine Einträge
            </div>
          : ideas.map(idea => (
              <IdeaCard key={idea.id} idea={idea} onAction={onAction} actionLoading={actionLoading} />
            ))
      )}
    </div>
  );
}

function BacklogInboxTab() {
  const { get, post } = useApi();
  const [overview, setOverview] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ideas');
  const [actionLoading, setActionLoading] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [archivOpen, setArchivOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState(null); // null | {status, done, total, current}

  const fetchAll = useCallback(async () => {
    const [ov, id] = await Promise.all([
      get('/api/inbox/overview'),
      get('/api/inbox/ideas'),
    ]);
    if (ov) setOverview(ov);
    if (id) setIdeas(id.ideas || []);
    setLoading(false);
  }, [get]);

  // Erster Load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-Refresh alle 5 Sekunden (kein loading-Flicker — silent update)
  useEffect(() => {
    const iv = setInterval(async () => {
      const [ov, id] = await Promise.all([
        get('/api/inbox/overview'),
        get('/api/inbox/ideas'),
      ]);
      if (ov) setOverview(ov);
      if (id) setIdeas(id.ideas || []);
      // Batch-Status pollen wenn laufend
      if (batchStatus?.status === 'running' || batchStatus?.status === 'starting') {
        const bs = await get('/api/inbox/ideas/reanalyze-all/status');
        if (bs) setBatchStatus(bs);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [get, batchStatus]);

  const handleBatchReanalyze = useCallback(async () => {
    setBatchStatus({ status: 'starting', done: 0, total: 0, current: null });
    try {
      const data = await post('/api/inbox/ideas/reanalyze-all', {});
      if (data) setBatchStatus(data);
    } catch (e) {
      setBatchStatus({ status: 'error', error: e.message });
    }
  }, [post]);

  const handleAction = useCallback(async (ideaId, action, body) => {
    if (action === '_refresh') { await fetchAll(); return; }
    setActionLoading(ideaId);

    // Optimistisches Update: Status sofort im lokalen State ändern
    const optimisticStatus = action === 'approve' ? 'approved'
                           : action === 'reject'  ? 'rejected'
                           : action === 'defer'   ? 'deferred'
                           : action === 'reset'   ? 'neu'
                           : null;
    if (optimisticStatus) {
      setIdeas(prev => prev.map(i =>
        i.id === ideaId ? { ...i, status: optimisticStatus } : i
      ));
    }

    try {
      const data = await post(`/api/inbox/ideas/${ideaId}/${action}`, body);
      if (data?.error) {
        setFeedback({ type: 'error', msg: data.error });
        // Rollback bei Fehler
        await fetchAll();
      } else {
        const actionLabel = action === 'approve' ? '✅ Approved'
                          : action === 'reject'  ? '❌ Rejected'
                          : action === 'defer'   ? '⏸ Deferred'
                          : action === 'reset'   ? '↩ Zurückgesetzt' : action;
        setFeedback({ type: 'success', msg: actionLabel });
        // Hintergrund-Sync für B-Nummer etc.
        setTimeout(() => fetchAll(), 800);
      }
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message });
      await fetchAll();
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [post, fetchAll]);

  const backlogSections = overview?.backlog?.sections || [];
  const stats = overview?.stats || {};
  const pendingIdeas   = ideas.filter(i => i.status === 'neu' || i.status === 'analysiert');
  const approvedIdeas  = ideas.filter(i => i.status === 'approved');
  const otherIdeas     = ideas.filter(i => i.status === 'rejected' || i.status === 'deferred');

  const tabs = [
    { id: 'ideas',   label: 'Ideen',   count: pendingIdeas.length, icon: Zap },
    { id: 'backlog', label: 'Backlog', count: stats.backlog_items || 0, icon: BookOpen },
  ];

  return (
    <div style={{ padding: '0 0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--border-color, #1e2435)', flexShrink: 0,
      }}>
        <BookOpen size={16} style={{ color: '#8b5cf6' }} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary, #e2e8f0)' }}>
          Backlog & Inbox
        </h3>

        {/* Stats-Pills */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
          {stats.backlog_high > 0 && <Badge text={`🔴 ${stats.backlog_high}`} color="#ef4444" />}
          {stats.backlog_medium > 0 && <Badge text={`🟡 ${stats.backlog_medium}`} color="#f59e0b" />}
          {pendingIdeas.length > 0 && <Badge text={`📥 ${pendingIdeas.length} neu`} color="#6366f1" />}
        </div>

        {feedback && (
          <span style={{
            fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
            background: feedback.type === 'success' ? '#22c55e22' : '#ef444422',
            color: feedback.type === 'success' ? '#22c55e' : '#ef4444',
            border: `1px solid ${feedback.type === 'success' ? '#22c55e44' : '#ef444444'}`,
          }}>
            {feedback.msg}
          </span>
        )}

        <button
          onClick={fetchAll}
          disabled={loading}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            background: '#8b5cf611', color: '#8b5cf6',
            border: '1px solid #8b5cf644', fontSize: '0.7rem',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>

        {/* Batch-Reanalyze Button */}
        {activeTab === 'ideas' && (
          <button
            onClick={handleBatchReanalyze}
            disabled={batchStatus?.status === 'running' || batchStatus?.status === 'starting'}
            title="Alle Ideen ohne Opus-Analyse neu analysieren (Opus → Sonnet, max 2 parallel)"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: batchStatus?.status === 'done' ? '#22c55e11' : batchStatus?.status === 'error' ? '#ef444411' : '#f59e0b11',
              color: batchStatus?.status === 'done' ? '#22c55e' : batchStatus?.status === 'error' ? '#ef4444' : '#f59e0b',
              border: `1px solid ${batchStatus?.status === 'done' ? '#22c55e44' : batchStatus?.status === 'error' ? '#ef444444' : '#f59e0b44'}`,
              fontSize: '0.7rem',
              opacity: (batchStatus?.status === 'running' || batchStatus?.status === 'starting') ? 0.6 : 1,
            }}
          >
            <RefreshCw size={11} style={{
              animation: (batchStatus?.status === 'running' || batchStatus?.status === 'starting') ? 'spin 1s linear infinite' : 'none'
            }} />
            {batchStatus?.status === 'running'
              ? `Opus… ${batchStatus.done || 0}/${batchStatus.total || '?'}`
              : batchStatus?.status === 'done'
              ? `✅ ${batchStatus.done}/${batchStatus.total} analysiert`
              : batchStatus?.status === 'error'
              ? '❌ Fehler'
              : batchStatus?.status === 'nothing_to_do'
              ? '✅ Alle analysiert'
              : 'Alle analysieren (Opus)'}
          </button>
        )}
      </div>

      {/* Tab-Leiste */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 16px 0',
        borderBottom: '1px solid var(--border-color, #1e2435)', flexShrink: 0,
      }}>
        {tabs.map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: '6px 6px 0 0', cursor: 'pointer',
              background: activeTab === id ? 'var(--bg-card, #141824)' : 'transparent',
              border: '1px solid ' + (activeTab === id ? 'var(--border-color, #1e2435)' : 'transparent'),
              borderBottom: activeTab === id ? '1px solid var(--bg-card, #141824)' : '1px solid transparent',
              color: activeTab === id ? 'var(--text-primary, #e2e8f0)' : '#6b7280',
              fontSize: '0.75rem', fontWeight: activeTab === id ? 700 : 400,
              marginBottom: -1,
            }}
          >
            <Icon size={13} />
            {label}
            <span style={{
              fontSize: '0.65rem', padding: '0 4px', borderRadius: 8,
              background: '#ffffff11', color: '#9ca3af',
            }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading && !overview ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Lade...</div>
        ) : (
          <>
            {/* BACKLOG */}
            {activeTab === 'backlog' && (
              <div>
                {backlogSections.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>Backlog leer oder nicht erreichbar.</div>
                ) : (
                  backlogSections.map((section, i) => (
                    <BacklogSection key={i} section={section} />
                  ))
                )}
              </div>
            )}

            {/* INBOX (wartende .md Dateien) */}
            {activeTab === 'inbox' && (
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 10 }}>
                  Dateien in ~/Documents/DevFabrik/inbox/ (noch nicht analysiert)
                </div>
                {(overview?.pending_inbox || []).length === 0 ? (
                  <div style={{
                    padding: 20, textAlign: 'center', color: '#4b5563',
                    border: '1px dashed #ffffff11', borderRadius: 6,
                  }}>
                    <Inbox size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <div style={{ fontSize: '0.8rem' }}>Inbox leer ✓</div>
                  </div>
                ) : (
                  (overview?.pending_inbox || []).map(f => (
                    <div key={f.name} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', marginBottom: 4, borderRadius: 5,
                      background: 'var(--bg-card, #141824)',
                      border: '1px solid #6366f133',
                    }}>
                      <span style={{ fontSize: '0.9rem' }}>📄</span>
                      <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary, #e2e8f0)' }}>
                        {f.name}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>
                        {Math.round(f.size / 1024)} KB
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>
                        {f.modified?.slice(0, 10)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* IDEAS (IDEA-YAMLs) */}
            {activeTab === 'ideas' && (
              <div>
                {ideas.length === 0 ? (
                  <div style={{
                    padding: 20, textAlign: 'center', color: '#4b5563',
                    border: '1px dashed #ffffff11', borderRadius: 6,
                  }}>
                    <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                    <div style={{ fontSize: '0.8rem' }}>Keine IDEA-YAMLs in inbox_processed/</div>
                  </div>
                ) : (
                  <>
                    {/* ── CEO-REVIEW Sektion ── */}
                    <IdeaSection
                      title="Ausstehend – CEO-Review"
                      icon="🆕"
                      color="#6366f1"
                      ideas={pendingIdeas}
                      defaultOpen={true}
                      onAction={handleAction}
                      actionLoading={actionLoading}
                    />

                    {/* ── APPROVED Sektion ── */}
                    <IdeaSection
                      title="Approved – In Backlog aufnehmen"
                      icon="✅"
                      color="#22c55e"
                      ideas={approvedIdeas}
                      defaultOpen={approvedIdeas.length > 0}
                      onAction={handleAction}
                      actionLoading={actionLoading}
                    />

                    {/* ── REJECTED Sektion ── */}
                    <IdeaSection
                      title="Rejected"
                      icon="❌"
                      color="#ef4444"
                      ideas={ideas.filter(i => i.status === 'rejected')}
                      defaultOpen={false}
                      onAction={handleAction}
                      actionLoading={actionLoading}
                    />

                    {/* ── DEFERRED Sektion ── */}
                    <IdeaSection
                      title="Deferred – Später entscheiden"
                      icon="⏸"
                      color="#f59e0b"
                      ideas={ideas.filter(i => i.status === 'deferred')}
                      defaultOpen={false}
                      onAction={handleAction}
                      actionLoading={actionLoading}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default BacklogInboxTab;
