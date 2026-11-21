import React, { useState } from 'react';
import { Drawer, OverlayHeader, PriorityBadge, StatusBadge, Tabs } from './ui';
import {
  Incident,
  IncidentStatus,
  Technician,
  User,
  Role,
  AssignmentStrategyType,
} from '../types/itsm';
import { apiClient } from '../api/client';
import {
  X,
  Clock,
  UserCheck,
  History,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Send,
  MessageSquare,
  Sparkles,
  Lock,
  Cpu,
} from 'lucide-react';
import {
  validateStateTransition,
  VALID_TRANSITIONS,
  STATE_DESCRIPTIONS,
} from '../utils/stateMachine';
import {
  checkSlaStatus,
  detectDuplicates,
  recommendTechnicians,
  findSuggestedResolutions,
} from '../utils/intelligentEngines';
import { AssignmentStrategyContext } from '../domain/AssignmentStrategy';

interface IncidentDetailModalProps {
  incident: Incident;
  allIncidents: Incident[];
  technicians: Technician[];
  currentUser: User;
  activeAssignmentStrategy?: AssignmentStrategyType;
  onClose: () => void;
  onUpdateIncident: (updated: Incident) => void;
}

export const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  incident,
  allIncidents,
  technicians,
  currentUser,
  activeAssignmentStrategy = 'SKILL_BASED',
  onClose,
  onUpdateIncident,
}) => {
  const [activeTab, setActiveTab] = useState<'ACTIONS' | 'AUDIT' | 'INTELLIGENCE'>('ACTIONS');
  const [selectedStrategy, setSelectedStrategy] = useState<AssignmentStrategyType>(activeAssignmentStrategy);
  const [newNote, setNewNote] = useState('');
  const [resolutionText, setResolutionText] = useState(incident.resolutionSummary || '');
  const [closureReason, setClosureReason] = useState(incident.closureReason || '');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [loadingAiResolution, setLoadingAiResolution] = useState(false);
  const [aiResolutionHint, setAiResolutionHint] = useState<string | null>(null);

  const handleAiSuggestResolution = async () => {
    try {
      setLoadingAiResolution(true);
      const data = await apiClient.ai.suggestResolution(
        `${incident.title}: ${incident.description}`,
        incident.id
      );
      if (data?.suggestedResolution) {
        setAiResolutionHint(data.suggestedResolution);
        if (!resolutionText.trim()) {
          setResolutionText(data.suggestedResolution);
        }
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingAiResolution(false);
    }
  };

  // Intelligent Engine calculations
  const sla = checkSlaStatus(
    incident.createdAt,
    incident.responseDeadline,
    incident.resolutionDeadline,
    incident.status
  );

  const duplicates = detectDuplicates(
    incident.title,
    incident.description,
    incident.serviceId,
    allIncidents.filter((i) => i.id !== incident.id)
  );

  const recommendedTechs = recommendTechnicians(
    technicians,
    incident.categoryName,
    incident.serviceName,
    incident.description
  );

  const historicalResolutions = findSuggestedResolutions(
    incident.title,
    incident.description,
    allIncidents.filter((i) => i.id !== incident.id && i.status === 'CLOSED')
  );

  // Transition handler that demonstrates the State Pattern enforcement and Role Guards
  const handleTransition = async (targetState: IncidentStatus, customActionName?: string, customDesc?: string) => {
    setTransitionError(null);

    // 1. Enforce Role Authorization Guards (Polymorphic Role Bounds)
    if (targetState === 'ASSIGNED' && currentUser.role !== 'ROLE_ADMIN') {
      setTransitionError("UnauthorizedOperationException: Access Denied. Only ROLE_ADMIN can assign or reassign technicians.");
      return;
    }
    if ((targetState === 'ACKNOWLEDGED' || targetState === 'IN_PROGRESS' || targetState === 'RESOLVED') &&
        currentUser.role !== 'ROLE_TECHNICIAN' && currentUser.role !== 'ROLE_ADMIN') {
      setTransitionError(`UnauthorizedOperationException: Access Denied. Role '${currentUser.role}' cannot perform technician transition to '${targetState}'. Required: ROLE_TECHNICIAN.`);
      return;
    }
    if (targetState === 'VERIFIED' && currentUser.role === 'ROLE_TECHNICIAN') {
      setTransitionError("UnauthorizedOperationException: Access Denied. Technicians cannot verify their own resolutions. Verification must be performed by the Reporter or Administrator.");
      return;
    }
    if (targetState === 'CLOSED' && currentUser.role !== 'ROLE_ADMIN') {
      setTransitionError("UnauthorizedOperationException: Access Denied. Only ROLE_ADMIN has formal incident closure authority.");
      return;
    }

    const validation = validateStateTransition(incident.status, targetState);
    if (!validation.valid) {
      setTransitionError(`InvalidStateTransitionException: ${validation.message}`);
      return;
    }

    try {
      const note = targetState === 'RESOLVED' ? resolutionText : (targetState === 'CLOSED' ? closureReason : customDesc);
      const updated = await apiClient.incidents.transition(incident.id, targetState, note);
      onUpdateIncident(updated);
    } catch (err: any) {
      setTransitionError(err.message || 'State transition error');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setTransitionError(null);
    try {
      const updated = await apiClient.incidents.addNote(incident.id, newNote.trim());
      setNewNote('');
      onUpdateIncident(updated);
    } catch (err: any) {
      setTransitionError(err.message || 'Failed to add note');
    }
  };

  // TRUE STRATEGY PATTERN DISPATCH via Server API
  const handleStrategyDispatch = async (strategyCodeToRun: AssignmentStrategyType) => {
    setTransitionError(null);
    try {
      const res = await apiClient.incidents.assign(incident.id, strategyCodeToRun);
      onUpdateIncident(res.incident);
    } catch (err: any) {
      setTransitionError(err.message || 'Dispatch failed');
    }
  };

  const handleAssignTechnician = async (techId: string) => {
    setTransitionError(null);
    try {
      const res = await apiClient.incidents.assign(incident.id, undefined, techId);
      onUpdateIncident(res.incident);
    } catch (err: any) {
      setTransitionError(err.message || 'Direct assignment failed');
    }
  };

  const handleManualEscalation = () => {
    const levels: Incident['escalationLevel'][] = ['TECHNICIAN', 'TEAM_LEAD', 'SYSTEM_ADMIN', 'IT_MANAGER'];
    const currentIndex = levels.indexOf(incident.escalationLevel);
    if (currentIndex >= levels.length - 1) return;

    const nextLevel = levels[currentIndex + 1];
    const now = new Date().toISOString();

    const newAudit = {
      id: `AUD-${Date.now()}`,
      incidentId: incident.id,
      timestamp: now,
      performedBy: currentUser.fullName,
      action: 'ESCALATE',
      previousState: incident.status,
      newState: incident.status,
      description: `Escalated from ${incident.escalationLevel} to ${nextLevel}`,
    };

    const updated: Incident = {
      ...incident,
      escalationLevel: nextLevel,
      auditTrail: [newAudit, ...incident.auditTrail],
    };

    onUpdateIncident(updated);
  };

  const allowedNextStates = VALID_TRANSITIONS[incident.status] || [];

  const tabs: { id: typeof activeTab; label: string; icon: React.ElementType; badge?: React.ReactNode }[] = [
    { id: 'ACTIONS', label: 'Workflow', icon: ArrowRight },
    {
      id: 'INTELLIGENCE',
      label: 'Insights',
      icon: Sparkles,
      badge: duplicates.length > 0 ? <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Possible duplicates" /> : undefined,
    },
    { id: 'AUDIT', label: 'Timeline', icon: History, badge: <span className="ui-count bg-surface-3 text-muted">{incident.auditTrail.length}</span> },
  ];

  return (
    <Drawer onClose={onClose} labelledBy="incident-drawer-title">
      <OverlayHeader id="incident-drawer-title" title={incident.title} onClose={onClose}>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-mono text-[12.5px] text-muted">{incident.id}</span>
          <PriorityBadge priority={incident.priority} />
          <StatusBadge status={incident.status} />
          <span className="text-[13px] text-muted">Escalated to {incident.escalationLevel.toLowerCase().replaceAll('_', ' ').replace(/\bit\b/, 'IT')}</span>
        </div>
      </OverlayHeader>

      <dl className="mx-6 mb-1 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-surface-2 px-4 py-3 text-[13.5px] ring-1 ring-line sm:grid-cols-4">
        {[
          ['Service', incident.serviceName],
          ['Category', incident.categoryName],
          ['Reporter', incident.reporterName],
          ['Assignee', incident.assignedTechnicianName || 'Unassigned'],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="truncate font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <Tabs label="Incident sections" value={activeTab} onChange={setActiveTab} options={tabs} />

        {/* Modal Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Transition Exception Banner */}
          {transitionError && (
            <div className="bg-red-50 border border-red-300 p-3.5 rounded-lg flex items-start gap-2.5 text-xs text-red-900 animate-shake">
              <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold">State Pattern Enforcement Error: </span>
                {transitionError}
              </div>
            </div>
          )}

          {activeTab === 'ACTIONS' && (
            <div className="space-y-6">
              {/* State Machine Overview */}
              <div className="bg-surface-2 p-4 rounded-xl border border-line">
                <div className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  State Pattern Lifecycle Sequence
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  {[
                    'NEW',
                    'CLASSIFIED',
                    'ASSIGNED',
                    'ACKNOWLEDGED',
                    'IN_PROGRESS',
                    'RESOLVED',
                    'VERIFIED',
                    'CLOSED',
                  ].map((st, idx, arr) => {
                    const isCurrent = incident.status === st;
                    return (
                      <React.Fragment key={st}>
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-mono ${
                            isCurrent
                              ? 'bg-blue-600 text-white font-bold ring-2 ring-blue-300'
                              : 'bg-surface text-ink-2 border border-line'
                          }`}
                        >
                          {st}
                        </span>
                        {idx < arr.length - 1 && (
                          <span className="text-slate-300">→</span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                <p className="text-xs text-muted mt-2">
                  <strong>Current State Meaning: </strong>
                  {STATE_DESCRIPTIONS[incident.status]}
                </p>
              </div>

              {/* GoF Strategy Pattern Autonomous Dispatcher */}
              {(incident.status === 'NEW' || incident.status === 'CLASSIFIED' || !incident.assignedTechnicianId) && (
                <div className="p-4 bg-indigo-50/80 rounded-xl border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                        Strategy Pattern Dispatch Engine (4 Algorithms)
                      </h4>
                    </div>
                    <span className="text-2xs font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                      GoF Strategy
                    </span>
                  </div>

                  <p className="text-[11px] text-ink-2 leading-relaxed">
                    Select an assignment strategy at runtime to evaluate against active technician capacities:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {[
                      { code: 'SKILL_BASED', label: '1. Skill-Based', desc: 'Keyword match' },
                      { code: 'LOAD_BASED', label: '2. Load-Based', desc: 'Lowest load %' },
                      { code: 'ROUND_ROBIN', label: '3. Round-Robin', desc: 'Even rotation' },
                      { code: 'EXPERIENCE_BASED', label: '4. Tenure-Based', desc: 'Seniority order' },
                    ].map((st) => (
                      <button
                        key={st.code}
                        type="button"
                        onClick={() => setSelectedStrategy(st.code as any)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          selectedStrategy === st.code
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-surface text-ink-2 border-line hover:border-indigo-300'
                        }`}
                      >
                        <div className="font-bold text-[11px]">{st.label}</div>
                        <div className="text-2xs opacity-80">{st.desc}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-indigo-200/60">
                    <div className="text-xs text-indigo-900">
                      Active Strategy: <strong className="font-mono">{selectedStrategy}</strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStrategyDispatch(selectedStrategy)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all ${
                        currentUser.role === 'ROLE_ADMIN'
                          ? 'bg-indigo-600 hover:brightness-110 text-white cursor-pointer active:scale-95'
                          : 'bg-surface-3 text-muted cursor-not-allowed border border-line-strong'
                      }`}
                      title={currentUser.role !== 'ROLE_ADMIN' ? 'Only ROLE_ADMIN has dispatch authority' : 'Execute Strategy Dispatch'}
                    >
                      {currentUser.role !== 'ROLE_ADMIN' ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-muted" />
                          <span>🔒 Admin Authorization Required</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>[ ⌖ Execute {selectedStrategy.split('_')[0]} Dispatch ]</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Allowed Transitions Trigger Buttons */}
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
                  Permitted State Transitions from {incident.status}
                </h4>
                {allowedNextStates.length === 0 ? (
                  <div className="p-3 bg-surface-3 rounded-lg text-xs text-ink-2">
                    Incident is in terminal state ({incident.status}). No further state transitions allowed.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {allowedNextStates.map((target) => {
                      let isAuthorized = true;
                      let roleLabel = '';
                      if (target === 'ASSIGNED' && currentUser.role !== 'ROLE_ADMIN') {
                        isAuthorized = false;
                        roleLabel = 'Admin Only';
                      } else if ((target === 'ACKNOWLEDGED' || target === 'IN_PROGRESS' || target === 'RESOLVED') && currentUser.role === 'ROLE_EMPLOYEE') {
                        isAuthorized = false;
                        roleLabel = 'Tech Only';
                      } else if (target === 'VERIFIED' && currentUser.role === 'ROLE_TECHNICIAN') {
                        isAuthorized = false;
                        roleLabel = 'Reporter Only';
                      } else if (target === 'CLOSED' && currentUser.role !== 'ROLE_ADMIN') {
                        isAuthorized = false;
                        roleLabel = 'Admin Only';
                      }

                      return (
                        <button
                          key={target}
                          onClick={() => handleTransition(target)}
                          className={`px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all ${
                            isAuthorized
                              ? 'bg-blue-600 hover:brightness-110 text-white cursor-pointer active:scale-95'
                              : 'bg-surface-3 text-muted border border-line cursor-not-allowed'
                          }`}
                          title={!isAuthorized ? `Role ${currentUser.role} not authorized for ${target} (${roleLabel})` : `Advance to ${target}`}
                        >
                          {!isAuthorized && <Lock className="w-3.5 h-3.5 text-muted" />}
                          <span>Advance to {target}</span>
                          {!isAuthorized ? (
                            <span className="text-2xs font-mono opacity-70">({roleLabel})</span>
                          ) : (
                            <ArrowRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      );
                    })}

                    {/* Demonstration of illegal transition rejection button */}
                    {incident.status === 'NEW' && (
                      <button
                        onClick={() => handleTransition('CLOSED')}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer"
                        title="Demonstrates InvalidStateTransitionException"
                      >
                        Try Illegal Transition (NEW → CLOSED)
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Investigation Notes & Diagnostics */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Technician Investigation Notes
                </h4>
                <div className="space-y-2 bg-surface-2 p-3 rounded-lg border border-line max-h-40 overflow-y-auto">
                  {incident.investigationNotes.length === 0 ? (
                    <span className="text-xs text-muted italic">
                      No investigation notes recorded yet.
                    </span>
                  ) : (
                    incident.investigationNotes.map((note, i) => (
                      <div key={i} className="text-xs text-ink-2 font-mono bg-surface p-2 rounded border border-line">
                        {note}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter diagnostic finding or action taken..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                    className="flex-1 px-3 py-2 text-xs border border-line-strong rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddNote}
                    className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-900 text-white rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" /> Add Note
                  </button>
                </div>
              </div>

              {/* Resolution Entry if in IN_PROGRESS or RESOLVED */}
              {(incident.status === 'IN_PROGRESS' || incident.status === 'RESOLVED') && (
                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase">
                      Resolution Documentation
                    </h4>
                    {incident.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        onClick={handleAiSuggestResolution}
                        disabled={loadingAiResolution}
                        className="text-2xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 hover:underline disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        {loadingAiResolution ? 'Consulting AI...' : 'AI Suggest Resolution'}
                      </button>
                    )}
                  </div>
                  {aiResolutionHint && resolutionText !== aiResolutionHint && (
                    <div className="flex items-center justify-between text-[11px] p-2 bg-emerald-100/70 border border-emerald-300 rounded text-emerald-900">
                      <span className="truncate mr-2">💡 AI Hint: {aiResolutionHint.slice(0, 75)}...</span>
                      <button
                        type="button"
                        onClick={() => setResolutionText(aiResolutionHint)}
                        className="text-2xs font-bold text-emerald-800 underline shrink-0"
                      >
                        Apply Hint
                      </button>
                    </div>
                  )}
                  <textarea
                    rows={3}
                    placeholder="Describe permanent fix, code patch, or configuration rollback..."
                    value={resolutionText}
                    onChange={(e) => setResolutionText(e.target.value)}
                    className="w-full p-2.5 text-xs bg-surface border border-emerald-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  {incident.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() =>
                        handleTransition('RESOLVED', 'RESOLVE_INCIDENT', `Resolved: ${resolutionText}`)
                      }
                      disabled={!resolutionText.trim()}
                      className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:brightness-110 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Submit Resolution & Mark RESOLVED
                    </button>
                  )}
                </div>
              )}

              {/* Closure Review if in VERIFIED */}
              {incident.status === 'VERIFIED' && (
                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-2">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase">
                    Formal Closure Review & Post-Mortem
                  </h4>
                  <input
                    type="text"
                    placeholder="Post-mortem notes or preventative measures..."
                    value={closureReason}
                    onChange={(e) => setClosureReason(e.target.value)}
                    className="w-full p-2 text-xs bg-surface border border-indigo-200 rounded-lg"
                  />
                  <button
                    onClick={() =>
                      handleTransition('CLOSED', 'CLOSE_INCIDENT', `Closed: ${closureReason}`)
                    }
                    className="px-3.5 py-2 text-xs font-semibold bg-indigo-600 hover:brightness-110 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Close Incident (Terminal State)
                  </button>
                </div>
              )}

              {/* Admin / Supervisor Escalation Panel */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-2 rounded-lg border border-line text-xs">
                <div>
                  <span className="font-semibold text-ink-2">Escalation Status: </span>
                  <span className="font-mono text-ink-2">{incident.escalationLevel}</span>
                </div>
                <button
                  onClick={handleManualEscalation}
                  disabled={incident.escalationLevel === 'IT_MANAGER'}
                  className="px-3 py-1.5 font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded flex items-center gap-1 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Escalate Next Level
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: INTELLIGENT FEATURES ENGINE */}
          {activeTab === 'INTELLIGENCE' && (
            <div className="space-y-6">
              {/* Feature A: Duplicate Detection */}
              <div className="p-4 rounded-xl border border-line bg-surface space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-ink flex items-center gap-1.5 uppercase">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    (A) Duplicate / Related Incident Detection (Jaccard Similarity)
                  </h4>
                  <span className="text-[11px] text-muted">Target Service: {incident.serviceName}</span>
                </div>
                {duplicates.length === 0 ? (
                  <p className="text-xs text-muted">
                    No duplicate or correlated incidents found on this service cluster within the threshold.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {duplicates.map((dup) => (
                      <div
                        key={dup.incident.id}
                        className="p-3 bg-purple-50/60 rounded-lg border border-purple-200 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-purple-800">{dup.incident.id}</span>
                            <span className="font-semibold text-ink">{dup.incident.title}</span>
                          </div>
                          <div className="text-[11px] text-purple-700 mt-1">
                            Shared tokens: {dup.sharedKeywords.join(', ')}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 font-mono font-bold text-xs bg-purple-200 text-purple-900 rounded-full">
                          {dup.similarityScore}% match
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Feature B: Smart Technician Recommendation */}
              <div className="p-4 rounded-xl border border-line bg-surface space-y-3">
                <h4 className="text-xs font-bold text-ink flex items-center gap-1.5 uppercase">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  (B) Smart Technician Recommendation Scoring Formula
                </h4>
                <p className="text-[11px] text-muted">
                  Formula: <code>(SkillMatch × 40%) + (WorkloadAvailability × 30%) + (Experience × 20%) + (StatusBonus × 10%)</code>
                </p>
                <div className="space-y-2">
                  {recommendedTechs.map((rec, i) => (
                    <div
                      key={rec.technician.id}
                      className="p-3 bg-surface-2 rounded-lg border border-line flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{rec.technician.fullName}</span>
                          <span className="text-muted font-mono">({rec.technician.id})</span>
                          <span className="text-2xs bg-surface-3 px-1.5 py-0.5 rounded">
                            {rec.technician.specialization}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted mt-1 flex flex-wrap gap-x-3">
                          <span>Skill Match: <strong>{rec.skillScore}%</strong></span>
                          <span>Active Load: <strong>{rec.technician.activeIncidentCount}/{rec.technician.maxWorkload}</strong></span>
                          <span>Experience: <strong>{rec.technician.experienceYears} yrs</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-sm font-bold text-blue-600">{rec.totalScore}</span>
                          <span className="text-2xs text-muted">/100</span>
                        </div>
                        <button
                          onClick={() => handleAssignTechnician(rec.technician.id)}
                          disabled={currentUser.role !== 'ROLE_ADMIN' || rec.technician.activeIncidentCount >= rec.technician.maxWorkload}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                            currentUser.role !== 'ROLE_ADMIN'
                              ? 'bg-surface-3 text-muted cursor-not-allowed border border-line-strong'
                              : rec.technician.activeIncidentCount >= rec.technician.maxWorkload
                              ? 'bg-amber-100 text-amber-800 cursor-not-allowed border border-amber-300'
                              : 'bg-blue-600 hover:brightness-110 text-white cursor-pointer active:scale-95'
                          }`}
                          title={
                            currentUser.role !== 'ROLE_ADMIN'
                              ? 'Role ROLE_ADMIN required to assign technicians'
                              : rec.technician.activeIncidentCount >= rec.technician.maxWorkload
                              ? 'Technician at maximum capacity quota'
                              : 'Assign Technician'
                          }
                        >
                          {currentUser.role !== 'ROLE_ADMIN' && <Lock className="w-3 h-3 text-muted" />}
                          <span>
                            {currentUser.role !== 'ROLE_ADMIN'
                              ? 'Admin Only'
                              : rec.technician.activeIncidentCount >= rec.technician.maxWorkload
                              ? 'At Capacity'
                              : 'Assign Tech'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature F: Historical Resolutions */}
              <div className="p-4 rounded-xl border border-line bg-surface space-y-3">
                <h4 className="text-xs font-bold text-ink flex items-center gap-1.5 uppercase">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  (F) Suggested Resolutions from Historical Resolved Incidents
                </h4>
                {historicalResolutions.length === 0 ? (
                  <p className="text-xs text-muted">
                    No matching historical resolutions recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {historicalResolutions.map((hr) => (
                      <div key={hr.incidentId} className="p-3 bg-amber-50/50 rounded-lg border border-amber-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-amber-900">{hr.incidentId}: {hr.title}</span>
                          <span className="text-2xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-mono">
                            {hr.similarityScore}% text similarity
                          </span>
                        </div>
                        <p className="text-ink-2 font-mono text-[11px] bg-surface p-2 rounded border border-amber-100">
                          {hr.resolutionSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-3">
              <div className="text-xs text-muted">
                Immutable audit history with timestamps, actor IDs, previous states, and state transition rationales.
              </div>
              <div className="space-y-2.5">
                {incident.auditTrail.map((record) => (
                  <div
                    key={record.id}
                    className="p-3 rounded-lg border border-line bg-surface-2 text-xs flex items-start gap-3"
                  >
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-md shrink-0 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">
                          {record.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-muted font-mono">
                          {new Date(record.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-ink-2 mt-0.5">{record.description}</p>
                      <div className="mt-1 flex items-center gap-2 text-2xs text-muted">
                        <span>Actor: <strong>{record.performedBy}</strong></span>
                        {record.previousState && record.newState && (
                          <span>
                            Transition: <span className="font-mono text-ink-2">{record.previousState} → {record.newState}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-3 text-[12.5px] text-muted">
          <span className="hidden sm:inline">Observers: audit · notification · SLA</span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ml-auto">
            Close
          </button>
        </footer>
    </Drawer>
  );
};
