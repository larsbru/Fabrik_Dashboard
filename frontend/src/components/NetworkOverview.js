import React from 'react';
import { Server, Cpu, MemoryStick, HardDrive, Bot, Activity } from 'lucide-react';
import './NetworkOverview.css';

function MetricRing({ value, color, size = 48, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="metric-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color, percent }) {
  return (
    <div className="stat-card glass">
      <div className="stat-card-top">
        <div className="stat-icon" style={{ color }}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
        {percent !== undefined && (
          <MetricRing value={percent} color={color} size={40} strokeWidth={3} />
        )}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  );
}

function NetworkOverview({ summary, machines = [] }) {
  if (!summary) {
    return (
      <div className="overview-grid">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="stat-card glass skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="overview-grid">
      <StatCard
        icon={Server}
        label="Maschinen"
        value={`${summary.online}/${summary.total_machines}`}
        subtitle="online"
        color="var(--accent-blue)"
      />
      <StatCard
        icon={Cpu}
        label="CPU Gesamt"
        value={`${summary.total_cpu_usage}%`}
        color={summary.total_cpu_usage > 80 ? 'var(--accent-red)' : 'var(--accent-cyan)'}
        percent={summary.total_cpu_usage}
      />
      <StatCard
        icon={MemoryStick}
        label="RAM Gesamt"
        value={`${summary.total_memory_usage}%`}
        color={summary.total_memory_usage > 80 ? 'var(--accent-orange)' : 'var(--accent-green)'}
        percent={summary.total_memory_usage}
      />
      <StatCard
        icon={HardDrive}
        label="Speicher"
        value={`${summary.total_disk_usage}%`}
        color={summary.total_disk_usage > 90 ? 'var(--accent-red)' : 'var(--accent-purple)'}
        percent={summary.total_disk_usage}
      />
      <StatCard
        icon={Bot}
        label="Agenten"
        value={summary.active_agents}
        subtitle="aktiv"
        color="var(--accent-yellow)"
      />
    </div>
  );
}

export default NetworkOverview;
