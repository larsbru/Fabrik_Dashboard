import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  RefreshCw, AlertTriangle, Clock, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, ExternalLink, RotateCcw, Check,
  GitMerge, Cpu, Zap
} from 'lucide-react';

// Stage-Farben passend zur bestehenden CSS-Palette
const STAGE_COLORS = {
  'BEREIT':   '#3b82f6',
  'PLANUNG':  '#8b5cf6',
  'DISPATCH': '#a78bfa',
  'CODING':   '#f59e0b',
  'QA':       '#06b6d4',
  'CI':       '#0ea5e9',
  'CI ✅':    '#10b981',
  'DEPLOY':   '#14b8a6',
  'STAGING':  '#22c55e',
  'UAT':      '#84cc16',
  'BLOCKED':  '#ef4444',
  'FEHLER':   '#f97316',
  'BACKLOG':  '#6b7280',
};

function RetryBadge({ retry }) {
  if (!retry) return null;
  const color = retry >= 2 ? '#ef4444' : '#f59e0b';
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px',
      borderRadius: 4, background: color + '22', color, border: `1px solid ${color}44`,
      marginLeft: 4,
    }}>
      retry:{retry}
    </span>
  );
}

function NewBadge() {
  return (
    <span style={{
      fontSize: '0.6rem', fontWeight: 700, padding: '1px 4px',
      borderRadius: 3, background: '#3b82f622', color: '#3b82f6',
      border: '1px solid #3b82f644', marginLeft: 4,
    }}>
      NEU
    </span>
  );
}

