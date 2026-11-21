import React from 'react';
import {
  ChevronsUpDown,
  ClipboardList,
  LayoutGrid,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Incident, IncidentStatus, Priority, User } from '../types/itsm';
import { EASE, SPRING } from './ui';

export type AppTab = 'DASHBOARD' | 'INCIDENTS' | 'INTELLIGENCE' | 'TOPOLOGY' | 'ADMIN_CONSOLE';

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  incidents: Incident[];
  onQuickFilterPriority: (p: Priority | 'ALL') => void;
  onQuickFilterStatus: (s: IncidentStatus | 'ALL') => void;
  selectedPriority: Priority | 'ALL';
  selectedStatus: IncidentStatus | 'ALL';
  mobileOpen: boolean;
  onCloseMobile: () => void;
  currentUser: User;
  onOpenAccount: () => void;
}

const NAV: { id: AppTab; label: string; icon: React.ElementType }[] = [
  { id: 'DASHBOARD', label: 'Overview', icon: LayoutGrid },
  { id: 'INCIDENTS', label: 'Incidents', icon: ClipboardList },
  { id: 'TOPOLOGY', label: 'Topology', icon: Network },
  { id: 'INTELLIGENCE', label: 'How routing works', icon: Sparkles },
  { id: 'ADMIN_CONSOLE', label: 'Admin', icon: Settings2 },
];

const ROLE_LABEL: Record<string, string> = {
  ROLE_ADMIN: 'Administrator',
  ROLE_TECHNICIAN: 'Technician',
  ROLE_EMPLOYEE: 'Employee',
};

/** Simple monogram: three bars (services) with one amber signal light. */
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'h-7 w-7' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <rect width="32" height="32" rx="7" className="fill-ink" />
    <path d="M10 13v10M16 13v10M22 9v14" className="stroke-canvas" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="10" cy="8.6" r="1.9" className="fill-canvas" />
    <circle cx="16" cy="8.6" r="1.9" fill="#e08422" />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { collapsed, mobileOpen, onCloseMobile } = props;
  return (
    <>
      <motion.aside
        className="sticky top-0 hidden h-screen shrink-0 border-r border-line lg:block"
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.35, ease: EASE }}
        aria-label="Primary"
      >
        <SidebarContent {...props} />
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-[#1c1b18]/30 dark:bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
            />
            <motion.aside
              className="relative h-full w-[280px] border-r border-line bg-canvas shadow-[var(--shadow-pop)]"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280, transition: { duration: 0.2, ease: EASE } }}
              transition={{ duration: 0.38, ease: EASE }}
              aria-label="Primary"
            >
              <button type="button" onClick={onCloseMobile} className="ui-icon-btn absolute right-3 top-3.5 z-10" aria-label="Close navigation">
                <X className="h-[18px] w-[18px]" />
              </button>
              <SidebarContent {...props} collapsed={false} isMobile />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

