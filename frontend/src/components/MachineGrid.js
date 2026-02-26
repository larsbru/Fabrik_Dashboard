import React from 'react';
import { Server, Cpu, MemoryStick, HardDrive, RefreshCw, Wifi, WifiOff, AlertTriangle, Box } from 'lucide-react';
import './MachineGrid.css';

const STATUS_CONFIG = {
  online: { color: 'var(--status-online)', icon: Wifi, label: 'Online' },
  offline: { color: 'var(--status-offline)', icon: WifiOff, label: 'Offline' },
  degraded: { color: 'var(--status-degraded)', icon: AlertTriangle, label: 'Degraded' },
  unknown: { color: 'var(--status-unknown)', icon: Server, label: 'Unknown' },
};

function MiniBar({ value, color, height = 4 }) {
  return (
    <div className="mini-bar" style={{ height }}>
      <div
        className="mini-bar-fill"
        style={{
          width: `${Math.min(value, 100)}%`,
          background: value > 90 ? 'var(--accent-red)' : color,
        }}
      />
    </div>
  );
}

function MachineCard({ machine, onSelect, onRefresh, compact }) {
  const status = STATUS_CONFIG[machine.status] || STATUS_CONFIG.unknown;
  const StatusIcon = status.icon;

  return (
    <div
      className={`machine-card glass ${compact ? 'compact' : ''}`}
      onClick={() => onSelect(machine)}
    >
      <div className="machine-card-header">
        <div className="machine-status-dot" style={{ background: status.color }} />
        <div className="machine-info">
          <span className="machine-name">{machine.name || machine.hostname || machine.ip}</span>
          <span className="machine-ip">{machine.ip}</span>
        </div>
        <button
          className="machine-refresh-btn"
          onClick={(e) => { e.stopPropagation(); onRefresh(machine.ip); }}
          title="Aktualisieren"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {machine.status !== 'offline' && machine.status !== 'unknown' && (
        <div className="machine-metrics">
          <div className="metric-row">
            <Cpu size={12} />
            <span className="metric-label">CPU</span>
            <MiniBar value={machine.cpu?.usage_percent || 0} color="var(--accent-cyan)" />
            <span className="metric-value">{machine.cpu?.usage_percent || 0}%</span>
          </div>
          <div className="metric-row">
            <MemoryStick size={12} />
            <span className="metric-label">RAM</span>
            <MiniBar value={machine.memory?.usage_percent || 0} color="var(--accent-green)" />
            <span className="metric-value">{machine.memory?.usage_percent || 0}%</span>
          </div>
          <div className="metric-row">
            <HardDrive size={12} />
            <span className="metric-label">Disk</span>
            <MiniBar
              value={machine.disks?.[0]?.usage_percent || 0}
              color="var(--accent-purple)"
            />
            <span className="metric-value">{machine.disks?.[0]?.usage_percent || 0}%</span>
          </div>
        </div>
      )}

      {machine.agents && machine.agents.length > 0 && (
        <div className="machine-agents">
          {machine.agents.slice(0, 3).map((agent, i) => (
            <div key={i} className="agent-badge">
              <Box size={10} />
              <span>{agent.name}</span>
              <div
                className="agent-dot"
                style={{
                  background: agent.status === 'running' ? 'var(--status-online)' : 'var(--status-offline)',
                }}
              />
            </div>
          ))}
          {machine.agents.length > 3 && (
            <span className="agents-more">+{machine.agents.length - 3}</span>
          )}
        </div>
      )}

      <div className="machine-card-footer">
        <span className="machine-role">{machine.role}</span>
        {machine.auto_discovered && <span className="auto-badge">auto</span>}
        {machine.tags?.slice(0, 2).map((tag, i) => (
          <span key={i} className="tag-badge">{tag}</span>
        ))}
      </div>
    </div>
  );
}

function MachineGrid({ machines = [], onSelect, onRefresh, compact }) {
  if (!machines.length) {
    return (
      <div className="machine-grid-empty glass">
        <Server size={40} strokeWidth={1} />
        <p>Keine Maschinen gefunden</p>
        <span>Starte einen Netzwerkscan oder konfiguriere Maschinen in machines.yml</span>
      </div>
    );
  }

  // Sort: online first, then by name
  const sorted = [...machines].sort((a, b) => {
    const order = { online: 0, degraded: 1, unknown: 2, offline: 3 };
    const diff = (order[a.status] ?? 4) - (order[b.status] ?? 4);
    if (diff !== 0) return diff;
    return (a.name || a.ip).localeCompare(b.name || b.ip);
  });

  return (
    <div className={`machine-grid ${compact ? 'compact' : ''}`}>
      <div className="machine-grid-header">
        <h3>Maschinen</h3>
        <span className="machine-count">{machines.length} gesamt</span>
      </div>
      <div className="machine-grid-cards">
        {sorted.map((machine) => (
          <MachineCard
            key={machine.ip}
            machine={machine}
            onSelect={onSelect}
            onRefresh={onRefresh}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

export default MachineGrid;
