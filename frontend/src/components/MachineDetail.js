import React from 'react';
import { ArrowLeft, RefreshCw, Cpu, MemoryStick, HardDrive, Clock, Terminal, Box, Activity, Tag, CircleDot } from 'lucide-react';
import './MachineDetail.css';

function UsageGauge({ value, label, color, icon: Icon }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="usage-gauge">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
        <circle
          cx="60" cy="60" r="54"
          fill="none"
          stroke={value > 90 ? 'var(--accent-red)' : color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="gauge-content">
        <Icon size={16} strokeWidth={1.5} />
        <span className="gauge-value">{value}%</span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}

function ContainerMiniBar({ value, color }) {
  return (
    <div className="container-mini-bar">
      <div
        className="container-mini-bar-fill"
        style={{
          width: `${Math.min(value, 100)}%`,
          background: value > 90 ? 'var(--accent-red)' : color,
        }}
      />
    </div>
  );
}

function getAssignedTickets(githubSummary, machineName) {
  if (!githubSummary?.pipeline || !machineName) return [];
  const tickets = [];
  const name = machineName.toLowerCase();
  for (const stage of githubSummary.pipeline) {
    for (const issue of (stage.issues || [])) {
      if (issue.assigned_machine?.toLowerCase() === name) {
        tickets.push({ ...issue, stage: stage.name });
      }
    }
    for (const pr of (stage.pull_requests || [])) {
      if (pr.assigned_machine?.toLowerCase() === name) {
        tickets.push({ ...pr, stage: stage.name, isPR: true });
      }
    }
  }
  return tickets;
}

function MachineDetail({ machine, onBack, onRefresh, githubSummary }) {
  if (!machine) return null;

  const statusColor =
    machine.status === 'online' ? 'var(--status-online)' :
    machine.status === 'degraded' ? 'var(--status-degraded)' :
    machine.status === 'offline' ? 'var(--status-offline)' : 'var(--status-unknown)';

  const machineName = machine.name || machine.hostname || machine.ip;
  const assignedTickets = getAssignedTickets(githubSummary, machineName);

  return (
    <div className="machine-detail animate-in">
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>Zurück</span>
        </button>
        <div className="detail-title-row">
          <div className="detail-status-dot" style={{ background: statusColor }} />
          <div>
            <h2 className="detail-name">{machineName}</h2>
            <span className="detail-meta">
              {machine.ip} &middot; {machine.role} &middot; {machine.os_info || 'Unknown OS'}
            </span>
          </div>
        </div>
        <button className="detail-refresh-btn" onClick={() => onRefresh(machine.ip)}>
          <RefreshCw size={16} />
          Aktualisieren
        </button>
      </div>

      {/* Gauges */}
      <div className="detail-gauges">
        <UsageGauge
          value={machine.cpu?.usage_percent || 0}
          label="CPU"
          color="var(--accent-cyan)"
          icon={Cpu}
        />
        <UsageGauge
          value={machine.memory?.usage_percent || 0}
          label="RAM"
          color="var(--accent-green)"
          icon={MemoryStick}
        />
        {machine.disks?.map((disk, i) => (
          <UsageGauge
            key={i}
            value={disk.usage_percent || 0}
            label={`Disk ${disk.mount_point}`}
            color="var(--accent-purple)"
            icon={HardDrive}
          />
        ))}
      </div>

      {/* Details Grid */}
      <div className="detail-grid">
        {/* System Info */}
        <div className="detail-section glass">
          <h3><Terminal size={14} /> System</h3>
          <div className="info-rows">
            <div className="info-row">
              <span>Hostname</span>
              <span>{machine.hostname || '—'}</span>
            </div>
            <div className="info-row">
              <span>OS</span>
              <span>{machine.os_info || '—'}</span>
            </div>
            <div className="info-row">
              <span>Uptime</span>
              <span>{machine.uptime || '—'}</span>
            </div>
            <div className="info-row">
              <span>CPU Kerne</span>
              <span>{machine.cpu?.cores || '—'}</span>
            </div>
            <div className="info-row">
              <span>Load Avg</span>
              <span>
                {machine.cpu?.load_avg_1m?.toFixed(2) || '—'} /{' '}
                {machine.cpu?.load_avg_5m?.toFixed(2) || '—'} /{' '}
                {machine.cpu?.load_avg_15m?.toFixed(2) || '—'}
              </span>
            </div>
            <div className="info-row">
              <span>RAM Total</span>
              <span>{machine.memory?.total_gb?.toFixed(1) || '—'} GB</span>
            </div>
            <div className="info-row">
              <span>RAM Verwendet</span>
              <span>{machine.memory?.used_gb?.toFixed(1) || '—'} GB</span>
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="detail-section glass">
          <h3><Activity size={14} /> Services</h3>
          {machine.services?.length > 0 ? (
            <div className="services-list">
              {machine.services.map((svc, i) => (
                <div key={i} className="service-item">
                  <div
                    className="service-dot"
                    style={{ background: svc.running ? 'var(--status-online)' : 'var(--status-offline)' }}
                  />
                  <span className="service-name">{svc.name}</span>
                  <span className="service-status">
                    {svc.running ? 'running' : 'stopped'}
                  </span>
                  {svc.pid && <span className="service-pid">PID {svc.pid}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Keine Services erkannt</div>
          )}
        </div>

        {/* Agents / Containers — Enhanced */}
        <div className="detail-section glass">
          <h3><Box size={14} /> Container</h3>
          {machine.agents?.length > 0 ? (
            <div className="agents-list">
              {machine.agents.map((agent, i) => (
                <div key={i} className="agent-item-enhanced">
                  <div className="agent-item-top">
                    <div
                      className="agent-status-dot"
                      style={{ background: agent.status === 'running' ? 'var(--status-online)' : 'var(--status-offline)' }}
                    />
                    <div className="agent-info">
                      <span className="agent-name">{agent.name}</span>
                      {agent.command && <span className="agent-command">{agent.command}</span>}
                    </div>
                    <span className={`agent-state ${agent.status}`}>{agent.status}</span>
                  </div>
                  {agent.status === 'running' && (agent.cpu_percent > 0 || agent.memory_percent > 0) && (
                    <div className="agent-stats-row">
                      <div className="agent-stat">
                        <Cpu size={10} />
                        <ContainerMiniBar value={agent.cpu_percent} color="var(--accent-cyan)" />
                        <span>{agent.cpu_percent}%</span>
                      </div>
                      <div className="agent-stat">
                        <MemoryStick size={10} />
                        <ContainerMiniBar value={agent.memory_percent} color="var(--accent-green)" />
                        <span>{agent.memory_usage || `${agent.memory_percent}%`}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Keine Container gefunden</div>
          )}
        </div>

        {/* Assigned Tickets */}
        <div className="detail-section glass">
          <h3><Tag size={14} /> Zugewiesene Tickets</h3>
          {assignedTickets.length > 0 ? (
            <div className="tickets-list">
              {assignedTickets.map((ticket, i) => (
                <div key={i} className="ticket-item">
                  <CircleDot
                    size={12}
                    style={{ color: ticket.isPR ? 'var(--accent-purple)' : 'var(--accent-green)' }}
                  />
                  <span className="ticket-number">#{ticket.number}</span>
                  <span className="ticket-title">{ticket.title}</span>
                  <span className="ticket-stage">{ticket.stage}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Keine zugewiesenen Tickets</div>
          )}
        </div>

        {/* Tags */}
        <div className="detail-section glass">
          <h3>Tags & Konfiguration</h3>
          <div className="tags-row">
            <span className="detail-tag role">{machine.role}</span>
            {machine.auto_discovered && <span className="detail-tag auto">auto-discovered</span>}
            {machine.tags?.map((tag, i) => (
              <span key={i} className="detail-tag">{tag}</span>
            ))}
          </div>
          {machine.description && (
            <p className="machine-description">{machine.description}</p>
          )}
          <div className="info-rows" style={{ marginTop: 12 }}>
            <div className="info-row">
              <span>SSH User</span>
              <span>{machine.ssh_user}</span>
            </div>
            <div className="info-row">
              <span>SSH Port</span>
              <span>{machine.ssh_port}</span>
            </div>
            <div className="info-row">
              <span>Letzter Scan</span>
              <span>{machine.last_scan ? new Date(machine.last_scan).toLocaleString('de-DE') : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MachineDetail;
