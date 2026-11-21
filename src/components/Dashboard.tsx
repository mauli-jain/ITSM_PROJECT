import React, { useMemo, useState } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Incident,
  Technician,
  ITService,
  IncidentStatus,
  Priority,
  PriorityStrategyType,
  AssignmentStrategyType,
} from '../types/itsm';
import { ArrowRight, ChevronDown, Inbox, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { checkSlaStatus } from '../utils/intelligentEngines';
import { TechnicianHourlyHeatmap } from './TechnicianHourlyHeatmap';
import { ActivityTicker } from './ActivityTicker';
import { Card, EASE, EmptyState, PRIORITY_META, PriorityBadge, Reveal, Segmented, SlaBadge, StatusBadge, STATUS_META } from './ui';
import { StatStrip } from './dashboard/StatCard';
import { chartTheme } from './dashboard/chartTheme';

interface DashboardProps {
  incidents: Incident[];
  technicians: Technician[];
  services: ITService[];
  priorityStrategy: PriorityStrategyType;
  assignmentStrategy: AssignmentStrategyType;
  onOpenStrategyModal: () => void;
  onOpenReportModal: () => void;
  onSelectIncident?: (incident: Incident) => void;
  onFilterByStatus?: (status: IncidentStatus | 'ALL') => void;
  onFilterByPriority?: (priority: Priority | 'ALL') => void;
  selectedStatus?: IncidentStatus | 'ALL';
  selectedPriority?: Priority | 'ALL';
  isDark?: boolean;
  userName?: string;
}

const DONE: IncidentStatus[] = ['RESOLVED', 'VERIFIED', 'CLOSED'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const DAY = 86_400_000;

const isBreached = (inc: Incident) => {
  const sla = checkSlaStatus(inc.createdAt, inc.responseDeadline, inc.resolutionDeadline, inc.status);
  return sla.isResponseBreached || sla.isResolutionBreached || inc.slaBreachedResponse || inc.slaBreachedResolution;
};

const dailySeries = (items: Incident[], days: number, now: number) => {
  const out = new Array(days).fill(0);
  items.forEach((i) => {
    const age = Math.floor((now - new Date(i.createdAt).getTime()) / DAY);
    if (age >= 0 && age < days) out[days - 1 - age]++;
  });
  return out;
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const relativeDay = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  if (days <= 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export const Dashboard: React.FC<DashboardProps> = ({
  incidents,
  technicians,
  services,
  onOpenStrategyModal,
  onSelectIncident,
  onFilterByStatus,
  onFilterByPriority,
  isDark = false,
  userName,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const stats = useMemo(() => {
    const now = Date.now();
    const total = incidents.length;
    const open = incidents.filter((i) => !DONE.includes(i.status));
    const critical = incidents.filter((i) => i.priority === 'P1' && !DONE.includes(i.status));
    const resolved = incidents.filter((i) => DONE.includes(i.status)).length;
    let slaViolations = 0;
    let slaAtRisk = 0;
    incidents.forEach((inc) => {
      const sla = checkSlaStatus(inc.createdAt, inc.responseDeadline, inc.resolutionDeadline, inc.status);
      if (isBreached(inc)) slaViolations++;
      else if (sla.isResponseAtRisk || sla.isResolutionAtRisk) slaAtRisk++;
    });
    const all14 = dailySeries(incidents, 14, now);
    const open14 = dailySeries(open, 14, now);
    const crit14 = dailySeries(critical, 14, now);
    const delta = (s: number[]) => sum(s.slice(7)) - sum(s.slice(0, 7));
    return {
      total,
      open: open.length,
      critical: critical.length,
      resolved,
      slaViolations,
      slaAtRisk,
      resolutionRate: total ? Math.round((resolved / total) * 100) : 0,
      byPriority: PRIORITIES.map((p) => incidents.filter((i) => i.priority === p).length),
      spark: { all: all14.slice(7), open: open14.slice(7), crit: crit14.slice(7) },
      delta: { all: delta(all14), open: delta(open14), crit: delta(crit14) },
    };
  }, [incidents]);

  const recent = useMemo(
    () => [...incidents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [incidents]
  );

  const slaWatch = useMemo(
    () =>
      incidents
        .filter((i) => (i.priority === 'P1' || i.priority === 'P2') && !DONE.includes(i.status))
        .map((inc) => {
          const sla = checkSlaStatus(inc.createdAt, inc.responseDeadline, inc.resolutionDeadline, inc.status);
          const state = isBreached(inc) ? 'BREACHED' : sla.isResponseAtRisk || sla.isResolutionAtRisk ? 'AT_RISK' : 'ON_TRACK';
          return { inc, state: state as 'BREACHED' | 'AT_RISK' | 'ON_TRACK', percent: sla.resolutionElapsedPercent };
        })
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 6),
    [incidents]
  );

  const today = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = userName?.split(' ')[0];

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] text-muted">{today}</p>
            <h1 className="ui-page-title mt-1">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="ui-page-desc">
              {stats.open === 0 ? (
                'Nothing open right now. Enjoy the quiet.'
              ) : (
                <>
                  <span className="text-ink-2">{stats.open} open</span> incidents
                  {stats.critical > 0 && (
                    <>
                      , <span className="font-medium text-[#a62a14] dark:text-[#f4a08f]">{stats.critical} critical</span>
                    </>
                  )}
                  {stats.slaViolations > 0 && (
                    <>
                      {' '}and <span className="text-ink-2">{stats.slaViolations} past their SLA</span>
                    </>
                  )}
                  .
                </>
              )}
            </p>
          </div>
          <button type="button" onClick={onOpenStrategyModal} className="ui-btn ui-btn-secondary self-start sm:self-auto">
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} /> Routing rules
          </button>
        </div>
      </Reveal>

      <Reveal index={1}>
        <StatStrip
          stats={[
            { id: 'open', label: 'Open', value: stats.open, spark: stats.spark.open, delta: stats.delta.open, goodWhenUp: false, onClick: () => onFilterByStatus?.('ALL') },
            { id: 'crit', label: 'Critical open', value: stats.critical, spark: stats.spark.crit, sparkColor: PRIORITY_META.P1.color, delta: stats.delta.crit, goodWhenUp: false, onClick: () => onFilterByPriority?.('P1') },
            { id: 'sla', label: 'Past SLA', value: stats.slaViolations, note: `${stats.slaAtRisk} more at risk`, onClick: () => onFilterByStatus?.('ALL') },
            { id: 'res', label: 'Resolved', value: stats.resolutionRate, suffix: '%', note: `${stats.resolved} of ${stats.total} incidents`, onClick: () => onFilterByStatus?.('RESOLVED') },
          ]}
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Reveal index={2}>
          <Card
            title="Recent incidents"
            actions={
              <button type="button" onClick={() => onFilterByStatus?.('ALL')} className="ui-link inline-flex items-center gap-1">
                All incidents <ArrowRight className="h-3.5 w-3.5" />
              </button>
            }
            bodyClassName="mt-3 overflow-x-auto"
          >
            {recent.length === 0 ? (
              <EmptyState icon={Inbox} title="No incidents yet" description="Reported incidents will show up here." />
            ) : (
              <table className="ui-table">
                <tbody>
                  {recent.map((inc, i) => (
                    <tr key={inc.id} className="is-clickable row-in" style={{ ['--i' as any]: i }} onClick={() => onSelectIncident?.(inc)}>
                      <td className="w-[1%] whitespace-nowrap"><PriorityBadge priority={inc.priority} compact /></td>
                      <td className="min-w-[220px]">
                        <span className="ui-row-title block truncate font-medium text-ink transition-colors">{inc.title}</span>
                        <span className="mt-0.5 block font-mono text-[11.5px] text-muted">{inc.id}</span>
                      </td>
                      <td className="whitespace-nowrap"><StatusBadge status={inc.status} /></td>
                      <td className="whitespace-nowrap text-right text-[13px] text-muted">{relativeDay(inc.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </Reveal>

        <Reveal index={3}>
          <Card title="Closest to deadline" subtitle="Open P1 and P2 incidents" bodyClassName="px-2 pb-2 pt-2">
            {slaWatch.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing at risk" description="No open P1 or P2 incidents." />
            ) : (
              <ul>
                {slaWatch.map(({ inc, state, percent }, i) => (
                  <motion.li key={inc.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.04, duration: 0.3, ease: EASE }}>
                    <button
                      type="button"
                      onClick={() => onSelectIncident?.(inc)}
                      className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: PRIORITY_META[inc.priority].color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink transition-colors group-hover:text-accent-ink">{inc.title}</span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {inc.priority} · {inc.serviceName}
                        </span>
                      </span>
                      <SlaBadge state={state} percent={percent} />
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal index={4}>
          <Card title="Priority mix" subtitle={`${stats.total} incidents · click a row to filter`}>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
              {PRIORITIES.map((p, i) => (
                <motion.div
                  key={p}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ background: PRIORITY_META[p].color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.total ? (stats.byPriority[i] / stats.total) * 100 : 0}%` }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.25 + i * 0.06 }}
                />
              ))}
            </div>
            <ul className="mt-4 -mx-2">
              {PRIORITIES.map((p, i) => {
                const pct = stats.total ? Math.round((stats.byPriority[i] / stats.total) * 100) : 0;
                return (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => onFilterByPriority?.(p)}
                      className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: PRIORITY_META[p].color }} />
                      <span className="w-6 font-mono text-[12.5px] text-muted">{p}</span>
                      <span className="flex-1 text-[13.5px] text-ink-2 group-hover:text-ink">{PRIORITY_META[p].label}</span>
                      <span className="w-10 text-right text-[12.5px] tabular-nums text-muted">{pct}%</span>
                      <span className="w-8 text-right text-[13.5px] font-medium tabular-nums text-ink">{stats.byPriority[i]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Reveal>

        <Reveal index={5}>
          <Card title="Service health" subtitle="Resolution progress and SLA compliance" bodyClassName="grid gap-6 p-5 sm:grid-cols-2">
            <Meter label="Resolved or closed" value={stats.resolved} total={stats.total} color="var(--ink)" />
            <Meter label="Breached an SLA" value={stats.slaViolations} total={stats.total} color={PRIORITY_META.P1.color} />
          </Card>
        </Reveal>
      </div>

      <Reveal index={6}>
        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="group flex w-full items-center gap-3 border-t border-line pt-5 text-left"
          >
            <span>
              <span className="block text-[15px] font-semibold text-ink">Detailed analytics</span>
              <span className="block text-[13px] text-muted">Hourly workload, lifecycle, technician capacity and live activity</span>
            </span>
            <motion.span
              animate={{ rotate: showAdvanced ? 180 : 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted transition-colors group-hover:bg-surface-3 group-hover:text-ink"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="pt-5">
                  <AdvancedAnalytics incidents={incidents} technicians={technicians} services={services} isDark={isDark} onSelectIncident={onSelectIncident} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </Reveal>
    </div>
  );
};

const Meter: React.FC<{ label: string; value: number; total: number; color: string }> = ({ label, value, total, color }) => {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{pct}%</span>
        <span className="text-[13px] tabular-nums text-muted">
          {value} of {total}
        </span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }} />
      </div>
    </div>
  );
};

type View = 'LIFECYCLE' | 'WORKLOAD' | 'SERVICES';

const AdvancedAnalytics: React.FC<{
  incidents: Incident[];
  technicians: Technician[];
  services: ITService[];
  isDark: boolean;
  onSelectIncident?: (incident: Incident) => void;
}> = ({ incidents, technicians, services, isDark, onSelectIncident }) => {
  const [view, setView] = useState<View>('LIFECYCLE');
  const theme = chartTheme(isDark);
  const statusKeys = Object.keys(STATUS_META) as IncidentStatus[];
  const barBase = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { ...theme.legend, position: 'top' as const, align: 'end' as const }, tooltip: theme.tooltip },
  };

  return (
    <div className="space-y-4">
      <Segmented
        label="Analytics view"
        value={view}
        onChange={setView}
        options={[
          { id: 'LIFECYCLE', label: 'Lifecycle & capacity' },
          { id: 'WORKLOAD', label: 'Hourly workload' },
          { id: 'SERVICES', label: 'Services & activity' },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25, ease: EASE }}>
          {view === 'WORKLOAD' && <TechnicianHourlyHeatmap technicians={technicians} incidents={incidents} isDark={isDark} />}

          {view === 'LIFECYCLE' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <Card className="lg:col-span-5" title="Lifecycle status" subtitle="Incidents in each workflow state">
                <div className="h-72">
                  <Doughnut
                    data={{
                      labels: statusKeys.map((s) => STATUS_META[s].label),
                      datasets: [
                        {
                          data: statusKeys.map((s) => incidents.filter((i) => i.status === s).length),
                          backgroundColor: statusKeys.map((s) => STATUS_META[s].color),
                          borderColor: theme.surface,
                          borderWidth: 2,
                          hoverOffset: 4,
                        },
                      ],
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { ...theme.legend, position: 'right' }, tooltip: theme.tooltip } }}
                  />
                </div>
              </Card>
              <Card
                className="lg:col-span-7"
                title="Technician capacity"
                subtitle={`Active incidents against each person's limit · ${technicians.reduce((a, t) => a + t.activeIncidentCount, 0)} assigned`}
              >
                <div className="h-72">
                  <Bar
                    data={{
                      labels: technicians.map((t) => t.fullName.split(' ')[0]),
                      datasets: [
                        {
                          label: 'Active',
                          data: technicians.map((t) => t.activeIncidentCount),
                          backgroundColor: technicians.map((t) => (t.activeIncidentCount >= t.maxWorkload - 1 ? PRIORITY_META.P1.color : theme.ink)),
                          borderRadius: 4,
                          borderSkipped: false,
                          maxBarThickness: 30,
                        },
                        {
                          label: 'Headroom',
                          data: technicians.map((t) => Math.max(0, t.maxWorkload - t.activeIncidentCount)),
                          backgroundColor: theme.track,
                          borderRadius: 4,
                          borderSkipped: false,
                          maxBarThickness: 30,
                        },
                      ],
                    }}
                    options={{
                      ...barBase,
                      scales: {
                        x: { ...theme.axis, stacked: true, grid: { display: false } },
                        y: { ...theme.axis, stacked: true, beginAtZero: true, ticks: { ...theme.axis.ticks, stepSize: 1 } },
                      },
                    }}
                  />
                </div>
              </Card>
            </div>
          )}

          {view === 'SERVICES' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <Card className="lg:col-span-7" title="Incidents by service" subtitle="All incidents and the critical share">
                <div className="h-72">
                  <Bar
                    data={{
                      labels: services.map((s) => s.name.replace(/\s*\(.*\)/, '')),
                      datasets: [
                        { label: 'All', data: services.map((s) => incidents.filter((i) => i.serviceId === s.id).length), backgroundColor: theme.ink, borderRadius: 4, maxBarThickness: 24 },
                        {
                          label: 'Critical',
                          data: services.map((s) => incidents.filter((i) => i.serviceId === s.id && i.priority === 'P1').length),
                          backgroundColor: PRIORITY_META.P1.color,
                          borderRadius: 4,
                          maxBarThickness: 24,
                        },
                      ],
                    }}
                    options={{
                      ...barBase,
                      scales: {
                        x: { ...theme.axis, grid: { display: false }, ticks: { ...theme.axis.ticks, autoSkip: false, maxRotation: 40 } },
                        y: { ...theme.axis, beginAtZero: true, ticks: { ...theme.axis.ticks, stepSize: 1 } },
                      },
                    }}
                  />
                </div>
              </Card>
              <div className="lg:col-span-5">
                <ActivityTicker incidents={incidents} onSelectIncident={onSelectIncident || (() => {})} isDark={isDark} />
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
