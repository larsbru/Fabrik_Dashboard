import React, { useState, useEffect, useCallback } from 'react';

const AGENT_STATUS_STYLE = {
  ok:      { dot: '#22c55e', text: '🟢 OK',      bg: '#f0fdf4', color: '#15803d' },
  slow:    { dot: '#eab308', text: '🟡 LANGSAM', bg: '#fef9c3', color: '#92400e' },
  dead:    { dot: '#ef4444', text: '🔴 TOT',     bg: '#fee2e2', color: '#991b1b' },
  unknown: { dot: '#9ca3af', text: '⚪ UNBEKANNT', bg: '#f3f4f6', color: '#6b7280' },
};

function AgentRow({ agent }) {
  const s = AGENT_STATUS_STYLE[agent.status] || AGENT_STATUS_STYLE.unknown;
  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111', fontSize: 14 }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          background: s.dot, marginRight: 8 }} />
        {agent.label}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151' }}>
        {agent.last_seen_ago || '–'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
          background: s.bg, color: s.color }}>
          {s.text}
        </span>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>
        {agent.last_seen ? new Date(agent.last_seen).toLocaleTimeString('de-DE') : '–'}
      </td>
    </tr>
  );
}

function Section({ title, children, icon }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6',
        background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

export default function FabrikHealthTab() {
  const [agents, setAgents] = useState(null);
  const [ollama, setOllama] = useState(null);
  const [gateway, setGateway] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, ollamaRes, gwRes] = await Promise.allSettled([
        fetch('/api/health/agents').then(r => r.json()),
        fetch('/api/health/ollama').then(r => r.json()),
        fetch('/api/gateway/health').then(r => r.json()),
      ]);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value);
      if (ollamaRes.status === 'fulfilled') setOllama(ollamaRes.value);
      if (gwRes.status === 'fulfilled') setGateway(gwRes.value);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const agentSummary = agents?.summary || {};
  const allAgentsOk = agentSummary.ok === agentSummary.total && agentSummary.total > 0;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111' }}>Fabrik-Health</h2>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            {lastRefresh ? `Zuletzt: ${lastRefresh.toLocaleTimeString('de-DE')}` : 'Wird geladen…'}
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
            background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
          {loading ? '⟳ Lädt…' : '↻ Refresh'}
        </button>
      </div>

      {/* Agent-Heartbeats */}
      <Section title="Agent-Heartbeats" icon="🤖">
        {!agents && <div style={{ color: '#6b7280', fontSize: 13 }}>Wird geladen…</div>}
        {agents && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
              <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: allAgentsOk ? '#dcfce7' : '#fee2e2',
                color: allAgentsOk ? '#15803d' : '#dc2626' }}>
                {agentSummary.ok}/{agentSummary.total} OK
              </span>
              {agentSummary.slow > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  background: '#fef9c3', color: '#92400e' }}>
                  {agentSummary.slow} langsam
                </span>
              )}
              {agentSummary.dead > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  background: '#fee2e2', color: '#dc2626' }}>
                  {agentSummary.dead} tot
                </span>
              )}
              {agentSummary.unknown > 0 && (
                <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  background: '#f3f4f6', color: '#6b7280' }}>
                  {agentSummary.unknown} unbekannt
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Agent', 'Letzter Heartbeat', 'Status', 'Timestamp'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.agents.map(a => <AgentRow key={a.id} agent={a} />)}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
              Heartbeat = letzter Gateway-Zugriff. Unbekannt = noch kein Traffic via Gateway in letzter Stunde.
            </div>
          </>
        )}
      </Section>

      {/* Ollama */}
      <Section title="Ollama (LLM Tier 1)" icon="🧠">
        {!ollama && <div style={{ color: '#6b7280', fontSize: 13 }}>Wird geladen…</div>}
        {ollama && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: ollama.reachable ? '#f0fdf4' : '#fee2e2', minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Status</div>
              <div style={{ fontWeight: 700, fontSize: 16,
                color: ollama.reachable ? '#15803d' : '#dc2626' }}>
                {ollama.reachable ? '🟢 Erreichbar' : '🔴 Nicht erreichbar'}
              </div>
              {ollama.version && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>v{ollama.version}</div>
              )}
            </div>

            <div style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#f9fafb', minWidth: 160 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Modelle</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{ollama.model_count}</div>
            </div>

            {ollama.models?.length > 0 && (
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Geladene Modelle</div>
                {ollama.models.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '4px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                    <span style={{ fontFamily: 'monospace', color: '#374151' }}>{m.name}</span>
                    <span style={{ color: '#9ca3af' }}>{m.size_gb} GB</span>
                  </div>
                ))}
              </div>
            )}

            {ollama.error && (
              <div style={{ color: '#dc2626', fontSize: 13 }}>{ollama.error}</div>
            )}
          </div>
        )}
      </Section>

      {/* Gateway */}
      <Section title="Fabrik-Gateway" icon="🔀">
        {!gateway && <div style={{ color: '#6b7280', fontSize: 13 }}>Wird geladen…</div>}
        {gateway && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {[
              { label: 'Status', value: gateway.status === 'ok' ? '🟢 OK' : '🔴 DOWN',
                color: gateway.status === 'ok' ? '#15803d' : '#dc2626' },
              { label: 'Total Requests', value: gateway.total_requests?.toLocaleString() ?? '–' },
              { label: 'Cache-Hit-Rate', value: gateway.cache_hit_rate != null
                ? `${Math.round(gateway.cache_hit_rate * 100)}%` : '–' },
              { label: 'DB-Einträge', value: gateway.db_entries?.toLocaleString() ?? '–' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '10px 16px', borderRadius: 8,
                border: '1px solid #e5e7eb', background: '#f9fafb', minWidth: 130 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: color || '#111' }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
