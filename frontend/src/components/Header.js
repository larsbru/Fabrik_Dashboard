import React from 'react';
import { RefreshCw, Radio, Scan, GitBranch } from 'lucide-react';
import './Header.css';

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  machines: 'Maschinen',
  github: 'GitHub Pipeline',
  settings: 'Einstellungen',
};

function Header({ isConnected, config, onScan, onSync, currentView }) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">{VIEW_TITLES[currentView] || 'Dashboard'}</h1>
        {config && (
          <span className="header-meta">
            {config.network_subnet} &middot; {config.github_repo || 'Not configured'}
          </span>
        )}
      </div>
      <div className="header-right">
        <div className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          <Radio size={12} />
          <span>{isConnected ? 'Live' : 'Offline'}</span>
        </div>
        {(currentView === 'dashboard' || currentView === 'machines') && (
          <button className="header-btn" onClick={onScan} title="Netzwerk scannen">
            <Scan size={16} />
            <span>Scan</span>
          </button>
        )}
        {(currentView === 'dashboard' || currentView === 'github') && (
          <button className="header-btn" onClick={onSync} title="GitHub synchronisieren">
            <GitBranch size={16} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
