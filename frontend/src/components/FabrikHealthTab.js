import React, { useState, useEffect, useCallback } from 'react';

// Was wird hier gemessen?
// - Agent-Heartbeats: Wann hat der Agent zuletzt eine Anfrage via Fabrik-Gateway gesendet?
//   OK = Aktivität in letzten 2min | LANGSAM = 2–5min | TOT = >5min | UNBEKANNT = kein Traffic in letzter Stunde
// - Ollama: Ist der lokale LLM-Server erreichbar? Welche Modelle sind geladen?
// - Gateway: Ist der Fabrik-API-Proxy gesund? Wie viele Requests wurden verarbeitet?

const AGENT_STATUS = {
  ok:      { dot: '#22c55e', label: '🟢 OK',        bg: '#f0fdf4', color: '#15803d', desc: 'Aktiv (< 2 min)' },
  slow:    { dot: '#eab308', label: '🟡 Langsam',   bg: '#fef9c3', color: '#92400e', desc: 'Träge (2–5 min)' },
  dead:    { dot: '#ef4444', label: '🔴 Tot',        bg: '#fee2e2', color: '#991b1b', desc: 'Kein Signal (> 5 min)' },
  unknown: { dot: '#9ca3af', label: '⚪ Unbekannt',  bg: '#f3f4f6', color: '#6b7280', desc: 'Kein Gateway-Traffic in letzter Stunde' },
};

function Pill({ bg, color, children }) {
  return (
    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: bg, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Section({ title, icon, hint, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</span>
        </div>
        {hint && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{hint}</div>}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function AgentRow({ agent }) {
  const s = AGENT_STATUS[agent.status] || AGENT_STATUS.unknown;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
      borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot,
        flexShrink: 0, display: 'inline-block' }} />
      <span style={{ fontWeight: 600, fontSize: 14, color: '#111', minWidth: 130 }}>{agent.label}</span>
      <Pill bg={s.bg} color={s.color}>{s.label}</Pill>
      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 'auto' }}>
        {agent.last_seen_ago !== 'unbekannt' ? agent.last_seen_ago : s.desc}
      </span>
    </div>
  );
}

function ModelRow({ model }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#111' }}>
          {model.name}
        </span>
      </div>
      <span style={{ fontSize: 12, color: '#9ca3af', flexShrink: 0 }}>{model.size_gb} GB</span>
    </div>
  );
}

function PipelineMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pipeline/metrics')
      .then(r => r.json())
      .then(d => { setMetrics(d); setLoading(false); })
      .catch(() => setLoading(false));
    const iv = setInterval(() => {
      fetch('/api/pipeline/metrics').then(r => r.json()).then(d => setMetrics(d)).catch(() => {});
    }, 60000);
    return () => clearInterval(iv);
  }, []);

  if (loading) return <Section icon="📊" title="Pipeline-Metriken" hint="Lade…"><div style={{ color: '#9ca3af', fontSize: 13 }}>Lade…</div></Section>;
  if (!metrics) return null;

  const statCards = [
    { label: 'First-Pass-Rate', value: `${metrics.first_pass_rate_pct}%`, color: metrics.first_pass_rate_pct >= 80 ? '#22c55e' : metrics.first_pass_rate_pct >= 50 ? '#eab308' : '#ef4444' },
    { label: 'Retry-Rate', value: `${metrics.retry_rate_pct}%`, color: metrics.retry_rate_pct <= 20 ? '#22c55e' : metrics.retry_rate_pct <= 40 ? '#eab308' : '#ef4444' },
    { label: 'Ø Durchlaufzeit', value: `${metrics.avg_duration_hours}h`, color: '#3b82f6' },
    { label: 'Median', value: `${metrics.median_duration_hours}h`, color: '#6366f1' },
    { label: 'Abgeschlossen', value: metrics.closed_total, color: '#10b981' },
    { label: 'Offen', value: metrics.open_total, color: '#f59e0b' },
    { label: 'Blocked', value: metrics.open_blocked, color: metrics.open_blocked > 0 ? '#ef4444' : '#22c55e' },
  ];

  return (
    <Section icon="📊" title="Pipeline-Metriken" hint={`${metrics.repo} · ${metrics.closed_total} geschlossene Issues analysiert`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {statCards.map(c => (
          <div key={c.label} style={{
            padding: '10px 14px', borderRadius: 10, background: '#f9fafb',
            border: '1px solid #e5e7eb', minWidth: 100, flex: '1 1 calc(33% - 10px)'
          }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
    </Section>
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

  const agSum = agents?.summary || {};

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', maxWidth: 700, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111' }}>Fabrik-Health</h2>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            {lastRefresh ? `Aktualisiert: ${lastRefresh.toLocaleTimeString('de-DE')}` : 'Lädt…'}
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db',
            background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500 }}>
          {loading ? '⟳' : '↻ Refresh'}
        </button>
      </div>

      {/* ─── Agent-Heartbeats ─── */}
      <Section
        icon="🤖"
        title="Agent-Heartbeats"
        hint="Gemessen: Letzter Zugriff eines Agents auf das Fabrik-Gateway · OK < 2 min · Langsam 2–5 min · Tot > 5 min"
      >
        {!agents && <div style={{ color: '#9ca3af', fontSize: 13 }}>Lädt…</div>}
        {agents && (
          <>
            {/* Summary Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <Pill bg="#f0fdf4" color="#15803d">🟢 {agSum.ok ?? 0} OK</Pill>
              {(agSum.slow ?? 0) > 0 && <Pill bg="#fef9c3" color="#92400e">🟡 {agSum.slow} Langsam</Pill>}
              {(agSum.dead ?? 0) > 0 && <Pill bg="#fee2e2" color="#991b1b">🔴 {agSum.dead} Tot</Pill>}
              {(agSum.unknown ?? 0) > 0 && <Pill bg="#f3f4f6" color="#6b7280">⚪ {agSum.unknown} Unbekannt</Pill>}
            </div>

            {/* Agent rows */}
            <div>
              {agents.agents.map(a => <AgentRow key={a.id} agent={a} />)}
            </div>

            <div style={{ marginTop: 10, padding: '8px 12px', background: '#f9fafb',
              borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
              💡 <strong>Unbekannt</strong> bedeutet: kein Traffic via Gateway in der letzten Stunde –
              z.B. wenn der Agent gerade idle ist oder direkt GitHub nutzt (noch nicht vollständig migriert).
              Das ist kein Fehler.
            </div>
          </>
        )}
      </Section>

      {/* ─── Ollama ─── */}
      <Section
        icon="🧠"
        title="Ollama – LLM Tier 1"
        hint="Lokaler LLM-Server auf ai-brain-01 (192.168.44.10:11434) · Tier 1 = $0 · Fallback wenn Tier 2 nicht verfügbar"
      >
        {!ollama && <div style={{ color: '#9ca3af', fontSize: 13 }}>Lädt…</div>}
        {ollama && (
          <>
            {/* Status-Zeile */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <Pill
                bg={ollama.reachable ? '#f0fdf4' : '#fee2e2'}
                color={ollama.reachable ? '#15803d' : '#dc2626'}>
                {ollama.reachable ? '🟢 Erreichbar' : '🔴 Nicht erreichbar'}
              </Pill>
              {ollama.version && (
                <Pill bg="#f3f4f6" color="#374151">v{ollama.version}</Pill>
              )}
              <Pill bg="#eff6ff" color="#1d4ed8">{ollama.model_count} Modell{ollama.model_count !== 1 ? 'e' : ''} bekannt</Pill>
            </div>

            {/* Modell-Liste */}
            {ollama.models?.length > 0 ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Verfügbare Modelle
                </div>
                {ollama.models.map((m, i) => <ModelRow key={i} model={m} />)}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Keine Modelle gefunden.</div>
            )}

            {ollama.error && (
              <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>⚠️ {ollama.error}</div>
            )}
          </>
        )}
      </Section>

      {/* ─── Gateway ─── */}
      <Section
        icon="🔀"
        title="Fabrik-Gateway"
        hint="Zentraler GitHub-API-Proxy auf dispatcher-01 (192.168.44.70:8080) · ETag-Cache · Write-Queue"
      >
        {!gateway && <div style={{ color: '#9ca3af', fontSize: 13 }}>Lädt…</div>}
        {gateway && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Pill
              bg={gateway.status === 'ok' ? '#f0fdf4' : '#fee2e2'}
              color={gateway.status === 'ok' ? '#15803d' : '#dc2626'}>
              {gateway.status === 'ok' ? '🟢 OK' : '🔴 DOWN'}
            </Pill>
            {gateway.total_requests != null && (
              <Pill bg="#f3f4f6" color="#374151">
                {gateway.total_requests.toLocaleString()} Requests gesamt
              </Pill>
            )}
            {gateway.cache_hit_rate != null && (
              <Pill bg="#eff6ff" color="#1d4ed8">
                Cache {Math.round(gateway.cache_hit_rate * 100)}%
              </Pill>
            )}
            {gateway.db_entries != null && (
              <Pill bg="#f5f3ff" color="#6d28d9">
                {gateway.db_entries.toLocaleString()} DB-Einträge
              </Pill>
            )}
          </div>
        )}
      </Section>

      {/* Pipeline-Metriken */}
      <PipelineMetrics />

    </div>
  );
}
