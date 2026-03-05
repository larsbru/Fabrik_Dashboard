import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import { RefreshCw, Activity, AlertCircle, Wifi, WifiOff } from 'lucide-react';

const STATUS_DOT = {
  active:      { color: '#22c55e', pulse: true,  label: 'Aktiv' },
  busy:        { color: '#f59e0b', pulse: true,  label: 'Beschäftigt' },
  idle:        { color: '#6b7280', pulse: false, label: 'Wartet' },
  error:       { color: '#ef4444', pulse: false, label: 'Fehler' },
  warn:        { color: '#f97316', pulse: false, label: 'Warnung' },
  unknown:     { color: '#4b5563', pulse: false, label: 'Unbekannt' },
  unreachable: { color: '#374151', pulse: false, label: 'Offline' },
};

function PulseDot({ color, pulse }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10, flexShrink: 0 }}>
      <span style={{
        display: 'block', width: 10, height: 10, borderRadius: '50%',
        background: color, position: 'relative', zIndex: 1,
      }} />
      {pulse && (
        <span style={{
          position: 'absolute', top: 0, left: 0,
          width: 10, height: 10, borderRadius: '50%',
          background: color, opacity: 0.4,
          animation: 'agentPulse 1.5s ease-out infinite',
        }} />
      )}
    </span>
  );
}

function AgentCard({ agent }) {
  const [expanded, setExpanded] = useState(false);
  const dot = STATUS_DOT[agent.status] || STATUS_DOT.unknown;

  return (
    <div style={{
      background: 'var(--bg-card, #141824)',
      border: `1px solid ${agent.color}33`,
      borderLeft: `3px solid ${agent.reachable ? agent.color : '#374151'}`,
      borderRadius: 8, marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: '10px 12px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PulseDot color={dot.color} pulse={dot.pulse} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700,
                color: 'var(--text-primary, #e2e8f0)', flexShrink: 0 }}>
                {agent.name}
              </span>
              <span style={{ fontSize: '0.65rem', color: '#6b7280' }}>{agent.role}</span>
              {agent.current_issue && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px',
                  borderRadius: 4, background: '#f59e0b22', color: '#f59e0b',
                  border: '1px solid #f59e0b44',
                }}>
                  Issue {agent.current_issue}
                </span>
              )}
            </div>
            {/* Aktivitäts-Zeile */}
            <div style={{ fontSize: '0.75rem', marginTop: 3,
              color: agent.reachable ? 'var(--text-primary, #c9d1d9)' : '#4b5563' }}>
              {agent.activity}
            </div>
          </div>

          {/* Status-Badge */}
          <span style={{
            fontSize: '0.6rem', padding: '2px 7px', borderRadius: 10,
            background: dot.color + '22', color: dot.color,
            border: `1px solid ${dot.color}44`, fontWeight: 700, flexShrink: 0,
          }}>
            {dot.label}
          </span>

          {agent.reachable
            ? <Wifi size={12} style={{ color: '#22c55e55', flexShrink: 0 }} />
            : <WifiOff size={12} style={{ color: '#ef444455', flexShrink: 0 }} />
          }
        </div>
      </div>

      {/* Log-Preview (ausgeklappt) */}
      {expanded && agent.reachable && agent.log_lines?.length > 0 && (
        <div style={{ borderTop: '1px solid #ffffff0a', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.6rem', color: '#6b7280', marginBottom: 5,
            textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Letzte Log-Zeilen
          </div>
          <div style={{
            background: '#0f172a', borderRadius: 5, padding: '8px 10px',
            fontFamily: 'monospace', fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6,
          }}>
            {agent.log_lines.map((line, i) => (
              <div key={i} style={{
                color: line.includes('ERROR') || line.includes('failed') ? '#f87171'
                     : line.includes('Opus') || line.includes('Sonnet') || line.includes('LLM') ? '#a78bfa'
                     : '#94a3b8',
                borderBottom: i < agent.log_lines.length - 1 ? '1px solid #ffffff05' : 'none',
                padding: '2px 0',
              }}>
                {line}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.6rem', color: '#4b5563', marginTop: 5, textAlign: 'right' }}>
            Geprüft: {agent.checked_at ? new Date(agent.checked_at).toLocaleTimeString('de-DE') : '–'}
          </div>
        </div>
      )}

      {expanded && !agent.reachable && (
        <div style={{ borderTop: '1px solid #ffffff0a', padding: '8px 12px',
          fontSize: '0.72rem', color: '#4b5563' }}>
          SSH-Verbindung zu {agent.id} nicht möglich.
        </div>
      )}
    </div>
  );
}

function SummaryBar({ summary }) {
  if (!summary) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {[
        { label: 'Aktiv', value: summary.busy, color: '#22c55e' },
        { label: 'Fehler', value: summary.errors, color: '#ef4444' },
        { label: 'Wartet', value: summary.idle, color: '#6b7280' },
        { label: 'Offline', value: summary.unreachable, color: '#374151' },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          padding: '4px 12px', borderRadius: 20,
          background: color + '22', border: `1px solid ${color}44`,
          fontSize: '0.7rem', color,
        }}>
          {value} {label}
        </div>
      ))}
    </div>
  );
}

export default function AgentStatusTab() {
  const { get } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await get('/api/agents/status');
    if (res) setData(res);
    setLoading(false);
  }, [get]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-Refresh alle 15s (Logs ändern sich nicht so schnell)
  useEffect(() => {
    const iv = setInterval(() => fetchStatus(true), 15000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const agents = data?.agents || [];
  const fetched = data?.fetched_at ? new Date(data.fetched_at).toLocaleTimeString('de-DE') : null;

  return (
    <div style={{ padding: '0 0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--border-color, #1e2435)', flexShrink: 0,
      }}>
        <Activity size={16} style={{ color: '#22c55e' }} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700,
          color: 'var(--text-primary, #e2e8f0)' }}>
          Agent-Status
        </h3>
        {fetched && (
          <span style={{ fontSize: '0.65rem', color: '#4b5563', marginLeft: 4 }}>
            Stand: {fetched}
          </span>
        )}
        <button
          onClick={() => fetchStatus()}
          disabled={loading}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            background: '#22c55e11', color: '#22c55e',
            border: '1px solid #22c55e44', fontSize: '0.7rem',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {loading && !data ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Lade Agent-Status via SSH…</div>
        ) : agents.length === 0 ? (
          <div style={{ color: '#4b5563', fontSize: '0.8rem' }}>Keine Agents konfiguriert.</div>
        ) : (
          <>
            <SummaryBar summary={data?.summary} />
            {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
            <div style={{ fontSize: '0.65rem', color: '#374151', marginTop: 8, textAlign: 'center' }}>
              Auto-Refresh alle 15s · Klick auf Agent für Log-Details
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes agentPulse {
          0%   { transform: scale(1);   opacity: 0.4; }
          70%  { transform: scale(2.5); opacity: 0; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
