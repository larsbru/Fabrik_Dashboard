import React from 'react';
import { Cpu, MemoryStick, HardDrive } from 'lucide-react';
import './SystemStatsBar.css';

function MiniIndicator({ value, color }) {
  return (
    <div className="stats-mini-bar">
      <div
        className="stats-mini-bar-fill"
        style={{
          width: `${Math.min(value, 100)}%`,
          background: value > 90 ? 'var(--accent-red)' : color,
        }}
      />
    </div>
  );
}

function SystemStatsBar({ machines = [] }) {
  const onlineMachines = machines.filter(
    m => m.status === 'online' || m.status === 'degraded'
  );

  if (onlineMachines.length === 0) return null;

  return (
    <div className="system-stats-bar">
      <div className="stats-bar-scroll">
        {onlineMachines.map(m => {
          const diskPct = m.disks?.[0]?.usage_percent || 0;
          return (
            <div key={m.ip} className="stats-machine-chip">
              <span className="stats-machine-name">{m.name || m.hostname || m.ip}</span>
              <div className="stats-metrics">
                <div className="stats-metric">
                  <Cpu size={10} />
                  <MiniIndicator value={m.cpu?.usage_percent || 0} color="var(--accent-cyan)" />
                  <span className="stats-metric-val">{m.cpu?.usage_percent || 0}%</span>
                </div>
                <div className="stats-metric">
                  <MemoryStick size={10} />
                  <MiniIndicator value={m.memory?.usage_percent || 0} color="var(--accent-green)" />
                  <span className="stats-metric-val">{m.memory?.usage_percent || 0}%</span>
                </div>
                <div className="stats-metric">
                  <HardDrive size={10} />
                  <MiniIndicator value={diskPct} color="var(--accent-purple)" />
                  <span className="stats-metric-val">{diskPct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SystemStatsBar;
