import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Incident, Category, ITService, Technician, IncidentStatus, Priority } from '../types/itsm';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, SearchX, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { checkSlaStatus } from '../utils/intelligentEngines';
import { EASE, EmptyState, PriorityBadge, SlaBadge, SlaState, Skeleton, StatusBadge, STATUS_META } from './ui';

interface IncidentListProps {
  incidents: Incident[];
  categories: Category[];
  services: ITService[];
  technicians: Technician[];
  onSelectIncident: (incident: Incident) => void;
  statusFilter: IncidentStatus | 'ALL';
  setStatusFilter: (status: IncidentStatus | 'ALL') => void;
  priorityFilter: Priority | 'ALL';
  setPriorityFilter: (priority: Priority | 'ALL') => void;
  /** Show skeleton rows while the first API load is in flight. */
  loading?: boolean;
  /** Increment to move keyboard focus into the search box (⌘K). */
  focusSearchSignal?: number;
  isDark?: boolean;
}

type SlaFilter = 'ALL' | 'BREACHED' | 'WARNING' | 'NORMAL';

const slaStateOf = (inc: Incident): { state: SlaState; percent: number } => {
  const sla = checkSlaStatus(inc.createdAt, inc.responseDeadline, inc.resolutionDeadline, inc.status);
  const breached = sla.isResponseBreached || sla.isResolutionBreached || inc.slaBreachedResponse || inc.slaBreachedResolution;
  const warning = sla.isResponseAtRisk || sla.isResolutionAtRisk;
  return { state: breached ? 'BREACHED' : warning ? 'AT_RISK' : 'ON_TRACK', percent: sla.resolutionElapsedPercent };
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export const IncidentList: React.FC<IncidentListProps> = ({
  incidents,
  categories,
  services,
  technicians,
  onSelectIncident,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  loading = false,
  focusSearchSignal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [technicianFilter, setTechnicianFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState<SlaFilter>('ALL');
  const [dateSort, setDateSort] = useState<'NEWEST' | 'OLDEST'>('NEWEST');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearchSignal) searchRef.current?.focus();
  }, [focusSearchSignal]);

  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return incidents
      .filter((inc) => {
        if (q) {
          const hay = `${inc.id} ${inc.title} ${inc.description} ${inc.reporterName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
        if (priorityFilter !== 'ALL' && inc.priority !== priorityFilter) return false;
        if (categoryFilter !== 'ALL' && inc.categoryId !== categoryFilter) return false;
        if (serviceFilter !== 'ALL' && inc.serviceId !== serviceFilter) return false;
        if (technicianFilter === 'UNASSIGNED' && inc.assignedTechnicianId) return false;
        if (technicianFilter !== 'ALL' && technicianFilter !== 'UNASSIGNED' && inc.assignedTechnicianId !== technicianFilter)
          return false;
        if (slaFilter !== 'ALL') {
          const { state } = slaStateOf(inc);
          if (slaFilter === 'BREACHED' && state !== 'BREACHED') return false;
          if (slaFilter === 'WARNING' && state !== 'AT_RISK') return false;
          if (slaFilter === 'NORMAL' && state !== 'ON_TRACK') return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return dateSort === 'NEWEST' ? diff : -diff;
      });
  }, [incidents, searchQuery, statusFilter, priorityFilter, categoryFilter, serviceFilter, technicianFilter, slaFilter, dateSort]);

  const filterKey = [statusFilter, priorityFilter, categoryFilter, serviceFilter, technicianFilter, slaFilter, dateSort].join('|');

  const activeFilterCount = [
    searchQuery.trim() !== '',
    statusFilter !== 'ALL',
    priorityFilter !== 'ALL',
    categoryFilter !== 'ALL',
    serviceFilter !== 'ALL',
    technicianFilter !== 'ALL',
    slaFilter !== 'ALL',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setCategoryFilter('ALL');
    setServiceFilter('ALL');
    setTechnicianFilter('ALL');
    setSlaFilter('ALL');
    setDateSort('NEWEST');
  };

  const chip = (active: boolean) => ({ className: 'ui-chip-select', 'data-active': active ? 'true' : 'false' });

  return (
    <section className="ui-card overflow-hidden">
      {/* Toolbar */}
      <div className="space-y-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search by ID, title, description or reporter"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ui-input border-transparent bg-surface-2 pl-9 shadow-none hover:border-line focus:bg-surface"
              aria-label="Search incidents"
            />
          </div>
          <button
            type="button"
            onClick={() => setDateSort((p) => (p === 'NEWEST' ? 'OLDEST' : 'NEWEST'))}
            className="ui-btn ui-btn-secondary"
            aria-label={`Sort by date, currently ${dateSort === 'NEWEST' ? 'newest first' : 'oldest first'}`}
          >
            {dateSort === 'NEWEST' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
            {dateSort === 'NEWEST' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | 'ALL')} {...chip(statusFilter !== 'ALL')}>
            <option value="ALL">All statuses</option>
            {(Object.keys(STATUS_META) as IncidentStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <select aria-label="Priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as Priority | 'ALL')} {...chip(priorityFilter !== 'ALL')}>
            <option value="ALL">All priorities</option>
            <option value="P1">P1 · Critical</option>
            <option value="P2">P2 · High</option>
            <option value="P3">P3 · Medium</option>
            <option value="P4">P4 · Low</option>
          </select>
          <select aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} {...chip(categoryFilter !== 'ALL')}>
            <option value="ALL">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="IT service" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} {...chip(serviceFilter !== 'ALL')}>
            <option value="ALL">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select aria-label="Technician" value={technicianFilter} onChange={(e) => setTechnicianFilter(e.target.value)} {...chip(technicianFilter !== 'ALL')}>
            <option value="ALL">Any technician</option>
            <option value="UNASSIGNED">Unassigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <select aria-label="SLA health" value={slaFilter} onChange={(e) => setSlaFilter(e.target.value as SlaFilter)} {...chip(slaFilter !== 'ALL')}>
            <option value="ALL">Any SLA state</option>
            <option value="BREACHED">Breached</option>
            <option value="WARNING">At risk (&gt;75%)</option>
            <option value="NORMAL">On track</option>
          </select>

          <AnimatePresence>
            {activeFilterCount > 0 && (
              <motion.button
                type="button"
                onClick={resetFilters}
                className="ui-btn ui-btn-ghost ui-btn-sm"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <X className="h-3.5 w-3.5" /> Clear
              </motion.button>
            )}
          </AnimatePresence>

          <span className="ml-auto text-[12.5px] text-muted">
            <strong className="font-medium text-ink tabular-nums">{filteredIncidents.length}</strong> of {incidents.length} incidents
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[calc(100vh-18rem)] min-h-[320px] overflow-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="w-[1%]">Priority</th>
              <th>Incident</th>
              <th>Status</th>
              <th className="hidden xl:table-cell">Service</th>
              <th className="hidden md:table-cell">Assignee</th>
              <th>SLA</th>
              <th className="hidden 2xl:table-cell text-right">Opened</th>
            </tr>
          </thead>
          <tbody>
            {loading && incidents.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton className="h-4 w-16" /></td>
                  <td><Skeleton className="h-4 w-64" /><Skeleton className="mt-2 h-3 w-40" /></td>
                  <td><Skeleton className="h-5 w-20" /></td>
                  <td><Skeleton className="h-5 w-20" /></td>
                  <td className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></td>
                  <td><Skeleton className="h-4 w-16" /></td>
                </tr>
              ))
            ) : filteredIncidents.length === 0 ? (
              <tr>
                <td colSpan={7} className="!border-0">
                  <EmptyState
                    icon={SearchX}
                    title="No incidents match these filters"
                    description="Try a different search term or remove a filter to see more results."
                    action={
                      activeFilterCount > 0 ? (
                        <button type="button" onClick={resetFilters} className="ui-btn ui-btn-secondary">
                          Clear all filters
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredIncidents.map((inc, i) => {
                const { state, percent } = slaStateOf(inc);
                return (
                  <tr
                    key={`${inc.id}-${filterKey}`}
                    className="is-clickable row-in"
                    style={{ ['--i' as any]: Math.min(i, 20) }}
                    onClick={() => onSelectIncident(inc)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelectIncident(inc))}
                    tabIndex={0}
                    aria-label={`Open ${inc.id}: ${inc.title}`}
                  >
                    <td className="whitespace-nowrap"><PriorityBadge priority={inc.priority} compact /></td>
                    <td className="min-w-[220px]">
                      <div className="ui-row-title max-w-[340px] truncate font-medium text-ink transition-colors">{inc.title}</div>
                      <div className="mt-0.5 max-w-[340px] truncate text-[12.5px] text-muted"><span className="font-mono text-[11.5px]">{inc.id}</span> · {inc.reporterName}</div>
                    </td>
                    <td className="whitespace-nowrap"><StatusBadge status={inc.status} /></td>
                    <td className="hidden xl:table-cell">
                      <div className="max-w-[190px] truncate text-ink-2" title={inc.serviceName}>{inc.serviceName}</div>
                      <div className="max-w-[190px] truncate text-[12.5px] text-muted">{inc.categoryName}</div>
                    </td>
                    <td className="hidden whitespace-nowrap md:table-cell">
                      {inc.assignedTechnicianName ? (
                        <span className="text-ink-2">{inc.assignedTechnicianName}</span>
                      ) : (
                        <span className="text-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap"><SlaBadge state={state} percent={percent} /></td>
                    <td className="hidden whitespace-nowrap text-right text-[13px] text-muted 2xl:table-cell">{formatWhen(inc.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
