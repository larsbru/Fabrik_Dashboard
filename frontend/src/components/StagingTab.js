import React, { useState, useEffect, useCallback } from 'react';

const STATUS_COLOR = {
  healthy: { bg: '#dcfce7', border: '#16a34a', text: '#15803d', dot: '#22c55e', label: '🟢 HEALTHY' },
  degraded: { bg: '#fef9c3', border: '#ca8a04', text: '#92400e', dot: '#eab308', label: '🟡 DEGRADED' },
  down:    { bg: '#fee2e2', border: '#dc2626', text: '#991b1b', dot: '#ef4444', label: '🔴 DOWN' },
  unknown: { bg: '#f3f4f6', border: '#9ca3af', text: '#6b7280', dot: '#9ca3af', label: '⚪ UNKNOWN' },
};

function TestBadge({ test }) {
  const ok = test.ok;
  const latency = test.latency_ms != null ? `${test.latency_ms}ms` : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
      background: ok ? '#f0fdf4' : '#fef2f2', borderRadius: 6,
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
      <span style={{ fontSize: 14 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: ok ? '#15803d' : '#dc2626' }}>
        {test.name}
      </span>
      {test.url && (
        <span style={{ fontSize: 11, color: '#6b7280' }}>{test.url.replace(/^https?:\/\/[^/]+/, '')}</span>
      )}
      {latency && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{latency}</span>}
    </div>
  );
}

function RepoCard({ repo, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS_COLOR[repo.status] || STATUS_COLOR.unknown;

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${s.border}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: s.bg, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{repo.repo}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: s.text }}>{s.label.split(' ').slice(1).join(' ')}</span>
          </div>
          {repo.base_url && (
            <a href={repo.base_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
              {repo.base_url}
            </a>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {repo.port && <div style={{ fontSize: 12, color: '#6b7280' }}>Port {repo.port}</div>}
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {repo.checked_at ? new Date(repo.checked_at).toLocaleTimeString('de-DE') : '–'}
          </div>
        </div>
      </div>

      {/* Tests */}
      {repo.tests && repo.tests.length > 0 && (
        <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {repo.tests.map((t, i) => <TestBadge key={i} test={t} />)}
        </div>
      )}

      {repo.github_repo && (
        <div style={{ padding: '4px 18px 12px', fontSize: 12, color: '#9ca3af' }}>
          <a href={`https://github.com/${repo.github_repo}`} target="_blank" rel="noopener noreferrer"
            style={{ color: '#6b7280', textDecoration: 'none' }}>
            📦 {repo.github_repo}
          </a>
        </div>
      )}
    </div>
  );
}

export default function StagingTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/staging');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const summary = data?.summary || {};
  const allHealthy = summary.healthy === summary.total && summary.total > 0;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#111' }}>Staging</h2>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            {lastRefresh ? `Zuletzt: ${lastRefresh.toLocaleTimeString('de-DE')}` : 'Wird geladen…'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {data && (
            <div style={{ display: 'flex', gap: 8 }}>
              {summary.total > 0 && (
                <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: allHealthy ? '#dcfce7' : '#fee2e2',
                  color: allHealthy ? '#15803d' : '#dc2626' }}>
                  {summary.healthy}/{summary.total} healthy
                </span>
              )}
            </div>
          )}
          <button onClick={load} disabled={loading}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db',
              background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            {loading ? '⟳ Lädt…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '12px 16px', color: '#dc2626', marginBottom: 16 }}>
          ⚠️ Fehler: {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
          ⟳ Staging-Status wird geprüft…
        </div>
      )}

      {data?.repos?.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
          Keine Staging-Configs gefunden.<br />
          <span style={{ fontSize: 12 }}>Pfad: knowledge/qa/staging/*.yaml</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data?.repos?.map((repo) => (
          <RepoCard key={repo.repo} repo={repo} onRefresh={load} />
        ))}
      </div>
    </div>
  );
}
