import React from 'react';
import { GitPullRequest, CircleDot, CheckCircle2, XCircle, GitMerge, Clock } from 'lucide-react';
import './GitHubActivity.css';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'gerade eben';
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
  if (seconds < 604800) return `vor ${Math.floor(seconds / 86400)} Tagen`;
  return date.toLocaleDateString('de-DE');
}

function ActivityItem({ type, title, number, state, author, time }) {
  const iconMap = {
    'issue-open': { icon: CircleDot, color: 'var(--accent-green)' },
    'issue-closed': { icon: CheckCircle2, color: 'var(--accent-purple)' },
    'pr-open': { icon: GitPullRequest, color: 'var(--accent-green)' },
    'pr-merged': { icon: GitMerge, color: 'var(--accent-purple)' },
    'pr-closed': { icon: XCircle, color: 'var(--accent-red)' },
  };

  const { icon: Icon, color } = iconMap[type] || iconMap['issue-open'];

  return (
    <div className="activity-item">
      <div className="activity-icon" style={{ color }}>
        <Icon size={14} />
      </div>
      <div className="activity-content">
        <span className="activity-title">{title}</span>
        <span className="activity-meta">
          #{number} &middot; {author} &middot; {timeAgo(time)}
        </span>
      </div>
    </div>
  );
}

function GitHubActivity({ summary }) {
  if (!summary) return null;

  // Combine issues and PRs into a timeline
  const activities = [];

  // Get recent issues
  for (const stage of (summary.pipeline || [])) {
    for (const issue of (stage.issues || [])) {
      activities.push({
        type: issue.state === 'open' ? 'issue-open' : 'issue-closed',
        title: issue.title,
        number: issue.number,
        author: issue.author?.login || 'unknown',
        time: issue.updated_at || issue.created_at,
      });
    }
    for (const pr of (stage.pull_requests || [])) {
      activities.push({
        type: pr.state === 'merged' ? 'pr-merged' : pr.state === 'open' ? 'pr-open' : 'pr-closed',
        title: pr.title,
        number: pr.number,
        author: pr.author?.login || 'unknown',
        time: pr.updated_at || pr.created_at,
      });
    }
  }

  // Sort by time descending
  activities.sort((a, b) => new Date(b.time) - new Date(a.time));

  return (
    <div className="activity-container">
      <div className="activity-header">
        <h3>Letzte Aktivität</h3>
        <span className="activity-count">{activities.length} Events</span>
      </div>
      <div className="activity-list glass">
        {activities.slice(0, 20).map((activity, i) => (
          <ActivityItem key={`${activity.type}-${activity.number}-${i}`} {...activity} />
        ))}
        {activities.length === 0 && (
          <div className="activity-empty">
            <Clock size={24} strokeWidth={1} />
            <span>Keine Aktivität vorhanden</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitHubActivity;
