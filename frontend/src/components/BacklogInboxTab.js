import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  RefreshCw, ChevronDown, ChevronRight, CheckCircle2,
  Check, X, Pause, Zap, FileText, Search, Eye,
  Settings, Archive, RotateCcw, Send, MessageSquare, Play, Shield
} from 'lucide-react';

// ── Farben & Konstanten ─────────────────────────────────────────────────

const VERDICT_STYLE = {
  machbar:                    { bg: '#22c55e22', color: '#22c55e', icon: '🟢', label: 'Machbar' },
  machbar_mit_einschraenkungen: { bg: '#f59e0b22', color: '#f59e0b', icon: '🟡', label: 'Machbar (Einschr.)' },
  nicht_machbar:              { bg: '#ef444422', color: '#ef4444', icon: '🔴', label: 'Nicht machbar' },
  unklar:                     { bg: '#6b728022', color: '#6b7280', icon: '⚪', label: 'Unklar' },
};

const AUTONOMY_STYLE = {
  full:         { color: '#22c55e', label: 'Autonom', icon: '🤖' },
  ceo_review:   { color: '#3b82f6', label: 'CEO-Review', icon: '👁' },
  ceo_decision: { color: '#f59e0b', label: 'CEO-Entscheid', icon: '⚠️' },
};

function Badge({ text, color }) {
  return (
    <span style={{
      fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
      background: color + '22', color, border: `1px solid ${color}44`,
      fontWeight: 600,
    }}>{text}</span>
  );
}

// ── Zähler-Leiste ───────────────────────────────────────────────────────

function CounterBar({ counts }) {
  const items = [
    { key: 'inbox',     icon: '📥', label: 'Inbox',     color: '#6366f1' },
    { key: 'analyse',   icon: '🔍', label: 'Analyse',   color: '#8b5cf6' },
    { key: 'review',    icon: '🆕', label: 'Review',    color: '#3b82f6' },
    { key: 'briefing',  icon: '📋', label: 'Briefing',  color: '#f59e0b' },
    { key: 'umsetzung', icon: '⚙️', label: 'Umsetzung', color: '#22c55e' },
    { key: 'erledigt',  icon: '✅', label: 'Erledigt',  color: '#4b5563' },
  ];
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px',
      background: '#0f172a', borderRadius: 8, marginBottom: 12,
      border: '1px solid #ffffff0d',
    }}>
      {items.map((it, i) => (
        <React.Fragment key={it.key}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
            borderRadius: 6, background: (counts[it.key] || 0) > 0 ? it.color + '15' : 'transparent',
            border: `1px solid ${(counts[it.key] || 0) > 0 ? it.color + '33' : '#ffffff08'}`,
          }}>
            <span style={{ fontSize: '0.75rem' }}>{it.icon}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: it.color }}>
              {counts[it.key] || 0}
            </span>
          </div>
          {i < items.length - 1 && (
            <span style={{ color: '#ffffff15', fontSize: '0.7rem', alignSelf: 'center' }}>→</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Kollabierbare Sektion ───────────────────────────────────────────────

function LifecycleSection({ title, icon, color, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10 }}>
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
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase',
          letterSpacing: '0.05em', flex: 1 }}>{title}</span>
        <span style={{
          fontSize: '0.65rem', padding: '1px 7px', borderRadius: 10,
          background: color + '22', color, fontWeight: 700,
        }}>{count}</span>
        {open ? <ChevronDown size={13} style={{ color }} />
              : <ChevronRight size={13} style={{ color: '#4b5563' }} />}
      </div>
      {open && (
        count === 0
          ? <div style={{ padding: '8px 12px', fontSize: '0.72rem', color: '#4b5563',
              border: '1px dashed #ffffff08', borderRadius: 5 }}>Keine Einträge</div>
          : <div>{children}</div>
      )}
    </div>
  );
}

// ── Inbox-Datei-Karte (Phase 1) ────────────────────────────────────────

function InboxFileCard({ file }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      marginBottom: 4, borderRadius: 5, background: 'var(--bg-card, #141824)',
      border: '1px solid #6366f133',
    }}>
      <FileText size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary, #e2e8f0)' }}>
        {file.name}
      </span>
      <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>
        {Math.round(file.size / 1024)} KB
      </span>
    </div>
  );
}

