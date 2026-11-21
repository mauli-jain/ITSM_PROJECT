import React from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import { Incident, AuditRecord } from '../types/itsm';

interface ActivityTickerProps {
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
  isDark?: boolean;
}

export const ActivityTicker: React.FC<ActivityTickerProps> = ({
  incidents,
  onSelectIncident,
  isDark = false,
}) => {
  // Extract latest audit records across all incidents
  const recentActivities = React.useMemo(() => {
    const list: Array<{ audit: AuditRecord; incident: Incident }> = [];
    incidents.forEach((inc) => {
      inc.auditTrail.forEach((aud) => {
        list.push({ audit: aud, incident: inc });
      });
    });
    // Sort descending by timestamp
    return list
      .sort((a, b) => new Date(b.audit.timestamp).getTime() - new Date(a.audit.timestamp).getTime())
      .slice(0, 6);
  }, [incidents]);

  return (
    <div
      className={`p-6 rounded-xl border transition-all flex flex-col justify-between ${
        isDark
          ? 'glass-panel-dark text-white border-white/10'
          : 'glass-panel-light text-ink border-line'
      } shadow-xs h-full`}
    >
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-line dark:border-white/10">
          <div>
            <h3 className="font-bold text-sm sm:text-base tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Live Activity &amp; Audit Stream
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Real-time immutable lifecycle state changes &amp; operator actions
            </p>
          </div>
          <span className="text-2xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold">
            Live Observer
          </span>
        </div>

        <div className="space-y-2.5 mt-3.5">
          {recentActivities.map(({ audit, incident }) => (
            <div
              key={audit.id}
              onClick={() => onSelectIncident(incident)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between group ${
                isDark
                  ? 'bg-slate-900/50 border-white/5 hover:border-indigo-500/40 hover:bg-slate-900/80'
                  : 'bg-surface/80 border-line hover:border-indigo-400 hover:bg-surface'
              }`}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xs font-bold text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10">
                    {incident.id}
                  </span>
                  <span className="text-xs font-semibold truncate group-hover:text-indigo-400 transition-colors">
                    {audit.action.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-1 line-clamp-1 font-normal">
                  {audit.description}
                </p>
                <div className="text-2xs text-muted mt-1 flex items-center gap-1.5 font-mono">
                  <span>By {audit.performedBy}</span>
                  <span>&bull;</span>
                  <span className="tabular-nums">
                    {new Date(audit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-indigo-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-line dark:border-white/10 flex items-center justify-between text-xs text-muted font-mono">
        <span>PostgreSQL &bull; audit_records</span>
        <span className="text-indigo-400 font-semibold cursor-pointer">Inspect stream</span>
      </div>
    </div>
  );
};