const SidebarContent: React.FC<SidebarProps & { isMobile?: boolean }> = ({
  activeTab,
  setActiveTab,
  collapsed,
  onToggleCollapse,
  incidents,
  onQuickFilterPriority,
  onQuickFilterStatus,
  selectedPriority,
  selectedStatus,
  isMobile,
  onCloseMobile,
  currentUser,
  onOpenAccount,
}) => {
  const p1Count = incidents.filter((i) => i.priority === 'P1').length;
  const inProgressCount = incidents.filter((i) => i.status === 'IN_PROGRESS').length;
  const slaBreachCount = incidents.filter((i) => i.slaBreachedResponse || i.slaBreachedResolution).length;
  const layoutId = isMobile ? 'nav-pill-mobile' : 'nav-pill';

  const go = (tab: AppTab) => {
    setActiveTab(tab);
    if (isMobile) onCloseMobile();
  };

  const triage = [
    {
      key: 'p1',
      label: 'Critical',
      color: '#d4442a',
      count: p1Count,
      active: selectedPriority === 'P1',
      onClick: () => {
        onQuickFilterPriority(selectedPriority === 'P1' ? 'ALL' : 'P1');
        go('INCIDENTS');
      },
    },
    {
      key: 'progress',
      label: 'In progress',
      color: '#d08a16',
      count: inProgressCount,
      active: selectedStatus === 'IN_PROGRESS',
      onClick: () => {
        onQuickFilterStatus(selectedStatus === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS');
        go('INCIDENTS');
      },
    },
    { key: 'sla', label: 'SLA breached', color: '#a62a14', count: slaBreachCount, active: false, onClick: () => go('INCIDENTS') },
  ];

  const center = collapsed ? 'justify-center px-0' : '';

  return (
    <div className="flex h-full flex-col px-3 pb-3">
      <div className={`flex h-14 shrink-0 items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
        <BrandMark />
        {!collapsed && (
          <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1, duration: 0.3, ease: EASE }} className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-[-0.01em] text-ink">I-ITSM</span>
            <span className="block text-[11.5px] text-muted">Service desk</span>
          </motion.div>
        )}
      </div>

      <div className={`mt-3 flex-1 space-y-7 ${collapsed ? '' : 'overflow-y-auto'}`}>
        <nav className="space-y-0.5" aria-label="Main">
          {NAV.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={`ui-nav-item ${center}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                {isActive && <motion.span layoutId={layoutId} className="ui-nav-pill" transition={SPRING} />}
                <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.id === 'INCIDENTS' && <span className="ml-auto text-xs tabular-nums text-muted">{incidents.length}</span>}
                {collapsed && <span className="ui-nav-tooltip">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div>
          {!collapsed && <p className="mb-1.5 px-2.5 text-[12px] font-medium text-muted">Needs attention</p>}
          <div className="space-y-0.5">
            {triage.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.onClick}
                aria-pressed={t.active}
                className={`ui-nav-item ${center} ${t.active ? '!bg-surface-3 !text-ink' : ''}`}
                aria-label={collapsed ? `${t.label}: ${t.count}` : undefined}
              >
                <span className="relative grid h-[17px] w-[17px] shrink-0 place-items-center">
                  {t.key === 'p1' && t.count > 0 && (
                    <span className="absolute h-2 w-2 animate-ping rounded-full opacity-40" style={{ background: t.color }} />
                  )}
                  <span className="relative h-2 w-2 rounded-full" style={{ background: t.color }} />
                </span>
                {!collapsed && <span className="truncate">{t.label}</span>}
                {!collapsed && <span className="ml-auto text-xs tabular-nums text-muted">{t.count}</span>}
                {collapsed && <span className="ui-nav-tooltip">{`${t.label} · ${t.count}`}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-0.5 border-t border-line pt-3">
        <button
          type="button"
          onClick={onOpenAccount}
          className={`ui-nav-item h-11 ${center}`}
          aria-label={collapsed ? `${currentUser.fullName} — switch account` : undefined}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink ring-1 ring-line">
            {initials(currentUser.fullName)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate text-[13px] font-medium text-ink">{currentUser.fullName}</span>
                <span className="block truncate text-[11.5px] text-muted">{ROLE_LABEL[currentUser.role] ?? currentUser.role}</span>
              </span>
              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0" />
            </>
          )}
          {collapsed && <span className="ui-nav-tooltip">Switch account</span>}
        </button>
        {!isMobile && (
          <button type="button" onClick={onToggleCollapse} className={`ui-nav-item ${center}`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-[17px] w-[17px]" strokeWidth={1.75} /> : <PanelLeftClose className="h-[17px] w-[17px]" strokeWidth={1.75} />}
            {!collapsed && <span className="text-muted">Collapse</span>}
            {collapsed && <span className="ui-nav-tooltip">Expand sidebar</span>}
          </button>
        )}
      </div>
    </div>
  );
};
