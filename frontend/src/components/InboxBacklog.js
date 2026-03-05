import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import './InboxBacklog.css';

const PRIO_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e', done: '#6b7280' };
const PRIO_LABELS = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig', done: 'Erledigt' };

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${color || '#6366f1'}` }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function ProcessFlow({ stats }) {
  const steps = [
    { icon: '📥', label: 'Inbox', value: stats.inbox_pending ?? '–', sub: 'wartend', color: '#6366f1' },
    { icon: '⚙️', label: 'Verarbeitet', value: stats.inbox_processed ?? '–', sub: 'analysiert', color: '#8b5cf6' },
    { icon: '📋', label: 'Backlog', value: stats.backlog_items ?? '–', sub: 'offen', color: '#3b82f6' },
    { icon: '🔴', label: 'Hoch', value: stats.backlog_high ?? '–', sub: 'prio', color: '#ef4444' },
  ];

  return (
    <div className="process-flow">
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          <div className="flow-step" style={{ '--step-color': step.color }}>
            <div className="flow-icon">{step.icon}</div>
            <div className="flow-value">{step.value}</div>
            <div className="flow-label">{step.label}</div>
            <div className="flow-sub">{step.sub}</div>
          </div>
          {i < steps.length - 1 && <div className="flow-arrow">→</div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function ProcessedList({ items }) {
  if (!items || items.length === 0) {
    return <div className="empty-state">Keine verarbeiteten Einträge gefunden.</div>;
  }
  return (
    <div className="processed-list">
      {items.map((item) => (
        <div key={item.id} className="processed-item">
          <span className="item-icon">{item.typ_icon}</span>
          <div className="item-body">
            <div className="item-title">{item.title}</div>
            <div className="item-meta">
              {item.date && <span className="item-date">{item.date}</span>}
              {item.typ && <span className="item-typ">{item.typ}</span>}
              {item.backlog_ref && (
                <span className="item-ref">→ {item.backlog_ref}</span>
              )}
            </div>
          </div>
          <span className={`item-status status-${item.status}`}>{item.status}</span>
        </div>
      ))}
    </div>
  );
}

function BacklogSection({ section }) {
  const [collapsed, setCollapsed] = useState(section.priority === 'done');
  const activeItems = section.items.filter(i => !i.obsolete);
  const doneItems = section.items.filter(i => i.obsolete);

  return (
    <div className={`backlog-section prio-${section.priority}`}>
      <div className="section-header" onClick={() => setCollapsed(c => !c)}>
        <span className="section-emoji">{section.emoji}</span>
        <span className="section-title">{section.title}</span>
        <span className="section-count">{activeItems.length} aktiv</span>
        {doneItems.length > 0 && (
          <span className="section-done">{doneItems.length} erledigt</span>
        )}
        <span className="section-toggle">{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div className="section-items">
          {activeItems.map((item, i) => (
            <div key={i} className="backlog-item">
              {item.id && <span className="b-id">{item.id}</span>}
              <span className="b-title">{item.title || item.raw}</span>
            </div>
          ))}
          {doneItems.length > 0 && activeItems.length === 0 && (
            <div className="no-active">Alle erledigt ✅</div>
          )}
        </div>
      )}
    </div>
  );
}

function InboxBacklog() {
  const { get } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('flow');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await get('/api/inbox/overview');
      if (result) setData(result);
      else setError('Keine Daten erhalten. Ist der Backend-Pfad korrekt gemountet?');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="inbox-loading">⏳ Lade Inbox & Backlog…</div>;
  if (error) return <div className="inbox-error">❌ {error}</div>;
  if (!data) return null;

  const { stats, pending_inbox, processed, backlog, gardener_meta } = data;

  return (
    <div className="inbox-backlog">
      <div className="ib-header">
        <h2>📬 Inbox → Backlog</h2>
        {gardener_meta?.generiert_am && (
          <span className="gardener-ts">
            🌱 Gardener: {gardener_meta.generiert_am}
          </span>
        )}
        <button className="refresh-btn" onClick={fetchData}>↻ Aktualisieren</button>
      </div>

      <div className="stats-row">
        <StatCard icon="📥" value={stats.inbox_pending} label="Inbox wartend" color="#6366f1" />
        <StatCard icon="✅" value={stats.inbox_processed} label="Verarbeitet" color="#8b5cf6" />
        <StatCard icon="📋" value={stats.backlog_items} label="Backlog Items" color="#3b82f6" />
        <StatCard icon="🔴" value={stats.backlog_high} label="Hohe Priorität" color="#ef4444" />
        <StatCard icon="🟡" value={stats.backlog_medium} label="Mittlere Prio" color="#f59e0b" />
        <StatCard icon="🟢" value={stats.backlog_low} label="Niedrige Prio" color="#22c55e" />
      </div>

      <div className="tab-bar">
        {[
          { id: 'flow', label: '🔄 Pipeline' },
          { id: 'inbox', label: `📥 Inbox (${pending_inbox.length})` },
          { id: 'processed', label: `⚙️ Verarbeitet (${processed.length})` },
          { id: 'backlog', label: `📋 Backlog (${stats.backlog_items})` },
        ].map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'flow' && (
          <div className="flow-panel">
            <ProcessFlow stats={stats} />
            <div className="flow-legend">
              <p>Der CEO gibt Ideen per Datei in die <strong>Inbox</strong> ein → Watcher analysiert mit Ollama →
              IDEA-YAML landet in <strong>inbox_processed/</strong> → CEO genehmigt →
              <strong>Backlog</strong> erhält B-Nummer → Gardener pflegt + priorisiert.</p>
            </div>
          </div>
        )}
        {activeTab === 'inbox' && (
          <div className="inbox-panel">
            <h3>Wartende Inbox-Dateien</h3>
            {pending_inbox.length === 0 ? (
              <div className="empty-state">✅ Inbox ist leer.</div>
            ) : (
              <div className="file-list">
                {pending_inbox.map(f => (
                  <div key={f.name} className="file-item">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{f.name}</span>
                    <span className="file-size">{Math.round(f.size / 1024)} KB</span>
                    <span className="file-date">{f.modified?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'processed' && (
          <div className="processed-panel">
            <h3>Verarbeitete Einträge</h3>
            <ProcessedList items={processed} />
          </div>
        )}
        {activeTab === 'backlog' && (
          <div className="backlog-panel">
            <h3>Fabrik-Backlog</h3>
            {backlog.sections?.map((section, i) => (
              <BacklogSection key={i} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default InboxBacklog;
