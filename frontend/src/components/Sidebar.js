import React from 'react';
import { LayoutDashboard, Server, GitBranch, Settings, Cpu, Wifi, WifiOff } from 'lucide-react';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'machines', label: 'Maschinen', icon: Server },
  { id: 'github', label: 'GitHub', icon: GitBranch },
  { id: 'settings', label: 'Einstellungen', icon: Settings },
];

function Sidebar({ currentView, onNavigate, machines = [] }) {
  const onlineCount = machines.filter(m => m.status === 'online').length;
  const totalCount = machines.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Cpu size={24} strokeWidth={1.5} />
          <div className="sidebar-logo-text">
            <span className="sidebar-title">Fabrik</span>
            <span className="sidebar-subtitle">Network Dashboard</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${currentView === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <Icon size={18} strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="network-indicator">
          <div className="network-status">
            {onlineCount > 0 ? (
              <Wifi size={14} className="status-icon online" />
            ) : (
              <WifiOff size={14} className="status-icon offline" />
            )}
            <span className="network-label">Netzwerk 44</span>
          </div>
          <span className="network-count">
            {onlineCount}/{totalCount} online
          </span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