// ── Review-Karte (Phase 3, CEO-Entscheidung) ───────────────────────────

function ReviewCard({ item, onAction, actionLoading }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [showReject, setShowReject] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-card, #141824)', borderRadius: 6, marginBottom: 8,
      border: '1px solid #3b82f633', borderLeft: '3px solid #3b82f6',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex',
        flexDirection: 'column', gap: 4 }}
        onClick={() => !showReject && setExpanded(v => !v)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>{item.eingang}</span>
          {item.kategorie && <Badge text={item.kategorie} color="#8b5cf6" />}
          <span style={{ marginLeft: 'auto' }}>
            {expanded ? <ChevronDown size={12} style={{ color: '#6b7280' }} />
                      : <ChevronRight size={12} style={{ color: '#6b7280' }} />}
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600,
          color: 'var(--text-primary, #e2e8f0)', lineHeight: 1.3 }}>{item.titel}</div>
      </div>

      {/* Expanded: CEO-Aktionen */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff11', padding: '10px 12px' }}
          onClick={e => e.stopPropagation()}>
          {!showReject && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => onAction(item.id, 'approve', {})}
                disabled={actionLoading === item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.78rem', fontWeight: 600, color: '#22c55e',
                  padding: '6px 14px', borderRadius: 5,
                  border: '1px solid #22c55e44', background: '#22c55e11',
                  cursor: 'pointer', opacity: actionLoading === item.id ? 0.5 : 1 }}>
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
              <button onClick={() => onAction(item.id, 'defer', {})}
                disabled={actionLoading === item.id}
                style={{ display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: '0.78rem', fontWeight: 600, color: '#f59e0b',
                  padding: '6px 14px', borderRadius: 5,
                  border: '1px solid #f59e0b44', background: '#f59e0b11',
                  cursor: 'pointer', opacity: actionLoading === item.id ? 0.5 : 1 }}>
                <Pause size={12} /> Defer
              </button>
            </div>
          )}
          {showReject && (
            <div>
              <input autoFocus placeholder="Begründung..."
                value={rejectText} onChange={e => setRejectText(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 5, fontSize: '0.78rem',
                  background: '#0f172a', border: '1px solid #ef444444', color: '#e2e8f0',
                  outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { onAction(item.id, 'reject', { begruendung: rejectText }); setShowReject(false); }}
                  style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ef4444',
                    padding: '5px 12px', borderRadius: 5,
                    border: '1px solid #ef444444', background: '#ef444411', cursor: 'pointer' }}>
                  Bestätigen
                </button>
                <button onClick={() => setShowReject(false)}
                  style={{ fontSize: '0.78rem', color: '#6b7280', padding: '5px 12px',
                    borderRadius: 5, border: '1px solid #ffffff22', background: 'transparent',
                    cursor: 'pointer' }}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Briefing-Karte (Phase 4+5) ─────────────────────────────────────────

function BriefingCard({ item, onRelease, onHold, onAnswer, actionLoading }) {
  const [expanded, setExpanded] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [answers, setAnswers] = useState({});
  const [savingAnswer, setSavingAnswer] = useState(null); // welcher frage_index gerade speichert
  const { get } = useApi();

  const loadBriefing = useCallback(async (forceRefresh = false) => {
    if ((!forceRefresh && briefing) || loadingBriefing) return;
    setLoadingBriefing(true);
    const data = await get(`/api/inbox/briefings/${item.id}`);
    if (data?.status === 'ok') setBriefing(data);
    setLoadingBriefing(false);
  }, [item.id, briefing, loadingBriefing, get]);

  useEffect(() => {
    if (expanded && !briefing) loadBriefing();
  }, [expanded, briefing, loadBriefing]);

  const verdict = briefing?.briefing?.verdict || item.verdict || '';
  const vs = VERDICT_STYLE[verdict] || VERDICT_STYLE['unklar'];
  const aps = briefing?.briefing?.arbeitspakete || [];
  const fragen = briefing?.briefing?.ceo_fragen || [];
  const allQuestionsAnswered = fragen.every(f => f.ceo_antwort);

  return (
    <div style={{
      background: 'var(--bg-card, #141824)', borderRadius: 6, marginBottom: 8,
      border: `1px solid ${vs.color}33`, borderLeft: `3px solid ${vs.color}`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex',
        flexDirection: 'column', gap: 4 }}
        onClick={() => setExpanded(v => !v)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.8rem' }}>{vs.icon}</span>
          {item.b_nummer && <Badge text={item.b_nummer} color="#3b82f6" />}
          <Badge text={vs.label} color={vs.color} />
          {item.arbeitspakete > 0 && <Badge text={`${item.arbeitspakete} APs`} color="#8b5cf6" />}
          <span style={{ marginLeft: 'auto' }}>
            {expanded ? <ChevronDown size={12} style={{ color: '#6b7280' }} />
                      : <ChevronRight size={12} style={{ color: '#6b7280' }} />}
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600,
          color: 'var(--text-primary, #e2e8f0)', lineHeight: 1.3 }}>{item.titel}</div>
      </div>

      {/* Expanded: Briefing-Details */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff11', padding: '10px 12px' }}>
          {loadingBriefing && <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>Lade Briefing...</div>}

          {briefing && (
            <>
              {/* Zusammenfassung */}
              {briefing.briefing?.zusammenfassung && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: '#0f172a',
                  borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 4 }}>Stabschef-Analyse</div>
                  <div style={{ fontSize: '0.75rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                    {briefing.briefing.zusammenfassung}
                  </div>
                </div>
              )}

              {/* Einschränkungen */}
              {briefing.briefing?.einschraenkungen?.length > 0 && (
                <div style={{ marginBottom: 10, padding: '8px 10px', background: '#0f172a',
                  borderRadius: 6, borderLeft: '3px solid #f59e0b' }}>
                  <div style={{ fontSize: '0.6rem', color: '#f59e0b', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 4 }}>Einschränkungen</div>
                  {briefing.briefing.einschraenkungen.map((e, i) => (
                    <div key={i} style={{ fontSize: '0.72rem', color: '#fbbf24', lineHeight: 1.4,
                      padding: '2px 0' }}>• {e}</div>
                  ))}
                </div>
              )}

              {/* Arbeitspakete */}
              {aps.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 6 }}>Arbeitspakete ({aps.length})</div>
                  {aps.map(ap => {
                    const auto = AUTONOMY_STYLE[ap.autonomy] || AUTONOMY_STYLE['full'];
                    return (
                      <div key={ap.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 8px', marginBottom: 4, borderRadius: 5,
                        background: '#ffffff05', border: '1px solid #ffffff08',
                      }}>
                        <span style={{ fontSize: '0.7rem', flexShrink: 0 }}>{auto.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--text-primary, #e2e8f0)' }}>{ap.id}: {ap.titel}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <Badge text={auto.label} color={auto.color} />
                            {ap.aufwand && <Badge text={ap.aufwand} color="#6b7280" />}
                          </div>
                          {ap.frage && (
                            <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: 3 }}>
                              ⚠️ {ap.frage}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CEO-Fragen */}
              {fragen.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.6rem', color: '#6b7280', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 6 }}>
                    CEO-Fragen ({fragen.filter(f => f.ceo_antwort).length}/{fragen.length} beantwortet)
                  </div>
                  {fragen.map((f, i) => (
                    <div key={i} style={{
                      padding: '8px 10px', marginBottom: 6, borderRadius: 5,
                      background: f.ceo_antwort ? '#22c55e08' : '#f59e0b08',
                      border: `1px solid ${f.ceo_antwort ? '#22c55e22' : '#f59e0b22'}`,
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600,
                        color: 'var(--text-primary, #e2e8f0)', marginBottom: 4 }}>
                        {f.ceo_antwort ? '✅' : '❓'} {f.frage}
                      </div>
                      {f.empfehlung && (
                        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: 4 }}>
                          💡 Empfehlung: {f.empfehlung}
                        </div>
                      )}
                      {f.ceo_antwort ? (
                        <div style={{ fontSize: '0.72rem', color: '#22c55e', padding: '4px 8px',
                          background: '#22c55e11', borderRadius: 4 }}>
                          → {f.ceo_antwort}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input
                            placeholder="Antwort eingeben..."
                            value={answers[i] || ''}
                            onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: '0.72rem',
                              background: '#0f172a', border: '1px solid #ffffff22', color: '#e2e8f0',
                              outline: 'none', boxSizing: 'border-box' }}
                          />
                          <button
                            onClick={async () => {
                              if (answers[i]?.trim()) {
                                setSavingAnswer(i);
                                await onAnswer(item.id, i, answers[i]);
                                setSavingAnswer(null);
                                setAnswers(prev => ({ ...prev, [i]: '' }));
                                // Briefing neu laden damit ceo_antwort sichtbar wird
                                loadBriefing(true);
                              }
                            }}
                            disabled={!answers[i]?.trim() || savingAnswer === i}
                            style={{ padding: '5px 10px', borderRadius: 4, fontSize: '0.72rem',
                              fontWeight: 600, color: '#3b82f6', background: '#3b82f611',
                              border: '1px solid #3b82f644', cursor: 'pointer',
                              opacity: (answers[i]?.trim() && savingAnswer !== i) ? 1 : 0.4 }}>
                            {savingAnswer === i ? '⏳' : <Send size={10} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Aktions-Leiste */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8,
                borderTop: '1px solid #ffffff11' }}>
                <button
                  onClick={() => onRelease(item.id)}
                  disabled={!allQuestionsAnswered || actionLoading === item.id}
                  title={!allQuestionsAnswered ? 'Erst alle CEO-Fragen beantworten' : 'Zur Umsetzung freigeben'}
                  style={{ display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '0.78rem', fontWeight: 600,
                    color: allQuestionsAnswered ? '#22c55e' : '#4b5563',
                    padding: '6px 14px', borderRadius: 5,
                    border: `1px solid ${allQuestionsAnswered ? '#22c55e44' : '#ffffff11'}`,
                    background: allQuestionsAnswered ? '#22c55e11' : 'transparent',
                    cursor: allQuestionsAnswered ? 'pointer' : 'not-allowed',
                    opacity: actionLoading === item.id ? 0.5 : 1 }}>
                  <Play size={12} /> Freigeben
                </button>
                <button
                  onClick={() => onHold(item.id)}
                  disabled={actionLoading === item.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '0.78rem', fontWeight: 600, color: '#f59e0b',
                    padding: '6px 14px', borderRadius: 5,
                    border: '1px solid #f59e0b44', background: '#f59e0b11',
                    cursor: 'pointer', opacity: actionLoading === item.id ? 0.5 : 1 }}>
                  <Pause size={12} /> Zurückstellen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Umsetzungs-Karte (Phase 6) ─────────────────────────────────────────

function ExecutionCard({ item }) {
  const trackStatus = item.tracking_status || 'vorbereitet';
  const isRunning = trackStatus === 'in_umsetzung';
  const isReview = trackStatus === 'review_ausstehend';
  const color = isRunning ? '#22c55e' : isReview ? '#3b82f6' : '#f59e0b';

  return (
    <div style={{
      background: 'var(--bg-card, #141824)', borderRadius: 6, marginBottom: 8,
      border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        {isRunning && <span style={{ fontSize: '0.8rem' }}>⚙️</span>}
        {isReview && <span style={{ fontSize: '0.8rem' }}>👁</span>}
        {item.b_nummer && <Badge text={item.b_nummer} color="#3b82f6" />}
        <Badge text={trackStatus} color={color} />
        {item.aps_total > 0 && (
          <Badge text={`${item.aps_erledigt || 0}/${item.aps_total} APs`} color="#8b5cf6" />
        )}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600,
        color: 'var(--text-primary, #e2e8f0)', lineHeight: 1.3 }}>{item.titel}</div>
    </div>
  );
}

// ── Erledigt-Karte (Phase 7) ────────────────────────────────────────────

function DoneCard({ item }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      marginBottom: 4, borderRadius: 5, background: 'var(--bg-card, #141824)',
      border: '1px solid #4b556333', opacity: 0.7,
    }}>
      <CheckCircle2 size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
      {item.b_nummer && <span style={{ fontSize: '0.65rem', color: '#6b7280',
        fontFamily: 'monospace' }}>{item.b_nummer}</span>}
      <span style={{ flex: 1, fontSize: '0.75rem',
        color: 'var(--text-primary, #e2e8f0)' }}>{item.titel}</span>
    </div>
  );
}

// ── Collapsed-Karte (Rejected/Deferred) ─────────────────────────────────

function CollapsedCard({ item, onReset, actionLoading }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      marginBottom: 4, borderRadius: 5, background: 'var(--bg-card, #141824)',
      border: '1px solid #ffffff0d',
    }}>
      <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>{item.eingang}</span>
      <span style={{ flex: 1, fontSize: '0.75rem', color: '#9ca3af' }}>{item.titel}</span>
      <button
        onClick={() => onReset(item.id)}
        disabled={actionLoading === item.id}
        style={{ fontSize: '0.65rem', color: '#6b7280', padding: '2px 8px',
          borderRadius: 4, border: '1px solid #ffffff11', background: 'transparent',
          cursor: 'pointer', opacity: actionLoading === item.id ? 0.4 : 1 }}>
        ↩ Reset
      </button>
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────

function BacklogInboxTab() {
  const { get, post } = useApi();
  const [lifecycle, setLifecycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const fetchLifecycle = useCallback(async () => {
    const data = await get('/api/inbox/lifecycle');
    if (data) setLifecycle(data);
    setLoading(false);
  }, [get]);

  useEffect(() => { fetchLifecycle(); }, [fetchLifecycle]);

  // Auto-Refresh alle 5s
  useEffect(() => {
    const iv = setInterval(async () => {
      const data = await get('/api/inbox/lifecycle');
      if (data) setLifecycle(data);
    }, 5000);
    return () => clearInterval(iv);
  }, [get]);

  // CEO-Aktionen (Review-Phase)
  const handleAction = useCallback(async (ideaId, action, body) => {
    setActionLoading(ideaId);
    try {
      const data = await post(`/api/inbox/ideas/${ideaId}/${action}`, body);
      if (data?.error) {
        setFeedback({ type: 'error', msg: data.error });
      } else {
        const label = action === 'approve' ? '✅ Approved'
                    : action === 'reject'  ? '❌ Rejected'
                    : action === 'defer'   ? '⏸ Deferred'
                    : action === 'reset'   ? '↩ Reset' : action;
        setFeedback({ type: 'success', msg: label });
      }
      setTimeout(() => fetchLifecycle(), 300);
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [post, fetchLifecycle]);

  // CEO-Frage beantworten
  const handleAnswer = useCallback(async (ideaId, frageIndex, antwort) => {
    setActionLoading(ideaId);
    try {
      const result = await post(`/api/inbox/briefings/${ideaId}/answer`, { frage_index: frageIndex, antwort });
      if (result?.status === 'answered') {
        setFeedback({ type: 'success', msg: '✅ Antwort gespeichert' });
      } else {
        setFeedback({ type: 'error', msg: '❌ Antwort konnte nicht gespeichert werden' });
      }
      setTimeout(() => fetchLifecycle(), 300);
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [post, fetchLifecycle]);

  // Freigabe zur Umsetzung
  const handleRelease = useCallback(async (ideaId) => {
    setActionLoading(ideaId);
    try {
      await post(`/api/inbox/briefings/${ideaId}/release`, { ceo_antworten: {} });
      setFeedback({ type: 'success', msg: '🚀 Zur Umsetzung freigegeben' });
      setTimeout(() => fetchLifecycle(), 300);
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [post, fetchLifecycle]);

  // Zurückstellen nach Briefing
  const handleHold = useCallback(async (ideaId) => {
    setActionLoading(ideaId);
    try {
      await post(`/api/inbox/briefings/${ideaId}/hold`, {});
      setFeedback({ type: 'success', msg: '⏸ Zurückgestellt' });
      setTimeout(() => fetchLifecycle(), 300);
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  }, [post, fetchLifecycle]);

  const phases = lifecycle?.phases || {};
  const counts = lifecycle?.counts || {};

  return (
    <div style={{ padding: '0 0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--border-color, #1e2435)', flexShrink: 0,
      }}>
        <Settings size={16} style={{ color: '#8b5cf6' }} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700,
          color: 'var(--text-primary, #e2e8f0)' }}>Fabrik-Lifecycle</h3>

        {feedback && (
          <span style={{
            fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
            background: feedback.type === 'success' ? '#22c55e22' : '#ef444422',
            color: feedback.type === 'success' ? '#22c55e' : '#ef4444',
            border: `1px solid ${feedback.type === 'success' ? '#22c55e44' : '#ef444444'}`,
          }}>{feedback.msg}</span>
        )}

        <button onClick={fetchLifecycle} disabled={loading}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            background: '#8b5cf611', color: '#8b5cf6',
            border: '1px solid #8b5cf644', fontSize: '0.7rem',
            opacity: loading ? 0.5 : 1,
          }}>
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading && !lifecycle ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Lade Lifecycle...</div>
        ) : (
          <>
            {/* Zähler-Leiste */}
            <CounterBar counts={counts} />

            {/* Phase 1: Inbox */}
            <LifecycleSection title="Inbox" icon="📥" color="#6366f1"
              count={counts.inbox || 0} defaultOpen={(counts.inbox || 0) > 0}>
              {(phases.inbox || []).map(f => <InboxFileCard key={f.name} file={f} />)}
            </LifecycleSection>

            {/* Phase 2: In Analyse */}
            <LifecycleSection title="In Analyse" icon="🔍" color="#8b5cf6"
              count={counts.analyse || 0} defaultOpen={(counts.analyse || 0) > 0}>
              {(phases.analyse || []).map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  marginBottom: 4, borderRadius: 5, background: 'var(--bg-card, #141824)',
                  border: '1px solid #8b5cf633',
                }}>
                  <RefreshCw size={12} style={{ color: '#8b5cf6', animation: 'spin 2s linear infinite' }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary, #e2e8f0)' }}>
                    {item.titel}
                  </span>
                </div>
              ))}
            </LifecycleSection>

            {/* Phase 3: CEO-Review */}
            <LifecycleSection title="CEO-Review" icon="🆕" color="#3b82f6"
              count={counts.review || 0} defaultOpen={(counts.review || 0) > 0}>
              {(phases.review || []).map(item => (
                <ReviewCard key={item.id} item={item}
                  onAction={handleAction} actionLoading={actionLoading} />
              ))}
            </LifecycleSection>

            {/* Phase 4+5: Briefing & Freigabe */}
            <LifecycleSection title="Briefing & Freigabe" icon="📋" color="#f59e0b"
              count={counts.briefing || 0} defaultOpen={(counts.briefing || 0) > 0}>
              {(phases.briefing || []).map(item => (
                <BriefingCard key={item.id} item={item}
                  onRelease={handleRelease} onHold={handleHold}
                  onAnswer={handleAnswer} actionLoading={actionLoading} />
              ))}
            </LifecycleSection>

            {/* Phase 6: In Umsetzung */}
            <LifecycleSection title="In Umsetzung" icon="⚙️" color="#22c55e"
              count={counts.umsetzung || 0} defaultOpen={(counts.umsetzung || 0) > 0}>
              {(phases.umsetzung || []).map(item => (
                <ExecutionCard key={item.id} item={item} />
              ))}
            </LifecycleSection>

            {/* Phase 7: Erledigt */}
            <LifecycleSection title="Erledigt" icon="✅" color="#4b5563"
              count={counts.erledigt || 0} defaultOpen={false}>
              {(phases.erledigt || []).map(item => (
                <DoneCard key={item.id} item={item} />
              ))}
            </LifecycleSection>

            {/* Collapsed: Rejected */}
            <LifecycleSection title="Rejected" icon="❌" color="#ef4444"
              count={counts.rejected || 0} defaultOpen={false}>
              {(phases.rejected || []).map(item => (
                <CollapsedCard key={item.id} item={item}
                  onReset={(id) => handleAction(id, 'reset', {})}
                  actionLoading={actionLoading} />
              ))}
            </LifecycleSection>

            {/* Collapsed: Deferred */}
            <LifecycleSection title="Deferred" icon="⏸" color="#f59e0b"
              count={counts.deferred || 0} defaultOpen={false}>
              {(phases.deferred || []).map(item => (
                <CollapsedCard key={item.id} item={item}
                  onReset={(id) => handleAction(id, 'reset', {})}
                  actionLoading={actionLoading} />
              ))}
            </LifecycleSection>
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
