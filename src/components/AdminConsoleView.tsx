import { PageHeader, useToast } from './ui';
import React, { useState, useEffect } from 'react';
import {
  ITService,
  Category,
  SLAPolicy,
  Technician,
  User,
  Priority,
  BusinessCriticality,
} from '../types/itsm';
import { apiClient } from '../api/client';
import {
  ShieldAlert,
  Server,
  Layers,
  Clock,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sliders,
  Settings,
} from 'lucide-react';

interface AdminConsoleViewProps {
  currentUser: User;
  onRefreshAllData: () => void;
  isDark: boolean;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  currentUser,
  onRefreshAllData,
  isDark,
}) => {
  const [activeTab, setActiveTab] = useState<'SERVICES' | 'CATEGORIES' | 'SLA_POLICIES' | 'USERS'>('SERVICES');

  // Datasets
  const [services, setServices] = useState<ITService[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SLAPolicy[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Form Modals / Input states
  const [showAddModal, setShowAddModal] = useState(false);
  const toast = useToast();

  // New Service Form
  const [srvName, setSrvName] = useState('');
  const [srvCrit, setSrvCrit] = useState<BusinessCriticality>('HIGH');
  const [srvTeam, setSrvTeam] = useState('');

  // New Category Form
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catKeywords, setCatKeywords] = useState('');

  // New SLA Policy Form
  const [slaPriority, setSlaPriority] = useState<Priority>('P2');
  const [slaRespMins, setSlaRespMins] = useState(15);
  const [slaResMins, setSlaResMins] = useState(120);
  const [slaDesc, setSlaDesc] = useState('');

  // New User Form
  const [usrUsername, setUsrUsername] = useState('');
  const [usrFullName, setUsrFullName] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrRole, setUsrRole] = useState<'ROLE_EMPLOYEE' | 'ROLE_TECHNICIAN' | 'ROLE_ADMIN'>('ROLE_TECHNICIAN');
  const [usrSkills, setUsrSkills] = useState('Network, Linux, Security');
  const [usrSpecialization, setUsrSpecialization] = useState('Systems Engineer');

  const loadData = async () => {
    try {
      const [s, c, p, u] = await Promise.all([
        apiClient.services.getAll(),
        apiClient.categories.getAll(),
        apiClient.slaPolicies.getAll(),
        apiClient.users.getAll(),
      ]);
      setServices(s);
      setCategories(c);
      setSlaPolicies(p);
      setUsers(u);
    } catch (err: any) {
      console.warn('Error loading admin data from API:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    toast({ kind: 'success', title: msg });
  };

  // Check Role Guard
  if (currentUser.role !== 'ROLE_ADMIN') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 flex items-start gap-4">
          <ShieldAlert className="w-8 h-8 shrink-0 text-red-500" />
          <div>
            <h3 className="font-bold text-base text-red-500">Access Denied (Role Guard: Admin Only)</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Your active session role is <strong>{currentUser.role}</strong> ({currentUser.fullName}).
              IT Service Configuration, Category Mapping, SLA Policy Thresholds, and User Identity Provisioning
              require <strong>ROLE_ADMIN</strong> privileges. Please sign in as Mauli Jain (Admin) to manage this workspace.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle Add Service
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!srvName.trim()) return;
    const newService: ITService = {
      id: `SRV-${Date.now().toString().slice(-4)}`,
      name: srvName.trim(),
      businessCriticality: srvCrit,
      ownerTeam: srvTeam.trim() || 'Global IT Operations',
      healthStatus: 'HEALTHY',
    };
    await apiClient.services.create(newService);
    setSrvName('');
    setSrvTeam('');
    setShowAddModal(false);
    await loadData();
    onRefreshAllData();
    triggerToast(`Service "${newService.name}" created and persisted in database.`);
  };

  // Handle Add Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const keywords = catKeywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    const newCat: Category = {
      id: `CAT-${Date.now().toString().slice(-4)}`,
      name: catName.trim(),
      description: catDesc.trim() || 'Custom managed incident category',
      keywords: keywords.length ? keywords : [catName.toLowerCase()],
    };
    await apiClient.categories.create(newCat);
    setCatName('');
    setCatDesc('');
    setCatKeywords('');
    setShowAddModal(false);
    await loadData();
    onRefreshAllData();
    triggerToast(`Category "${newCat.name}" saved with ${keywords.length} keyword anchors.`);
  };

  // Handle Add/Update SLA Policy
  const handleCreateSlaPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const newPolicy: SLAPolicy = {
      id: `SLA-${slaPriority}`,
      priority: slaPriority,
      responseTargetMinutes: Number(slaRespMins),
      resolutionTargetMinutes: Number(slaResMins),
      description: slaDesc || `${slaPriority} SLA Policy: ${slaRespMins}m response, ${slaResMins}m resolution`,
    };
    await apiClient.slaPolicies.create(newPolicy);
    setShowAddModal(false);
    await loadData();
    onRefreshAllData();
    triggerToast(`SLA Policy for ${slaPriority} updated in Repository. All new incidents will inherit these targets.`);
  };

  // Handle Add User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usrUsername.trim() || !usrFullName.trim()) return;
    const idPrefix = usrRole === 'ROLE_ADMIN' ? 'ADM' : usrRole === 'ROLE_TECHNICIAN' ? 'T' : 'EMP';
    const newId = `${idPrefix}${Math.floor(100 + Math.random() * 900)}`;

    let newUserObj: any = {
      id: newId,
      username: usrUsername.trim().toLowerCase(),
      fullName: usrFullName.trim(),
      email: usrEmail.trim() || `${usrUsername}@iitsm.corp`,
      role: usrRole,
      password: 'password',
    };

    if (usrRole === 'ROLE_TECHNICIAN') {
      newUserObj = {
        ...newUserObj,
        skills: usrSkills.split(',').map((s) => s.trim()).filter(Boolean),
        experienceYears: 4,
        maxWorkload: 6,
        available: true,
        activeIncidentCount: 0,
        specialization: usrSpecialization || 'Support Specialist',
      };
    } else if (usrRole === 'ROLE_EMPLOYEE') {
      newUserObj = {
        ...newUserObj,
        department: 'Operations & Business Unit',
      };
    } else {
      newUserObj = {
        ...newUserObj,
        managedDivision: 'Enterprise IT & Cloud Security',
      };
    }

    await apiClient.users.create(newUserObj);
    setUsrUsername('');
    setUsrFullName('');
    setUsrEmail('');
    setShowAddModal(false);
    await loadData();
    onRefreshAllData();
    triggerToast(`User ${newUserObj.fullName} (${newUserObj.role}) created and persisted.`);
  };

  // Delete entity handlers
  const handleDeleteService = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete service "${name}"?`)) {
      await apiClient.services.delete(id);
      await loadData();
      onRefreshAllData();
      triggerToast(`Service "${name}" removed from repository.`);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (confirm(`Delete category "${name}"?`)) {
      await apiClient.categories.delete(id);
      await loadData();
      onRefreshAllData();
      triggerToast(`Category "${name}" removed.`);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (confirm(`Remove user "${name}"?`)) {
      await apiClient.users.delete(id);
      await loadData();
      onRefreshAllData();
      triggerToast(`User "${name}" deleted.`);
    }
  };

  const handleResetDatabase = async () => {
    if (confirm('Reset entire incident database and repositories to canonical seed data?')) {
      await apiClient.admin.resetDatabase();
      await loadData();
      onRefreshAllData();
      triggerToast('Database reset to canonical initial state.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Admin console"
        description="Manage IT services, incident categories, SLA policies and the user directory."
        actions={
          <>
            <button type="button" onClick={handleResetDatabase} className="ui-btn ui-btn-secondary text-red-600 dark:text-red-400" title="Reset incident repository to its seed state">
              <RotateCcw className="h-4 w-4" /> Reset demo data
            </button>
            <button type="button" onClick={() => setShowAddModal(true)} className="ui-btn ui-btn-primary">
              <Plus className="h-4 w-4" />
              Add {activeTab === 'SERVICES' ? 'service' : activeTab === 'CATEGORIES' ? 'category' : activeTab === 'SLA_POLICIES' ? 'SLA policy' : 'user'}
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="ui-segmented flex-wrap" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          onClick={() => setActiveTab('SERVICES')}
          role="tab" aria-selected={activeTab === 'SERVICES'}
        >
          <Server className="w-4 h-4" />
          <span>IT Services ({services.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CATEGORIES')}
          role="tab" aria-selected={activeTab === 'CATEGORIES'}
        >
          <Layers className="w-4 h-4" />
          <span>Incident Categories ({categories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SLA_POLICIES')}
          role="tab" aria-selected={activeTab === 'SLA_POLICIES'}
        >
          <Clock className="w-4 h-4" />
          <span>SLA Policies ({slaPolicies.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          role="tab" aria-selected={activeTab === 'USERS'}
        >
          <Users className="w-4 h-4" />
          <span>User Directory ({users.length})</span>
        </button>
      </div>

      {/* Tab 1: Services View */}
      {activeTab === 'SERVICES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <div
              key={s.id}
              className={`p-4 rounded-xl border transition-all ${
                isDark ? 'glass-panel-dark text-white border-white/10' : 'glass-panel-light text-ink border-line'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-2xs font-mono text-indigo-400 font-bold">{s.id}</span>
                  <h4 className="font-bold text-sm tracking-tight mt-0.5">{s.name}</h4>
                  <p className="text-xs text-muted mt-1">Owner: {s.ownerTeam}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteService(s.id, s.name)}
                  className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                  title="Delete Service"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
                <span className="text-2xs uppercase font-mono px-2 py-0.5 rounded-md bg-surface-3 text-ink-2 font-bold">
                  Crit: {s.businessCriticality}
                </span>
                <span className={`text-2xs uppercase font-mono px-2 py-0.5 rounded-md font-bold ${
                  s.healthStatus === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  ● {s.healthStatus}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Categories View */}
      {activeTab === 'CATEGORIES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-xl border transition-all ${
                isDark ? 'glass-panel-dark text-white border-white/10' : 'glass-panel-light text-ink border-line'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-2xs font-mono text-cyan-400 font-bold">{c.id}</span>
                  <h4 className="font-bold text-sm tracking-tight mt-0.5">{c.name}</h4>
                  <p className="text-xs text-muted mt-1">{c.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(c.id, c.name)}
                  className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5">
                <span className="text-2xs font-mono text-muted block mb-1.5 font-bold uppercase">
                  Suggestion Keywords:
                </span>
                <div className="flex flex-wrap gap-1">
                  {c.keywords.map((k, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-2xs font-mono bg-white/5 border border-white/10 text-slate-300"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: SLA Policies View */}
      {activeTab === 'SLA_POLICIES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slaPolicies.map((p) => (
            <div
              key={p.id}
              className={`p-5 rounded-xl border transition-all ${
                isDark ? 'glass-panel-dark text-white border-white/10' : 'glass-panel-light text-ink border-line'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold font-mono ${
                    p.priority === 'P1'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : p.priority === 'P2'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {p.priority} Policy
                  </span>
                  <h4 className="font-bold text-sm tracking-tight mt-2">{p.description}</h4>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/5 text-xs font-mono">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-muted text-2xs block uppercase">Response Target</span>
                  <strong className="text-lg font-bold text-indigo-400">{p.responseTargetMinutes}m</strong>
                  <span className="text-2xs text-muted block">Initial acknowledgement</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-muted text-2xs block uppercase">Resolution Target</span>
                  <strong className="text-lg font-bold text-emerald-400">
                    {p.resolutionTargetMinutes >= 60
                      ? `${p.resolutionTargetMinutes / 60}h (${p.resolutionTargetMinutes}m)`
                      : `${p.resolutionTargetMinutes}m`}
                  </strong>
                  <span className="text-2xs text-muted block">Full remediation SLA</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: User Directory View */}
      {activeTab === 'USERS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className={`p-4 rounded-xl border transition-all ${
                isDark ? 'glass-panel-dark text-white border-white/10' : 'glass-panel-light text-ink border-line'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-2xs font-mono text-indigo-400 font-bold">{u.id}</span>
                  <h4 className="font-bold text-sm tracking-tight mt-0.5">{u.fullName}</h4>
                  <p className="text-xs text-muted font-mono">@{u.username} • {u.email}</p>
                </div>
                {u.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(u.id, u.fullName)}
                    className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded-md font-mono text-2xs font-bold ${
                  u.role === 'ROLE_ADMIN'
                    ? 'bg-amber-500/20 text-amber-400'
                    : u.role === 'ROLE_TECHNICIAN'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {u.role.replace('ROLE_', '')}
                </span>

                {'skills' in u && (
                  <span className="text-2xs font-mono text-muted">
                    {(u as any).skills?.length || 0} skills • Cap: {(u as any).activeIncidentCount || 0}/{(u as any).maxWorkload || 6}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`w-full max-w-lg p-6 rounded-xl border shadow-2xl animate-in zoom-in-95 ${
            isDark ? 'glass-panel-dark text-white border-white/10' : 'bg-surface text-ink border-line'
          }`}>
            <h3 className="text-base font-extrabold tracking-tight mb-4">
              Add New {activeTab === 'SERVICES' ? 'IT Service' : activeTab === 'CATEGORIES' ? 'Incident Category' : activeTab === 'SLA_POLICIES' ? 'SLA Policy' : 'User'}
            </h3>

            {activeTab === 'SERVICES' && (
              <form onSubmit={handleCreateService} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-muted mb-1">Service Name</label>
                  <input
                    type="text"
                    required
                    value={srvName}
                    onChange={(e) => setSrvName(e.target.value)}
                    placeholder="e.g., Customer Billing Engine"
                    className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-muted mb-1">Business Criticality</label>
                    <select
                      value={srvCrit}
                      onChange={(e) => setSrvCrit(e.target.value as any)}
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-muted mb-1">Owner Team</label>
                    <input
                      type="text"
                      value={srvTeam}
                      onChange={(e) => setSrvTeam(e.target.value)}
                      placeholder="e.g., SRE & FinOps"
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-white/10 text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                  >
                    Save Service
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'CATEGORIES' && (
              <form onSubmit={handleCreateCategory} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-muted mb-1">Category Name</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g., Mobile Application"
                    className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted mb-1">Description</label>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    placeholder="iOS & Android mobile runtime issues"
                    className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-muted mb-1">Keywords (Comma separated)</label>
                  <input
                    type="text"
                    value={catKeywords}
                    onChange={(e) => setCatKeywords(e.target.value)}
                    placeholder="ios, android, app crash, touch id, apk"
                    className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-white/10 text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                  >
                    Save Category
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'SLA_POLICIES' && (
              <form onSubmit={handleCreateSlaPolicy} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-muted mb-1">Incident Priority Tier</label>
                  <select
                    value={slaPriority}
                    onChange={(e) => setSlaPriority(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                  >
                    <option value="P1">P1 - Critical Priority</option>
                    <option value="P2">P2 - High Priority</option>
                    <option value="P3">P3 - Medium Priority</option>
                    <option value="P4">P4 - Low Priority</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-muted mb-1">Response Target (Minutes)</label>
                    <input
                      type="number"
                      min={1}
                      value={slaRespMins}
                      onChange={(e) => setSlaRespMins(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted mb-1">Resolution Target (Minutes)</label>
                    <input
                      type="number"
                      min={5}
                      value={slaResMins}
                      onChange={(e) => setSlaResMins(Number(e.target.value))}
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-white/10 text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                  >
                    Save Policy
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'USERS' && (
              <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-muted mb-1">Username</label>
                    <input
                      type="text"
                      required
                      value={usrUsername}
                      onChange={(e) => setUsrUsername(e.target.value)}
                      placeholder="e.g. jdoe"
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-muted mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={usrFullName}
                      onChange={(e) => setUsrFullName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-muted mb-1">Role</label>
                    <select
                      value={usrRole}
                      onChange={(e) => setUsrRole(e.target.value as any)}
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    >
                      <option value="ROLE_TECHNICIAN">ROLE_TECHNICIAN</option>
                      <option value="ROLE_EMPLOYEE">ROLE_EMPLOYEE</option>
                      <option value="ROLE_ADMIN">ROLE_ADMIN</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-muted mb-1">Email</label>
                    <input
                      type="email"
                      value={usrEmail}
                      onChange={(e) => setUsrEmail(e.target.value)}
                      placeholder="j.doe@iitsm.corp"
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white"
                    />
                  </div>
                </div>

                {usrRole === 'ROLE_TECHNICIAN' && (
                  <div>
                    <label className="block font-bold text-muted mb-1">Skills (Comma-separated)</label>
                    <input
                      type="text"
                      value={usrSkills}
                      onChange={(e) => setUsrSkills(e.target.value)}
                      placeholder="PostgreSQL, AWS, Network, Redis"
                      className="w-full p-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-white font-mono"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl border border-white/10 text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                  >
                    Create User
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
