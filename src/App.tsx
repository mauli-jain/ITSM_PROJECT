import React, { useState, useEffect } from 'react';
import {
  Administrator,
  Category,
  Employee,
  Incident,
  IncidentStatus,
  ITService,
  Notification,
  Priority,
  PriorityStrategyType,
  AssignmentStrategyType,
  SLAPolicy,
  Technician,
  User,
} from './types/itsm';
import {
  SEED_ADMIN,
  SEED_CATEGORIES,
  SEED_EMPLOYEES,
  SEED_INCIDENTS,
  SEED_SERVICES,
  SEED_SLA_POLICIES,
  SEED_TECHNICIANS,
} from './data/seedData';
import { apiClient } from './api/client';
import { IncidentEventBus } from './domain/IncidentObserver';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { IncidentList } from './components/IncidentList';
import { IncidentDetailModal } from './components/IncidentDetailModal';
import { ReportIncidentModal } from './components/ReportIncidentModal';
import { StrategyConfigModal } from './components/StrategyConfigModal';
import { ServiceDependencyGraph } from './components/ServiceDependencyGraph';
import { AdminConsoleView } from './components/AdminConsoleView';
import { LoginModal } from './components/LoginModal';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE, PageHeader, useToast } from './components/ui';
import type { AppTab } from './components/Sidebar';

