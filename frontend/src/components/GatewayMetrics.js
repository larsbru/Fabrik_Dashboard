import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Zap, Database, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import './GatewayMetrics.css';

function MetricCard({ icon: Icon, label, value, unit, color, subtitle }) {
  return (
    <div className="gw-metric-card">
      <div className="gw-metric-icon" style={{ color }}>
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div className="gw-metric-body">
        <span className="gw-metric-label">{label}</span>
        <span className="gw-metric-value">
          {value !== null && value !== undefined ? value : '—'}
          {unit && <span className="gw-metric-unit"> {unit}</span>}
        </span>
        {subtitle && <span className="gw-metric-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}

function CallerRow({ caller, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="gw-caller-row">
      <span className="gw-caller-name">{caller}</span>
      <div className="gw-caller-bar-wrap">
        <div className="gw-caller-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="gw-caller-count">{count}</span>
    </div>
  );
}

function GatewayMetrics() {
  const { get } = useApi();
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchMetrics = useCallback(async () => {
    const [m, h] = await Promise.all([
      get('/api/gateway/metrics'),
      get('/api/gateway/health'),
    ]);
    if (m) setMetrics(m);
    if (h) setHealth(h);
    setLastFetch(new Date());
    setLoading(false);
  }, [get]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="gw-loading">
        <Activity size={20} className="gw-loading-icon" />
        <span>Gateway-Metriken laden…</span>
      </div>
    );
  }

  const byCaller = metrics?.db_stats_1h?.by_caller || metrics?.by_caller || {};
  const totalCalls = metrics?.github_calls_total || 0;
  const cacheHits = metrics?.cache_hits_total || 0;
  const callerEntries = Object.entries(byCaller).sort((a, b) => b[1] - a[1]);

  const stats1h = metrics?.db_stats_1h || {};
  const rateLimitPct = metrics?.rate_limit_remaining != null
    ? Math.round((metrics.rate_limit_remaining / 5000) * 100)
    : null;

  const isReachable = health?.reachable !== false && !metrics?.error;

  return (
    <div className="gw-metrics-panel">
      <div className="gw-header">
        <div className="gw-title-row">
          <Activity size={18} strokeWidth={1.5} />
          <h3 className="gw-title">Fabrik-Gateway</h3>
          <div className={`gw-status-dot ${isReachable ? 'online' : 'offline'}`} />
          <span className="gw-status-label">
            {isReachable ? 'online' : 'nicht erreichbar'}
          </span>
        </div>
        {lastFetch && (
          <span className="gw-last-fetch">
            Stand: {lastFetch.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {metrics?.error && (
        <div className="gw-error-banner">
          <AlertCircle size={14} />
          <span>{metrics.error}</span>
        </div>
      )}

      <div className="gw-metrics-grid">
        <MetricCard
          icon={Zap}
          label="GitHub-Calls gesamt"
          value={totalCalls.toLocaleString('de-DE')}
          color="var(--accent-cyan)"
          subtitle={`letzte Stunde: ${stats1h.total_calls ?? '—'}`}
        />
        <MetricCard
          icon={CheckCircle}
          label="Rate-Limit"
          value={metrics?.rate_limit_remaining ?? '—'}
          unit="/ 5000"
          color={rateLimitPct !== null && rateLimitPct < 20 ? 'var(--accent-red)' : 'var(--accent-green)'}
          subtitle={rateLimitPct !== null ? `${rateLimitPct}% verbleibend` : undefined}
        />
        <MetricCard
          icon={Database}
          label="Cache-Hits"
          value={cacheHits.toLocaleString('de-DE')}
          color="var(--accent-purple)"
          subtitle={totalCalls > 0 ? `${Math.round((cacheHits / totalCalls) * 100)}% Hit-Rate` : undefined}
        />
        <MetricCard
          icon={Clock}
          label="Avg Latenz"
          value={stats1h?.avg_latency_ms ?? '—'}
          unit="ms"
          color={stats1h?.avg_latency_ms > 1000 ? 'var(--accent-red)' : 'var(--accent-yellow)'}
          subtitle={metrics?.backoff_active ? '⚠ Backoff aktiv' : 'normal'}
        />
      </div>

      {callerEntries.length > 0 && (
        <div className="gw-callers-section">
          <h4 className="gw-callers-title">Calls by Caller</h4>
          <div className="gw-callers-list">
            {callerEntries.map(([caller, count]) => (
              <CallerRow key={caller} caller={caller} count={count} total={totalCalls} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default GatewayMetrics;
