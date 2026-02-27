import React, { useState } from 'react';
import { GitPullRequest, CircleDot, CheckCircle2, Clock, MessageSquare, User, AlertTriangle, ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import './GitHubPipeline.css';

const STAGE_CONFIG = {
  'agent:ready': { color: 'var(--accent-blue)', icon: Clock },
  'agent:running': { color: 'var(--accent-cyan)', icon: CircleDot },
  'needs:qa': { color: 'var(--accent-orange)', icon: AlertTriangle },
  'ready-for-qa': { color: 'var(--accent-yellow)', icon: CheckCircle2 },
  'agent:qa': { color: 'var(--accent-purple)', icon: CircleDot },
  'awaiting-uat': { color: 'var(--accent-green)', icon: CheckCircle2 },
};

const DEFAULT_VISIBLE = 3;

function AssignmentLabel({ labels }) {
  const assigned = labels?.filter(l => l.name.toLowerCase().startsWith('assigned:'));
  const retries = labels?.filter(l => l.name.toLowerCase().startsWith('retry:'));

  if (!assigned?.length && !retries?.length) return null;

  return (
    <div className="pipeline-assignment-labels">
      {assigned?.map((l, i) => (
        <span key={i} className="assignment-badge">
          <Cpu size={8} />
          {l.name.split(':')[1]}
        </span>
      ))}
      {retries?.map((l, i) => (
        <span key={i} className="retry-badge">
          {l.name}
        </span>
      ))}
    </div>
  );
}

function IssueCard({ issue }) {
  return (
    <div className="pipeline-card">
      <div className="pipeline-card-header">
        <CircleDot
          size={14}
          style={{ color: issue.state === 'open' ? 'var(--accent-green)' : 'var(--accent-purple)' }}
        />
        <span className="pipeline-card-number">#{issue.number}</span>
      </div>
      <div className="pipeline-card-title">{issue.title}</div>
      <AssignmentLabel labels={issue.labels} />
      <div className="pipeline-card-meta">
        {issue.labels?.filter(l =>
          !l.name.toLowerCase().startsWith('assigned:') &&
          !l.name.toLowerCase().startsWith('retry:') &&
          !Object.keys(STAGE_CONFIG).includes(l.name.toLowerCase())
        ).slice(0, 3).map((label, i) => (
          <span
            key={i}
            className="pipeline-label"
            style={{ background: `#${label.color}22`, color: `#${label.color}`, borderColor: `#${label.color}44` }}
          >
            {label.name}
          </span>
        ))}
      </div>
      <div className="pipeline-card-footer">
        {issue.assignees?.length > 0 && (
          <div className="pipeline-avatars">
            {issue.assignees.slice(0, 2).map((a, i) => (
              <div key={i} className="pipeline-avatar" title={a.login}>
                {a.avatar_url ? (
                  <img src={a.avatar_url} alt={a.login} />
                ) : (
                  <User size={10} />
                )}
              </div>
            ))}
          </div>
        )}
        {issue.comments_count > 0 && (
          <div className="pipeline-comments">
            <MessageSquare size={10} />
            <span>{issue.comments_count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PRCard({ pr }) {
  const stateColor =
    pr.state === 'merged' ? 'var(--accent-purple)' :
    pr.state === 'open' ? 'var(--accent-green)' :
    'var(--accent-red)';

  return (
    <div className="pipeline-card pr-card">
      <div className="pipeline-card-header">
        <GitPullRequest size={14} style={{ color: stateColor }} />
        <span className="pipeline-card-number">#{pr.number}</span>
        {pr.checks_passed === true && <CheckCircle2 size={12} className="check-pass" />}
      </div>
      <div className="pipeline-card-title">{pr.title}</div>
      <AssignmentLabel labels={pr.labels} />
      <div className="pipeline-card-meta">
        <span className="pr-branch">{pr.head_branch}</span>
        {pr.labels?.filter(l =>
          !l.name.toLowerCase().startsWith('assigned:') &&
          !l.name.toLowerCase().startsWith('retry:') &&
          !Object.keys(STAGE_CONFIG).includes(l.name.toLowerCase())
        ).slice(0, 2).map((label, i) => (
          <span
            key={i}
            className="pipeline-label"
            style={{ background: `#${label.color}22`, color: `#${label.color}`, borderColor: `#${label.color}44` }}
          >
            {label.name}
          </span>
        ))}
      </div>
      <div className="pipeline-card-footer">
        {pr.author && (
          <div className="pipeline-avatars">
            <div className="pipeline-avatar" title={pr.author.login}>
              {pr.author.avatar_url ? (
                <img src={pr.author.avatar_url} alt={pr.author.login} />
              ) : (
                <User size={10} />
              )}
            </div>
          </div>
        )}
        <div className="pr-stats">
          <span className="pr-additions">+{pr.additions}</span>
          <span className="pr-deletions">-{pr.deletions}</span>
        </div>
      </div>
    </div>
  );
}

function GitHubPipeline({ summary, compact }) {
  const [expandedStages, setExpandedStages] = useState(new Set());

  const toggleStage = (name) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (!summary || summary.error || !summary.configured) {
    const errorMsg = summary?.error || (!summary?.configured ? 'GitHub ist nicht konfiguriert' : null);
    return (
      <div className="pipeline-container">
        <div className="pipeline-header">
          <h3>GitHub Pipeline</h3>
        </div>
        <div className="pipeline-loading glass">
          {errorMsg ? (
            <div style={{ textAlign: 'center' }}>
              <AlertTriangle size={24} style={{ color: 'var(--accent-orange)', marginBottom: 8 }} />
              <p style={{ color: 'var(--accent-orange)', marginBottom: 4 }}>{errorMsg}</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Konfiguriere GitHub unter Einstellungen &rarr; GitHub (Token, Owner, Repo).
              </p>
            </div>
          ) : (
            <p>Warte auf GitHub-Daten...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`pipeline-container ${compact ? 'compact' : ''}`}>
      <div className="pipeline-header">
        <h3>GitHub Pipeline</h3>
        <div className="pipeline-stats">
          <span className="stat-badge issues">
            <CircleDot size={12} />
            {summary.open_issues} Issues
          </span>
          <span className="stat-badge prs">
            <GitPullRequest size={12} />
            {summary.open_prs} PRs
          </span>
          {summary.last_sync && (
            <span className="pipeline-sync-time">
              {new Date(summary.last_sync).toLocaleTimeString('de-DE')}
            </span>
          )}
        </div>
      </div>

      <div className="pipeline-board">
        {(summary.pipeline || []).map((stage) => {
          const config = STAGE_CONFIG[stage.name] || { color: 'var(--text-tertiary)', icon: Clock };
          const StageIcon = config.icon;
          const items = [...(stage.issues || []), ...(stage.pull_requests || [])];
          const isExpanded = expandedStages.has(stage.name);
          const maxItems = compact ? 2 : DEFAULT_VISIBLE;
          const displayItems = isExpanded ? items : items.slice(0, maxItems);
          const remaining = items.length - maxItems;

          return (
            <div key={stage.name} className="pipeline-column">
              <button
                className="pipeline-column-header"
                onClick={() => toggleStage(stage.name)}
              >
                <StageIcon size={14} style={{ color: config.color }} />
                <span className="column-name">{stage.name}</span>
                <span className="column-count">{items.length}</span>
                {items.length > maxItems && (
                  isExpanded ?
                    <ChevronDown size={12} className="column-chevron" /> :
                    <ChevronRight size={12} className="column-chevron" />
                )}
              </button>
              <div className="pipeline-column-cards">
                {displayItems.map((item) =>
                  'head_branch' in item ? (
                    <PRCard key={`pr-${item.number}`} pr={item} />
                  ) : (
                    <IssueCard key={`issue-${item.number}`} issue={item} />
                  )
                )}
                {!isExpanded && remaining > 0 && (
                  <button
                    className="pipeline-more"
                    onClick={() => toggleStage(stage.name)}
                  >
                    +{remaining} weitere
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default GitHubPipeline;