export default function App() {
  // Master state backed by Repositories (Persistence Layer)
  const [incidents, setIncidents] = useState<Incident[]>(SEED_INCIDENTS);
  const [technicians, setTechnicians] = useState<Technician[]>(SEED_TECHNICIANS);
  const [categories, setCategories] = useState<Category[]>(SEED_CATEGORIES);
  const [services, setServices] = useState<ITService[]>(SEED_SERVICES);
  const [slaPolicies, setSlaPolicies] = useState<SLAPolicy[]>(SEED_SLA_POLICIES);

  // Active User / Role & User directory
  const [allUsers, setAllUsers] = useState<User[]>([SEED_ADMIN, ...SEED_EMPLOYEES, ...SEED_TECHNICIANS]);
  const [currentUser, setCurrentUser] = useState<User>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('iitsm_active_user');
      if (saved) {
        try {
          const user = JSON.parse(saved) as User;
          if (user.id === SEED_ADMIN.id && user.fullName === SEED_ADMIN.fullName && user.role === 'ROLE_ADMIN') return user;
          // Display the canonical administrator until authenticated server state is restored.
          return SEED_ADMIN;
        } catch {}
      }
    }
    return SEED_ADMIN;
  });

  // Active Strategies (Strategy Pattern)
  const [priorityStrategy, setPriorityStrategy] = useState<PriorityStrategyType>('WEIGHTED_SCORING');
  const [assignmentStrategy, setAssignmentStrategy] = useState<AssignmentStrategyType>('SKILL_BASED');

  // Navigation & Layout
  const [activeTab, setActiveTab] = useState<AppTab>('DASHBOARD');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('iitsm-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    try {
      localStorage.setItem('iitsm-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
    } catch {}
  }, [sidebarCollapsed]);

  // Filter shortcuts
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');

  // Modals
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Dark Mode Theme State
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('iitsm-theme') : null;
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  });

  // Crossfade colours for a moment while the theme flips, instead of a hard cut.
  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    setIsDark((prev) => !prev);
    window.setTimeout(() => root.classList.remove('theme-switching'), 380);
  };

  useEffect(() => {
    localStorage.setItem('iitsm-theme', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Observer Notifications Stream (Initialized from GoF Observer EventBus)
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const busHistory = IncidentEventBus.getInstance().getNotificationHistory();
    if (busHistory.length > 0) return busHistory;
    return [
      {
        id: 'NOTIF-1',
        recipientId: 'ADM001',
        recipientName: 'Mauli Jain',
        channel: 'IN_APP',
        title: 'P1 Incident Escalated',
        message: 'INC1001 Payment Gateway failure auto-escalated to Team Lead.',
        timestamp: '2 mins ago',
        read: false,
      },
      {
        id: 'NOTIF-2',
        recipientId: 'T101',
        recipientName: 'Mauli Jain',
        channel: 'EMAIL',
        title: 'EMAIL DISPATCHED: [I-ITSM ALERT P1] INC1001',
        message: 'Sent automated dispatch notification to d.ross@iitsm.corp',
        timestamp: '5 mins ago',
        read: true,
      },
      {
        id: 'NOTIF-3',
        recipientId: 'T101',
        recipientName: 'Mauli Jain (+1 555-019-4821)',
        channel: 'SMS',
        title: 'SMS DISPATCHED: Critical Telephony Alert',
        message: '[CRITICAL ITSM] INC1001 (P1): Core Payment Gateway outage response required.',
        timestamp: '5 mins ago',
        read: false,
      },
    ];
  });

  // Load persisted repository datasets from API
  const refreshAllData = async () => {
    try {
      const [allInc, allTech, allCat, allSrv, allPol, allUsr] = await Promise.all([
        apiClient.incidents.getAll(),
        apiClient.technicians.getAll(),
        apiClient.categories.getAll(),
        apiClient.services.getAll(),
        apiClient.slaPolicies.getAll(),
        apiClient.users.getAll(),
      ]);
      setIncidents(allInc);
      setTechnicians(allTech);
      setCategories(allCat);
      setServices(allSrv);
      setSlaPolicies(allPol);
      if (allUsr.length > 0) {
        setAllUsers(allUsr);
      }
    } catch (err) {
      console.error('Error refreshing from API client:', err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      try {
        // Refresh the user from the server: never trust a cached profile/role after a migration.
        const existing = apiClient.getToken();
        if (existing) {
          const { user } = await apiClient.auth.getMe();
          setCurrentUser(user);
          apiClient.setStoredUser(user);
        } else {
          // Do not silently guess demo passwords: require an explicit sign-in.
          setInitialLoading(false);
          setShowLoginModal(true);
          return;
        }
        await refreshAllData();
      } catch (err) {
        console.warn('Please sign in using an active demo account:', err);
        setInitialLoading(false);
        setShowLoginModal(true);
      }
    };

    const unsub = apiClient.onUnauthorized(() => {
      setShowLoginModal(true);
    });

    initSession();

    return () => {
      unsub();
    };
  }, []);

  // Server-Sent Events (SSE) Live Notifications (Phase 6)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isCancelled = false;

    const connectSSE = async () => {
      try {
        if (!apiClient.getToken()) return;
        const ticket = await apiClient.events.getTicket();
        if (isCancelled) return;

        eventSource = apiClient.events.createEventSource(ticket);
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'CONNECTED') return;

            const newNotif: Notification = {
              id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              recipientId: data.recipientId || currentUser.id,
              recipientName: data.recipientName || currentUser.fullName,
              channel: (data.priority === 'P1' ? 'SMS' : 'IN_APP') as any,
              title: `[${data.eventName}] ${data.incidentId || 'Alert'}`,
              message: `${data.incidentTitle || ''}: ${data.details || ''}`,
              timestamp: 'Just now',
              read: false,
            };
            setNotifications((prev) => [newNotif, ...prev.slice(0, 49)]);

            refreshAllData();
          } catch (e) {
            console.warn('SSE payload parse note:', e);
          }
        };

        eventSource.onerror = () => {
          eventSource?.close();
        };
      } catch (err) {
        console.warn('SSE subscription notice:', err);
      }
    };

    connectSSE();

    return () => {
      isCancelled = true;
      eventSource?.close();
    };
  }, [currentUser]);

  // Handle reporting incident via typed API client
  const handleCreateIncident = async (newIncident: Incident) => {
    try {
      const created = await apiClient.incidents.create({
        title: newIncident.title,
        description: newIncident.description,
        categoryId: newIncident.categoryId,
        serviceId: newIncident.serviceId,
        impact: newIncident.impact,
        urgency: newIncident.urgency,
        businessCriticality: newIncident.businessCriticality,
        affectedUsersCount: newIncident.affectedUsersCount,
        priority: newIncident.priority,
      });

      setShowReportModal(false);
      await refreshAllData();
      setSelectedIncident(created);
      toast({ kind: 'success', title: `Incident ${created.id} reported`, description: `Priority ${created.priority} · ${created.assignedTechnicianName ? `assigned to ${created.assignedTechnicianName}` : 'awaiting assignment'}` });
    } catch (err: any) {
      console.error('Failed to create incident via API:', err);
      toast({ kind: 'error', title: 'Could not report incident', description: err?.message || 'Please try again.' });
    }
  };

  const handleUpdateIncident = async (updated: Incident) => {
    const previous = incidents.find((inc) => inc.id === updated.id);
    setIncidents((prev) => prev.map((inc) => (inc.id === updated.id ? updated : inc)));
    setSelectedIncident(updated);
    if (previous && previous.status !== updated.status) {
      toast({ kind: 'success', title: `${updated.id} moved to ${updated.status.replaceAll('_', ' ').toLowerCase()}` });
    }
    await refreshAllData();
  };

  const handleLogout = async () => {
    await apiClient.auth.logout();
    setShowLoginModal(true);
  };


  const goToTab = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'DASHBOARD') {
      setStatusFilter('ALL');
      setPriorityFilter('ALL');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen bg-canvas font-sans text-ink antialiased">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={goToTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        incidents={incidents}
        onQuickFilterPriority={(p) => setPriorityFilter(p)}
        onQuickFilterStatus={(s) => setStatusFilter(s)}
        selectedPriority={priorityFilter}
        selectedStatus={statusFilter}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        currentUser={currentUser}
        onOpenAccount={() => setShowLoginModal(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          currentUser={currentUser}
          onSelectUser={async (userId) => {
            const found = allUsers.find((u) => u.id === userId);
            if (found) {
              try {
                const pass = found.role === 'ROLE_ADMIN' ? 'admin123' : 'password';
                await apiClient.auth.login(found.username, pass);
                setCurrentUser(found);
                await refreshAllData();
              } catch (err) {
                console.warn('Account switch requires a valid login:', err);
                setShowLoginModal(true);
              }
            }
          }}
          allUsers={allUsers}
          priorityStrategy={priorityStrategy}
          assignmentStrategy={assignmentStrategy}
          onOpenStrategyModal={() => setShowStrategyModal(true)}
          onOpenReportModal={() => setShowReportModal(true)}
          onOpenLoginModal={() => setShowLoginModal(true)}
          notifications={notifications}
          onMarkNotificationsRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
          onQuickSearchClick={() => {
            goToTab('INCIDENTS');
            setSearchFocusSignal((n) => n + 1);
          }}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <main className="flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-10 lg:pt-10">
          <div className="mx-auto max-w-[1280px]">
            <PageTransition id={activeTab}>
              {activeTab === 'DASHBOARD' && (
                <Dashboard
                  incidents={incidents}
                  technicians={technicians}
                  services={services}
                  priorityStrategy={priorityStrategy}
                  assignmentStrategy={assignmentStrategy}
                  onOpenStrategyModal={() => setShowStrategyModal(true)}
                  onOpenReportModal={() => setShowReportModal(true)}
                  onSelectIncident={(inc) => setSelectedIncident(inc)}
                  onFilterByStatus={(st) => {
                    setStatusFilter(st);
                    setActiveTab('INCIDENTS');
                  }}
                  onFilterByPriority={(pr) => {
                    setPriorityFilter(pr);
                    setActiveTab('INCIDENTS');
                  }}
                  selectedStatus={statusFilter}
                  selectedPriority={priorityFilter}
                  isDark={isDark}
                  userName={currentUser.fullName}
                />
              )}

              {activeTab === 'INCIDENTS' && (
                <div className="space-y-6">
                  <PageHeader title="Incidents" description="Everything reported across your services. Click a row to open it." />
                  <IncidentList
                    incidents={incidents}
                    categories={categories}
                    services={services}
                    technicians={technicians}
                    onSelectIncident={(inc) => setSelectedIncident(inc)}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    priorityFilter={priorityFilter}
                    setPriorityFilter={setPriorityFilter}
                    loading={initialLoading}
                    focusSearchSignal={searchFocusSignal}
                    isDark={isDark}
                  />
                </div>
              )}

              {activeTab === 'INTELLIGENCE' && <IntelligentLab />}

              {activeTab === 'TOPOLOGY' && (
                <div className="space-y-6">
                  <PageHeader title="Topology" description="How services depend on each other, and what an outage would touch." />
                  <ServiceDependencyGraph services={services} incidents={incidents} isDark={isDark} />
                </div>
              )}

              {activeTab === 'ADMIN_CONSOLE' && (
                <AdminConsoleView currentUser={currentUser} onRefreshAllData={refreshAllData} isDark={isDark} />
              )}
            </PageTransition>
          </div>
        </main>

        <footer className="flex flex-col items-center justify-between gap-1 border-t border-line px-4 py-4 text-[12.5px] text-muted sm:flex-row sm:px-6 lg:px-10">
          <span>I-ITSM · CS F213 / MAC F212 OOP Capstone</span>
          <span>SQLite persistence · live event bus</span>
        </footer>
      </div>

      <AnimatePresence>
        {selectedIncident && (
          <IncidentDetailModal
            key="detail"
            incident={selectedIncident}
            allIncidents={incidents}
            technicians={technicians}
            currentUser={currentUser}
            activeAssignmentStrategy={assignmentStrategy}
            onClose={() => setSelectedIncident(null)}
            onUpdateIncident={handleUpdateIncident}
          />
        )}
        {showReportModal && (
          <ReportIncidentModal
            key="report"
            categories={categories}
            services={services}
            technicians={technicians}
            existingIncidents={incidents}
            currentUser={currentUser}
            activePriorityStrategy={priorityStrategy}
            activeAssignmentStrategy={assignmentStrategy}
            slaPolicies={slaPolicies}
            onClose={() => setShowReportModal(false)}
            onSubmit={handleCreateIncident}
          />
        )}
        {showStrategyModal && (
          <StrategyConfigModal
            key="strategy"
            priorityStrategy={priorityStrategy}
            setPriorityStrategy={setPriorityStrategy}
            assignmentStrategy={assignmentStrategy}
            setAssignmentStrategy={setAssignmentStrategy}
            onClose={() => setShowStrategyModal(false)}
          />
        )}
        {showLoginModal && (
          <LoginModal
            key="login"
            onClose={() => setShowLoginModal(false)}
            onLoginSuccess={(loggedUser) => {
              setCurrentUser(loggedUser);
              setShowLoginModal(false);
              toast({ kind: 'success', title: `Signed in as ${loggedUser.fullName}` });
              refreshAllData();
            }}
            isDark={isDark}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Cross-fades between top-level pages with a small rise. */
const PageTransition: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

const LAB_FEATURES: { title: string; tag: string; body: string; formula?: string }[] = [
  {
    title: 'Duplicate detection',
    tag: 'Similarity ≥ 0.28',
    body: 'Titles are broken into word pairs and compared with recent incidents on the same service (last 24 hours). A close match is flagged before a second ticket is opened.',
    formula: 'J(A, B) = |A ∩ B| / |A ∪ B|',
  },
  {
    title: 'Technician recommendation',
    tag: 'Weighted score',
    body: 'Each available technician is scored on four factors. Nobody is assigned past their workload limit, however well they score.',
    formula: '0.40 skill + 0.30 workload + 0.20 experience + 0.10 status',
  },
  {
    title: 'Escalation',
    tag: 'Checked every 30 s',
    body: 'Unacknowledged P1 and P2 incidents move up the chain automatically. A P1 escalates after five minutes without acknowledgement.',
    formula: 'Technician → Team lead → Sys admin → IT manager',
  },
  {
    title: 'SLA watchdog',
    tag: 'Warns at 75%',
    body: 'Tracks how much of each deadline has been used. At 75% it raises a warning; at 100% the breach is recorded permanently.',
    formula: 'used = (now − created) / (deadline − created)',
  },
  {
    title: 'Category suggestions',
    tag: 'Keyword match',
    body: 'Descriptions are matched against the keyword list for each category, which admins can edit without a redeploy.',
  },
  {
    title: 'Past resolutions',
    tag: 'Knowledge base',
    body: 'Finds how similar incidents on similar services were fixed, so the technician starts from a known answer.',
  },
];

const IntelligentLab: React.FC = () => (
  <div className="space-y-8">
    <PageHeader
      title="How routing works"
      description="Six small rules decide how incidents are triaged, assigned and escalated. Here's what each one does."
    />
    <ol className="ui-card divide-y divide-line">
      {LAB_FEATURES.map((f, i) => (
        <motion.li
          key={f.title}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 + i * 0.05, duration: 0.4, ease: EASE }}
          className="grid gap-x-8 gap-y-3 px-6 py-5 md:grid-cols-[40px_1fr_minmax(0,320px)]"
        >
          <span className="font-mono text-[13px] tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h2 className="flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold text-ink">
              {f.title}
              <span className="text-[12.5px] font-normal text-muted">{f.tag}</span>
            </h2>
            <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-2">{f.body}</p>
          </div>
          {f.formula ? (
            <code className="self-start rounded-md bg-surface-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-2 ring-1 ring-line md:justify-self-end">
              {f.formula}
            </code>
          ) : (
            <span className="hidden md:block" />
          )}
        </motion.li>
      ))}
    </ol>
  </div>
);
