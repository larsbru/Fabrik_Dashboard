import React, { useState, useEffect, useCallback } from 'react';
import {
  Save, RefreshCw, Plus, Trash2, Network, Key, GitBranch,
  Server, Eye, EyeOff, CheckCircle, AlertCircle, Upload
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import './Settings.css';

function Settings() {
  const { get, post } = useApi();
  const [activeSection, setActiveSection] = useState('network');
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // { type: 'success'|'error', message }
  const [showToken, setShowToken] = useState(false);

  // Editable state per section
  const [networkForm, setNetworkForm] = useState({
    network_subnet: '', host_ip: '', scan_interval: 60,
  });
  const [sshForm, setSSHForm] = useState({
    ssh_key_path: '', ssh_config_path: '', default_ssh_user: '', default_ssh_port: 22,
  });
  const [githubForm, setGithubForm] = useState({
    github_token: '', github_owner: '', github_repo: '',
  });
  const [machines, setMachines] = useState([]);
  const [newMachine, setNewMachine] = useState({
    ip: '', name: '', role: 'agent', ssh_user: '', ssh_port: 22, description: '',
  });
  const [sshKeyContent, setSSHKeyContent] = useState('');

  const fetchSettings = useCallback(async () => {
    const data = await get('/api/settings');
    if (data) {
      setSettings(data);
      setNetworkForm(data.network);
      setSSHForm(data.ssh);
      setGithubForm(data.github);
      setMachines(data.machines || []);
    }
  }, [get]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const showSaveStatus = (type, message) => {
    setSaveStatus({ type, message });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleSave = async (section, endpoint, data) => {
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/settings/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        showSaveStatus('success', `${section} gespeichert`);
        fetchSettings();
      } else {
        showSaveStatus('error', `Fehler beim Speichern`);
      }
    } catch {
      showSaveStatus('error', 'Verbindung zum Server fehlgeschlagen');
    }
    setSaving(false);
  };

  const handleAddMachine = async () => {
    if (!newMachine.ip) return;
    try {
      const res = await fetch(`http://localhost:8000/api/settings/machines/${newMachine.ip}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMachine),
      });
      if (res.ok) {
        showSaveStatus('success', `Maschine ${newMachine.ip} hinzugefuegt`);
        setNewMachine({ ip: '', name: '', role: 'agent', ssh_user: '', ssh_port: 22, description: '' });
        fetchSettings();
      }
    } catch {
      showSaveStatus('error', 'Fehler beim Hinzufuegen');
    }
  };

  const handleRemoveMachine = async (ip) => {
    try {
      const res = await fetch(`http://localhost:8000/api/settings/machines/${ip}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showSaveStatus('success', `Maschine ${ip} entfernt`);
        fetchSettings();
      }
    } catch {
      showSaveStatus('error', 'Fehler beim Entfernen');
    }
  };

  const handleUploadSSHKey = async () => {
    if (!sshKeyContent.trim()) return;
    try {
      const res = await fetch('http://localhost:8000/api/settings/ssh/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_content: sshKeyContent, filename: 'id_rsa' }),
      });
      if (res.ok) {
        showSaveStatus('success', 'SSH Key gespeichert');
        setSSHKeyContent('');
      }
    } catch {
      showSaveStatus('error', 'Fehler beim Speichern des SSH Keys');
    }
  };

  const SECTIONS = [
    { id: 'network', label: 'Netzwerk', icon: Network },
    { id: 'ssh', label: 'SSH', icon: Key },
    { id: 'github', label: 'GitHub', icon: GitBranch },
    { id: 'machines', label: 'Maschinen', icon: Server },
  ];

  if (!settings) {
    return (
      <div className="settings-view">
        <div className="settings-loading">Einstellungen werden geladen...</div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      {saveStatus && (
        <div className={`save-toast ${saveStatus.type}`}>
          {saveStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{saveStatus.message}</span>
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-sidebar">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-tab ${activeSection === id ? 'active' : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="settings-content">
          {/* Network Settings */}
          {activeSection === 'network' && (
            <div className="settings-section animate-in">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Netzwerk-Einstellungen</h2>
                  <p className="section-desc">Konfiguriere das Subnetz und die Scan-Parameter fuer die Netzwerkerkennung.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Netzwerk-Subnetz</label>
                <input
                  className="form-input"
                  type="text"
                  value={networkForm.network_subnet}
                  onChange={e => setNetworkForm({ ...networkForm, network_subnet: e.target.value })}
                  placeholder="192.168.44.0/24"
                />
                <span className="form-hint">CIDR-Notation des zu scannenden Subnetzes</span>
              </div>

              <div className="form-group">
                <label className="form-label">Host-IP</label>
                <input
                  className="form-input"
                  type="text"
                  value={networkForm.host_ip}
                  onChange={e => setNetworkForm({ ...networkForm, host_ip: e.target.value })}
                  placeholder="192.168.44.1"
                />
                <span className="form-hint">IP-Adresse dieses Rechners im Netzwerk</span>
              </div>

              <div className="form-group">
                <label className="form-label">Scan-Intervall (Sekunden)</label>
                <input
                  className="form-input"
                  type="number"
                  min="10"
                  max="600"
                  value={networkForm.scan_interval}
                  onChange={e => setNetworkForm({ ...networkForm, scan_interval: parseInt(e.target.value) || 60 })}
                />
                <span className="form-hint">Wie oft das Netzwerk automatisch gescannt wird</span>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => handleSave('Netzwerk', 'network', networkForm)}
                  disabled={saving}
                >
                  <Save size={14} />
                  <span>Speichern</span>
                </button>
              </div>
            </div>
          )}

          {/* SSH Settings */}
          {activeSection === 'ssh' && (
            <div className="settings-section animate-in">
              <div className="section-header">
                <div>
                  <h2 className="section-title">SSH-Einstellungen</h2>
                  <p className="section-desc">Konfiguriere die SSH-Verbindungsparameter fuer die Kommunikation mit den Maschinen.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Standard SSH-Benutzer</label>
                <input
                  className="form-input"
                  type="text"
                  value={sshForm.default_ssh_user}
                  onChange={e => setSSHForm({ ...sshForm, default_ssh_user: e.target.value })}
                  placeholder="fabrik"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Standard SSH-Port</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  max="65535"
                  value={sshForm.default_ssh_port}
                  onChange={e => setSSHForm({ ...sshForm, default_ssh_port: parseInt(e.target.value) || 22 })}
                />
                <span className="form-hint">Standard: 22</span>
              </div>

              <div className="form-group">
                <label className="form-label">SSH-Key Pfad</label>
                <input
                  className="form-input"
                  type="text"
                  value={sshForm.ssh_key_path}
                  onChange={e => setSSHForm({ ...sshForm, ssh_key_path: e.target.value })}
                  placeholder="/app/config/ssh_keys/id_rsa"
                />
                <span className="form-hint">Pfad zum privaten SSH-Schluessel auf dem Server</span>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => handleSave('SSH', 'ssh', sshForm)}
                  disabled={saving}
                >
                  <Save size={14} />
                  <span>Speichern</span>
                </button>
              </div>

              <div className="form-divider" />

              <div className="section-header">
                <div>
                  <h2 className="section-title">SSH-Key hochladen</h2>
                  <p className="section-desc">Lade einen privaten SSH-Schluessel hoch, um die Verbindung zu den Maschinen herzustellen.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Privater SSH-Schluessel</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={sshKeyContent}
                  onChange={e => setSSHKeyContent(e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                />
                <span className="form-hint">Inhalt der privaten Schluesseldatei (id_rsa)</span>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={handleUploadSSHKey}
                  disabled={!sshKeyContent.trim()}
                >
                  <Upload size={14} />
                  <span>Key speichern</span>
                </button>
              </div>
            </div>
          )}

          {/* GitHub Settings */}
          {activeSection === 'github' && (
            <div className="settings-section animate-in">
              <div className="section-header">
                <div>
                  <h2 className="section-title">GitHub-Einstellungen</h2>
                  <p className="section-desc">Konfiguriere die GitHub-Integration fuer Repository-Monitoring und Pipeline-Ansicht.</p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Repository-Besitzer / Organisation</label>
                <input
                  className="form-input"
                  type="text"
                  value={githubForm.github_owner}
                  onChange={e => setGithubForm({ ...githubForm, github_owner: e.target.value })}
                  placeholder="dein-username"
                />
                <span className="form-hint">GitHub-Benutzername oder Organisationsname</span>
              </div>

              <div className="form-group">
                <label className="form-label">Repository-Name</label>
                <input
                  className="form-input"
                  type="text"
                  value={githubForm.github_repo}
                  onChange={e => setGithubForm({ ...githubForm, github_repo: e.target.value })}
                  placeholder="Archyveon_Core"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Personal Access Token</label>
                <div className="input-with-action">
                  <input
                    className="form-input"
                    type={showToken ? 'text' : 'password'}
                    value={githubForm.github_token}
                    onChange={e => setGithubForm({ ...githubForm, github_token: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  />
                  <button
                    className="input-action-btn"
                    onClick={() => setShowToken(!showToken)}
                    type="button"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="form-hint">Erstelle einen Token unter GitHub &rarr; Settings &rarr; Developer settings &rarr; Personal access tokens</span>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => handleSave('GitHub', 'github', githubForm)}
                  disabled={saving}
                >
                  <Save size={14} />
                  <span>Speichern</span>
                </button>
              </div>
            </div>
          )}

          {/* Machines Settings */}
          {activeSection === 'machines' && (
            <div className="settings-section animate-in">
              <div className="section-header">
                <div>
                  <h2 className="section-title">Maschinen-Verwaltung</h2>
                  <p className="section-desc">Verwalte die bekannten Maschinen im Netzwerk. Hier kannst du IP-Adressen, Rollen und SSH-Zugangsdaten konfigurieren.</p>
                </div>
              </div>

              {/* Existing Machines */}
              <div className="machines-list">
                {machines.map((machine, idx) => (
                  <div className="machine-card" key={machine.ip || idx}>
                    <div className="machine-card-header">
                      <div className="machine-card-info">
                        <Server size={16} className="machine-icon" />
                        <div>
                          <span className="machine-name">{machine.name || machine.ip}</span>
                          <span className="machine-ip">{machine.ip}</span>
                        </div>
                      </div>
                      <div className="machine-card-actions">
                        <span className="machine-role">{machine.role || 'agent'}</span>
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => handleRemoveMachine(machine.ip)}
                          title="Maschine entfernen"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="machine-card-details">
                      <span>SSH: {machine.ssh_user || 'fabrik'}@{machine.ip}:{machine.ssh_port || 22}</span>
                      {machine.description && <span>{machine.description}</span>}
                      {machine.tags && machine.tags.length > 0 && (
                        <div className="machine-tags">
                          {machine.tags.map(tag => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {machines.length === 0 && (
                  <div className="empty-state">Keine Maschinen konfiguriert</div>
                )}
              </div>

              <div className="form-divider" />

              {/* Add New Machine */}
              <div className="section-header">
                <div>
                  <h2 className="section-title">Neue Maschine hinzufuegen</h2>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label className="form-label">IP-Adresse</label>
                  <input
                    className="form-input"
                    type="text"
                    value={newMachine.ip}
                    onChange={e => setNewMachine({ ...newMachine, ip: e.target.value })}
                    placeholder="192.168.44.10"
                  />
                </div>
                <div className="form-group form-group-half">
                  <label className="form-label">Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={newMachine.name}
                    onChange={e => setNewMachine({ ...newMachine, name: e.target.value })}
                    placeholder="Worker-01"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label className="form-label">Rolle</label>
                  <select
                    className="form-input form-select"
                    value={newMachine.role}
                    onChange={e => setNewMachine({ ...newMachine, role: e.target.value })}
                  >
                    <option value="controller">Controller</option>
                    <option value="agent">Agent</option>
                    <option value="builder">Builder</option>
                    <option value="reviewer">Reviewer</option>
                  </select>
                </div>
                <div className="form-group form-group-half">
                  <label className="form-label">SSH-Benutzer</label>
                  <input
                    className="form-input"
                    type="text"
                    value={newMachine.ssh_user}
                    onChange={e => setNewMachine({ ...newMachine, ssh_user: e.target.value })}
                    placeholder="fabrik"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group form-group-half">
                  <label className="form-label">SSH-Port</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    max="65535"
                    value={newMachine.ssh_port}
                    onChange={e => setNewMachine({ ...newMachine, ssh_port: parseInt(e.target.value) || 22 })}
                  />
                </div>
                <div className="form-group form-group-half">
                  <label className="form-label">Beschreibung</label>
                  <input
                    className="form-input"
                    type="text"
                    value={newMachine.description}
                    onChange={e => setNewMachine({ ...newMachine, description: e.target.value })}
                    placeholder="Optionale Beschreibung"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleAddMachine}
                  disabled={!newMachine.ip}
                >
                  <Plus size={14} />
                  <span>Maschine hinzufuegen</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Settings;
