import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import SystemStatsBar from './components/SystemStatsBar';
import NetworkOverview from './components/NetworkOverview';
import MachineGrid from './components/MachineGrid';
import MachineDetail from './components/MachineDetail';
import GitHubPipeline from './components/GitHubPipeline';
import GitHubActivity from './components/GitHubActivity';
import Settings from './components/Settings';
import './styles/App.css';

const VIEWS = {
  DASHBOARD: 'dashboard',
  MACHINES: 'machines',
  GITHUB: 'github',
  SETTINGS: 'settings',
};

function App() {
  const { isConnected, lastMessage } = useWebSocket();
  const { get, post } = useApi();
  const [currentView, setCurrentView] = useState(VIEWS.DASHBOARD);
  const [machines, setMachines] = useState([]);
  const [networkSummary, setNetworkSummary] = useState(null);
  const [githubSummary, setGithubSummary] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [config, setConfig] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Initial data fetch
  const fetchData = useCallback(async () => {
    const [machinesData, summaryData, githubData, configData] = await Promise.all([
      get('/api/machines'),
      get('/api/machines/summary'),
      get('/api/github/summary'),
      get('/api/config'),
    ]);
    if (machinesData) setMachines(machinesData);
    if (summaryData) setNetworkSummary(summaryData);
    if (githubData) setGithubSummary(githubData);
    if (configData) setConfig(configData);
  }, [get]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage) return;

    setLastUpdated(new Date());

    switch (lastMessage.type) {
      case 'network_update':
      case 'metrics_update':
        if (lastMessage.data?.machines) setMachines(lastMessage.data.machines);
        if (lastMessage.data?.summary) setNetworkSummary(lastMessage.data.summary);
        break;
      case 'github_update':
        setGithubSummary(lastMessage.data);
        break;
      default:
        break;
    }
  }, [lastMessage]);

  const handleScan = useCallback(async () => {
    await post('/api/machines/scan');
  }, [post]);

  const handleGitHubSync = useCallback(async () => {
    await post('/api/github/sync');
  }, [post]);

  const handleRefreshMachine = useCallback(async (ip) => {
    const updated = await post(`/api/machines/${ip}/refresh`);
    if (updated) {
      setMachines(prev => prev.map(m => m.ip === ip ? updated : m));
      if (selectedMachine?.ip === ip) setSelectedMachine(updated);
    }
  }, [post, selectedMachine]);

  const handleNavigate = useCallback((view) => {
    setCurrentView(view);
    setSelectedMachine(null);
    setSidebarOpen(false);
  }, []);

  const showStatsBar = currentView === VIEWS.DASHBOARD || currentView === VIEWS.MACHINES;

  const renderContent = () => {
    switch (currentView) {
      case VIEWS.DASHBOARD:
        return (
          <div className="dashboard-view">
            <NetworkOverview summary={networkSummary} machines={machines} />
            <div className="dashboard-grid">
              <div className="dashboard-left">
                <MachineGrid
                  machines={machines}
                  onSelect={setSelectedMachine}
                  onRefresh={handleRefreshMachine}
                  githubSummary={githubSummary}
                  compact
                />
              </div>
              <div className="dashboard-right">
                <GitHubPipeline summary={githubSummary} compact />
              </div>
            </div>
          </div>
        );
      case VIEWS.MACHINES:
        return (
          <div className="machines-view">
            {selectedMachine ? (
              <MachineDetail
                machine={selectedMachine}
                onBack={() => setSelectedMachine(null)}
                onRefresh={handleRefreshMachine}
                githubSummary={githubSummary}
              />
            ) : (
              <MachineGrid
                machines={machines}
                onSelect={setSelectedMachine}
                onRefresh={handleRefreshMachine}
                githubSummary={githubSummary}
              />
            )}
          </div>
        );
      case VIEWS.GITHUB:
        return (
          <div className="github-view">
            <GitHubPipeline summary={githubSummary} />
            <GitHubActivity summary={githubSummary} />
          </div>
        );
      case VIEWS.SETTINGS:
        return <Settings />;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        machines={machines}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Header
          isConnected={isConnected}
          config={config}
          onScan={handleScan}
          onSync={handleGitHubSync}
          currentView={currentView}
          onMenuToggle={() => setSidebarOpen(prev => !prev)}
          lastUpdated={lastUpdated}
        />
        {showStatsBar && <SystemStatsBar machines={machines} />}
        <div className="content-area">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default App;