function IssueCard({ issue, onAction, actionLoading }) {
  const [expanded, setExpanded] = useState(false);
  const stageColor = STAGE_COLORS[issue.stage] || '#6b7280';
  const isUAT = issue.stage === 'UAT';
  const isBlocked = issue.stage === 'BLOCKED' || issue.stage === 'FEHLER';

  return (
    <div style={{
      background: 'var(--bg-secondary, #1a1f2e)',
      border: `1px solid ${stageColor}33`,
      borderLeft: `3px solid ${stageColor}`,
      borderRadius: 6,
      padding: '8px 10px',
      cursor: 'pointer',
      transition: 'border-color 0.15s',
      flex: '1 1 280px',   // mobile: volle Breite; desktop: min 280px, wächst mit
      minWidth: 0,
    }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>
          #{issue.number}
        </span>
        <RetryBadge retry={issue.retry} />
        {issue.is_new && <NewBadge />}
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#4b5563', whiteSpace: 'nowrap' }}>
          {issue.time_ago ? `vor ${issue.time_ago}` : ''}
        </span>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </div>

      {/* Title */}
      <div style={{
        fontSize: '0.78rem', color: 'var(--text-primary, #e2e8f0)',
        lineHeight: 1.3, marginBottom: expanded ? 8 : 0,
      }}>
        {issue.title}
      </div>

      {/* Drilldown */}
      {expanded && (
        <div style={{ borderTop: '1px solid #ffffff11', paddingTop: 8, marginTop: 4 }}>
          {/* Labels */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
            {issue.labels.map((l, i) => (
              <span key={i} style={{
                fontSize: '0.6rem', padding: '1px 5px', borderRadius: 3,
                background: '#ffffff11', color: '#9ca3af', border: '1px solid #ffffff1a',
              }}>
                {l}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* GitHub-Link */}
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.7rem', color: '#3b82f6', textDecoration: 'none',
                padding: '3px 8px', borderRadius: 4,
                border: '1px solid #3b82f644', background: '#3b82f611',
              }}
            >
              <ExternalLink size={10} />
              GitHub
            </a>

            {/* UAT bestätigen */}
            {isUAT && (
              <button
                onClick={e => { e.stopPropagation(); onAction(issue.number, 'confirm-uat', issue.repo); }}
                disabled={actionLoading === issue.number}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.7rem', color: '#22c55e', cursor: 'pointer',
                  padding: '3px 8px', borderRadius: 4,
                  border: '1px solid #22c55e44', background: '#22c55e11',
                  opacity: actionLoading === issue.number ? 0.5 : 1,
                }}
              >
                <Check size={10} />
                UAT ✓
              </button>
            )}

            {/* Reset blocked */}
            {(isBlocked || issue.retry > 0) && (
              <button
                onClick={e => { e.stopPropagation(); onAction(issue.number, 'reset-blocked', issue.repo); }}
                disabled={actionLoading === issue.number}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: '0.7rem', color: '#f59e0b', cursor: 'pointer',
                  padding: '3px 8px', borderRadius: 4,
                  border: '1px solid #f59e0b44', background: '#f59e0b11',
                  opacity: actionLoading === issue.number ? 0.5 : 1,
                }}
              >
                <RotateCcw size={10} />
                Reset
              </button>
            )}
          </div>

          {actionLoading === issue.number && (
            <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: 4 }}>
              Wird ausgeführt...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageColumn({ stage, onAction, actionLoading }) {
  const [collapsed, setCollapsed] = useState(stage.issues.length === 0);
  const color = STAGE_COLORS[stage.stage] || '#6b7280';
  const count = stage.issues.length;

  // Leere Stages standardmäßig kollabiert — spart Platz auf Mobiltelefon
  return (
    <div style={{
      width: '100%',
      background: 'var(--bg-card, #141824)',
      border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
    }}>
      {/* Row header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'none', border: 'none',
          cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #e2e8f0)', flex: 1 }}>
          {stage.stage}
        </span>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
          borderRadius: 10, background: color + '22', color,
        }}>
          {count}
        </span>
        {collapsed ? <ChevronRight size={14} style={{ color: '#6b7280' }} />
                   : <ChevronDown size={14} style={{ color: '#6b7280' }} />}
      </button>

      {/* Cards – wrapping row layout */}
      {!collapsed && (
        <div style={{
          padding: '0 10px 10px',
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {count === 0 ? (
            <div style={{ fontSize: '0.7rem', color: '#4b5563', textAlign: 'center', padding: '12px 0' }}>
              leer
            </div>
          ) : (
            stage.issues.map(issue => (
              <IssueCard
                key={issue.number}
                issue={issue}
                onAction={onAction}
                actionLoading={actionLoading}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PipelineTab() {
  const { get, post } = useApi();
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionFeedback, setActionFeedback] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get('/api/pipeline');
      if (data) {
        setPipeline(data);
        setLastRefresh(new Date());
      } else {
        setError('Keine Daten vom Backend');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchPipeline();
    const interval = setInterval(fetchPipeline, 30000); // auto-refresh 30s
    return () => clearInterval(interval);
  }, [fetchPipeline]);

  const handleAction = useCallback(async (issueNumber, action, repo) => {
    setActionLoading(issueNumber);
    setActionFeedback(null);
    try {
      const repoParam = repo ? `?repo=${encodeURIComponent(repo)}` : '';
      const data = await post(`/api/pipeline/${issueNumber}/${action}${repoParam}`);
      if (data?.error) {
        setActionFeedback({ type: 'error', msg: data.error });
      } else {
        setActionFeedback({ type: 'success', msg: `${action} für #${issueNumber} erfolgreich` });
        await fetchPipeline();
      }
    } catch (e) {
      setActionFeedback({ type: 'error', msg: e.message });
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  }, [post, fetchPipeline]);

  // Stats
  const totalIssues = pipeline?.total || 0;
  const blockedCount = pipeline?.stages?.find(s => s.stage === 'BLOCKED')?.issues?.length || 0;
  const uatCount = pipeline?.stages?.find(s => s.stage === 'UAT')?.issues?.length || 0;
  const fehlerCount = pipeline?.stages?.find(s => s.stage === 'FEHLER')?.issues?.length || 0;

  return (
    <div style={{ padding: '0 0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderBottom: '1px solid var(--border-color, #1e2435)',
        flexShrink: 0,
      }}>
        <Zap size={16} style={{ color: '#3b82f6' }} />
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary, #e2e8f0)' }}>
          Pipeline
        </h3>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{totalIssues} offen</span>
          {uatCount > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#84cc16', fontWeight: 700 }}>
              ✓ {uatCount} UAT
            </span>
          )}
          {blockedCount > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>
              ⚠ {blockedCount} blocked
            </span>
          )}
          {fehlerCount > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 700 }}>
              ✗ {fehlerCount} Fehler
            </span>
          )}
        </div>

        {/* Feedback */}
        {actionFeedback && (
          <span style={{
            fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4,
            background: actionFeedback.type === 'success' ? '#22c55e22' : '#ef444422',
            color: actionFeedback.type === 'success' ? '#22c55e' : '#ef4444',
            border: `1px solid ${actionFeedback.type === 'success' ? '#22c55e44' : '#ef444444'}`,
          }}>
            {actionFeedback.msg}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefresh && (
            <span style={{ fontSize: '0.65rem', color: '#4b5563' }}>
              {lastRefresh.toLocaleTimeString('de-DE')}
            </span>
          )}
          <button
            onClick={fetchPipeline}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: '#3b82f611', color: '#3b82f6',
              border: '1px solid #3b82f644', fontSize: '0.7rem',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          margin: 12, padding: '8px 12px', borderRadius: 6,
          background: '#ef444411', border: '1px solid #ef444433', color: '#ef4444',
          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {/* Kanban board – vertikal (mobile-first) */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {loading && !pipeline ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: 20 }}>Lade Pipeline...</div>
        ) : (
          pipeline?.stages?.map(stage => (
            <StageColumn
              key={stage.stage}
              stage={stage}
              onAction={handleAction}
              actionLoading={actionLoading}
            />
          ))
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default PipelineTab;
