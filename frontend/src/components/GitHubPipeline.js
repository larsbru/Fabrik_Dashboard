import React from 'react';
import { GitPullRequest, CircleDot, CheckCircle2, Clock, MessageSquare, User, Tag } from 'lucide-react';
import './GitHubPipeline.css';

const STAGE_CONFIG = {
  'Backlog': { color: 'var(--text-tertiary)', icon: Clock },
  'In Progress': { color: 'var(--accent-blue)', icon: CircleDot },
  'In Review': { color: 'var(--accent-orange)', icon: GitPullRequest },
  'Done': { color: 'var(--accent-green)', icon: CheckCircle2 },
};

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
      <div className="pipeline-card-meta">
        {issue.labels?.slice(0, 3).map((label, i) => (
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
      <div className="pipeline-card-meta">
        <span className="pr-branch">{pr.head_branch}</span>
        {pr.labels?.slice(0, 2).map((label, i) => (
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
  if (!summary) {
    return (
      <div className="pipeline-container">
        <div className="pipeline-header">
          <h3>GitHub Pipeline</h3>
        </div>
        <div className="pipeline-loading glass">
          <p>Warte auf GitHub-Daten...</p>
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
        </div>
      </div>

      <div className="pipeline-board">
        {(summary.pipeline || []).map((stage) => {
          const config = STAGE_CONFIG[stage.name] || STAGE_CONFIG['Backlog'];
          const StageIcon = config.icon;
          const items = [...(stage.issues || []), ...(stage.pull_requests || [])];
          const displayItems = compact ? items.slice(0, 4) : items;

          return (
            <div key={stage.name} className="pipeline-column">
              <div className="pipeline-column-header">
                <StageIcon size={14} style={{ color: config.color }} />
                <span className="column-name">{stage.name}</span>
                <span className="column-count">{items.length}</span>
              </div>
              <div className="pipeline-column-cards">
                {displayItems.map((item) =>
                  'head_branch' in item ? (
                    <PRCard key={`pr-${item.number}`} pr={item} />
                  ) : (
                    <IssueCard key={`issue-${item.number}`} issue={item} />
                  )
                )}
                {compact && items.length > 4 && (
                  <div className="pipeline-more">+{items.length - 4} weitere</div>
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
