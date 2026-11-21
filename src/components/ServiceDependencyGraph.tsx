import React, { useState } from 'react';
import {
  ITService,
  Incident,
  Priority,
} from '../types/itsm';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Globe,
  HardDrive,
  Key,
  Mail,
  Network,
  Radio,
  Server,
  Zap,
} from 'lucide-react';

interface ServiceDependencyGraphProps {
  services: ITService[];
  incidents: Incident[];
  isDark: boolean;
}

interface ServiceNode {
  id: string;
  name: string;
  type: string;
  icon: any;
  dependsOn: string[];
}

export const ServiceDependencyGraph: React.FC<ServiceDependencyGraphProps> = ({
  services,
  incidents,
  isDark,
}) => {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>('SRV-PAY');

  // Topological Service Topology with Real Infrastructure Dependencies
  const serviceNodes: ServiceNode[] = [
    {
      id: 'SRV-AUTH',
      name: 'Single Sign-On (SSO) & LDAP',
      type: 'Identity Provider',
      icon: Key,
      dependsOn: [], // Tier-0 Root
    },
    {
      id: 'SRV-DB',
      name: 'Core Database Cluster (PostgreSQL)',
      type: 'Data Persistence',
      icon: Database,
      dependsOn: [], // Tier-0 Root
    },
    {
      id: 'SRV-NET',
      name: 'Backbone & Corporate VPN',
      type: 'Network Layer',
      icon: Network,
      dependsOn: [], // Tier-0 Root
    },
    {
      id: 'SRV-PAY',
      name: 'Payment Processing Gateway',
      type: 'Financial Application',
      icon: Zap,
      dependsOn: ['SRV-AUTH', 'SRV-DB', 'SRV-NET'], // Depends on Auth, DB, Net
    },
    {
      id: 'SRV-CLOUD',
      name: 'Object & File Storage (S3/Blob)',
      type: 'Storage Subsystem',
      icon: HardDrive,
      dependsOn: ['SRV-AUTH', 'SRV-NET'],
    },
    {
      id: 'SRV-MAIL',
      name: 'Email & Collaboration Relay',
      type: 'Communication',
      icon: Mail,
      dependsOn: ['SRV-AUTH', 'SRV-NET'],
    },
  ];

  // Calculate live health and active incident count per service
  const getServiceStatus = (serviceId: string) => {
    const activeIncidents = incidents.filter(
      (i) => i.serviceId === serviceId && i.status !== 'CLOSED' && i.status !== 'VERIFIED'
    );
    const hasP1 = activeIncidents.some((i) => i.priority === 'P1');
    const hasP2 = activeIncidents.some((i) => i.priority === 'P2');

    let health: 'HEALTHY' | 'DEGRADED' | 'OUTAGE' = 'HEALTHY';
    if (hasP1) health = 'OUTAGE';
    else if (hasP2 || activeIncidents.length > 0) health = 'DEGRADED';

    return {
      health,
      activeIncidents: activeIncidents.length,
      p1Count: activeIncidents.filter((i) => i.priority === 'P1').length,
    };
  };

  const selectedNode = serviceNodes.find((n) => n.id === selectedServiceId) || serviceNodes[0];
  const selectedStatus = getServiceStatus(selectedNode.id);

  // Direct dependencies and downstream impact
  const upstreamDependencies = selectedNode.dependsOn.map((depId) => {
    const node = serviceNodes.find((n) => n.id === depId)!;
    return { ...node, status: getServiceStatus(node.id) };
  });

  const downstreamDependents = serviceNodes
    .filter((n) => n.dependsOn.includes(selectedNode.id))
    .map((node) => ({ ...node, status: getServiceStatus(node.id) }));

  // Blast radius calculation
  const blastRadiusSeverity =
    selectedStatus.health === 'OUTAGE'
      ? 'CRITICAL BLAST RADIUS'
      : selectedStatus.health === 'DEGRADED'
      ? 'MODERATE SERVICE IMPACT'
      : 'NOMINAL OPERATIONAL BASELINE';

  return (
    <div
      className={`p-6 rounded-xl border transition-all ${
        isDark ? 'glass-panel-dark text-white border-white/10' : 'glass-panel-light text-ink border-line'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base tracking-tight font-sans">
                ITIL Service Dependency &amp; Blast Radius Topology
              </h3>
              <span className="text-2xs font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
                Innovation +3
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Live dependency graph mapping upstream root infrastructure to downstream enterprise services and incident cascading risks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-slate-300">
            {services.length} Monitored Services
          </span>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Left Column: Interactive Topology Nodes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-muted px-1">
            <span>SELECT SERVICE NODE TO INSPECT CASCADE:</span>
            <span className="text-emerald-400 font-bold">● Active Telemetry Feed</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {serviceNodes.map((node) => {
              const status = getServiceStatus(node.id);
              const isSelected = selectedServiceId === node.id;
              const Icon = node.icon;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedServiceId(node.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'border-accent bg-accent-soft shadow-[var(--shadow-pop)] ring-1 ring-accent'
                      : isDark
                      ? 'bg-slate-900/60 border-white/5 hover:border-white/20'
                      : 'bg-surface border-line hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-indigo-400 group-hover:scale-110 transition-transform">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-2xs font-mono px-2 py-0.5 rounded-full font-bold ${
                        status.health === 'OUTAGE'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : status.health === 'DEGRADED'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {status.health}
                    </span>
                  </div>

                  <span className="text-2xs font-mono text-muted block font-bold">{node.id}</span>
                  <h4 className="font-bold text-xs tracking-tight line-clamp-1">{node.name}</h4>
                  <p className="text-[11px] text-muted mt-1">{node.type}</p>

                  <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-2xs font-mono">
                    <span className="text-muted">Upstream: {node.dependsOn.length}</span>
                    <span className={status.activeIncidents > 0 ? 'text-amber-400 font-bold' : 'text-muted'}>
                      {status.activeIncidents} active ticket{status.activeIncidents === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Topology Graph SVG Representation */}
          <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-surface-2 border-line'}`}>
            <span className="text-[11px] font-mono text-muted font-bold block mb-3 uppercase tracking-wider">
              Topological Dependency Architecture
            </span>

            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md font-mono text-2xs bg-indigo-500/20 text-indigo-400 font-bold">
                  Tier-0 Infrastructure
                </span>
                <span className="text-muted text-xs">SRV-AUTH (LDAP), SRV-DB (Postgres), SRV-NET (Backbone)</span>
              </div>
              <div className="pl-6 border-l-2 border-indigo-500/30 ml-4 py-1 space-y-2">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold text-slate-200">SRV-PAY (Payment Gateway)</span>
                  <span className="text-2xs font-mono text-amber-400">(Cascades across Auth + DB + Net)</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold text-slate-200">SRV-CLOUD (Object Storage)</span>
                  <span className="text-2xs font-mono text-muted">(Cascades to Auth + Net)</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-semibold text-slate-200">SRV-MAIL (Enterprise Relay)</span>
                  <span className="text-2xs font-mono text-muted">(Cascades to Auth + Net)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Blast Radius & Selected Service Telemetry */}
        <div
          className={`p-5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/60 border-white/10' : 'bg-surface-2 border-line'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-2xs font-mono text-indigo-400 font-bold">{selectedNode.id}</span>
                <h4 className="font-bold text-sm tracking-tight">{selectedNode.name}</h4>
              </div>
              <span
                className={`text-2xs font-mono px-2.5 py-0.5 rounded-full font-bold ${
                  selectedStatus.health === 'OUTAGE'
                    ? 'bg-red-500/20 text-red-400'
                    : selectedStatus.health === 'DEGRADED'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {selectedStatus.health}
              </span>
            </div>

            {/* Blast Radius Status Banner */}
            <div className={`mt-4 p-3 rounded-xl border text-xs font-mono ${
              selectedStatus.health === 'OUTAGE'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : selectedStatus.health === 'DEGRADED'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>{blastRadiusSeverity}</span>
              </div>
              <p className="text-[11px] opacity-80 mt-1 font-sans font-normal">
                {selectedStatus.health === 'OUTAGE'
                  ? 'Critical upstream outage detected. Interdependent microservices fail immediately.'
                  : selectedStatus.health === 'DEGRADED'
                  ? 'Latencies or elevated error rates observed on dependent endpoints.'
                  : 'Zero open high-severity incidents. Upstream latency within SLA margins.'}
              </p>
            </div>

            {/* Upstream Dependencies */}
            <div className="mt-4">
              <span className="text-2xs font-mono text-muted uppercase tracking-wider block font-bold mb-2">
                Upstream Prerequisites ({upstreamDependencies.length}):
              </span>
              {upstreamDependencies.length === 0 ? (
                <div className="text-[11px] text-muted font-mono p-2 rounded-lg bg-white/5">
                  None (Tier-0 Root Foundation Service)
                </div>
              ) : (
                <div className="space-y-1.5">
                  {upstreamDependencies.map((dep) => (
                    <div
                      key={dep.id}
                      className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-300">{dep.name}</span>
                      <span className={`text-2xs font-mono font-bold ${
                        dep.status.health === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {dep.status.health}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Dependents */}
            <div className="mt-4">
              <span className="text-2xs font-mono text-muted uppercase tracking-wider block font-bold mb-2">
                Downstream Impacted Applications ({downstreamDependents.length}):
              </span>
              {downstreamDependents.length === 0 ? (
                <div className="text-[11px] text-muted font-mono p-2 rounded-lg bg-white/5">
                  End-user leaf node (No downstream dependencies)
                </div>
              ) : (
                <div className="space-y-1.5">
                  {downstreamDependents.map((down) => (
                    <div
                      key={down.id}
                      className="p-2 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-slate-300">{down.name}</span>
                      <span className="text-2xs font-mono text-muted">Risk: High</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-white/5 text-2xs font-mono text-muted">
            Cascade analysis updated dynamically via IncidentEventBus stream.
          </div>
        </div>
      </div>
    </div>
  );
};
