import React, { useState, useEffect, useMemo } from 'react';
import {
  Category,
  Impact,
  Incident,
  ITService,
  PriorityStrategyType,
  AssignmentStrategyType,
  SLAPolicy,
  Technician,
  Urgency,
  User,
} from '../types/itsm';
import {
  X,
  AlertTriangle,
  Sparkles,
  Layers,
  Send,
  HelpCircle,
} from 'lucide-react';
import {
  suggestCategory,
  detectDuplicates,
  calculatePriority,
  recommendTechnicians,
} from '../utils/intelligentEngines';
import { AssignmentStrategyContext } from '../domain/AssignmentStrategy';
import { apiClient } from '../api/client';
import { Modal, OverlayHeader, PriorityBadge, Spinner } from './ui';

interface ReportIncidentModalProps {
  categories: Category[];
  services: ITService[];
  technicians: Technician[];
  existingIncidents: Incident[];
  currentUser: User;
  activePriorityStrategy: PriorityStrategyType;
  activeAssignmentStrategy?: AssignmentStrategyType;
  slaPolicies?: SLAPolicy[];
  onClose: () => void;
  onSubmit: (newIncident: Incident) => void | Promise<void>;
}

export const ReportIncidentModal: React.FC<ReportIncidentModalProps> = ({
  categories,
  services,
  technicians,
  existingIncidents,
  currentUser,
  activePriorityStrategy,
  activeAssignmentStrategy = 'SKILL_BASED',
  slaPolicies = [],
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [impact, setImpact] = useState<Impact>('HIGH');
  const [urgency, setUrgency] = useState<Urgency>('HIGH');
  const [affectedUsers, setAffectedUsers] = useState<number>(50);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (t = title, d = description) => ({
    title: t.trim().length < 5 ? 'Give the incident a clear title (at least 5 characters).' : undefined,
    description: d.trim().length < 10 ? 'Describe the problem in a little more detail (at least 10 characters).' : undefined,
  });

  // Auto category suggestion (Rule-based local)
  const { suggestedCategory, matchedKeywords, confidence } = useMemo(() => {
    return suggestCategory(title, description, categories);
  }, [title, description, categories]);

  // AI-powered category suggestion from server
  const [aiCatSuggestion, setAiCatSuggestion] = useState<{ id: string; name: string; confidence: number } | null>(null);

  useEffect(() => {
    if (description.trim().length < 8) {
      setAiCatSuggestion(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await apiClient.ai.suggestCategory(description);
        if (data?.categoryId && data?.categoryName) {
          setAiCatSuggestion({
            id: data.categoryId,
            name: data.categoryName,
            confidence: Math.round(data.confidence * 100),
          });
        }
      } catch {
        // Non-blocking fallback
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [description]);

  const effectiveSuggestion = aiCatSuggestion || (suggestedCategory ? { id: suggestedCategory.id, name: suggestedCategory.name, confidence } : null);

  // If high confidence auto-suggestion and category hasn't been manually overridden, sync category
  const handleApplySuggestedCategory = () => {
    if (effectiveSuggestion) {
      setCategoryId(effectiveSuggestion.id);
    }
  };

  // Selected service object
  const selectedService = useMemo(() => {
    return services.find((s) => s.id === serviceId) || null;
  }, [services, serviceId]);

  // Real-time Priority calculation
  const priorityCalc = useMemo(() => {
    return calculatePriority(impact, urgency, selectedService, affectedUsers, activePriorityStrategy);
  }, [impact, urgency, selectedService, affectedUsers, activePriorityStrategy]);

  // Duplicate detection in real-time
  const duplicateMatches = useMemo(() => {
    if (title.length < 5) return [];
    return detectDuplicates(title, description, serviceId, existingIncidents);
  }, [title, description, serviceId, existingIncidents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (errors.title || errors.description) {
      document.getElementById(errors.title ? 'report-title' : 'report-description')?.focus();
      return;
    }

    const catObj = categories.find((c) => c.id === categoryId) || categories[0];
    const srvObj = services.find((s) => s.id === serviceId) || services[0];

    const priority = priorityCalc.priority;

    // DRIVE DEADLINES DYNAMICALLY FROM SLAPOLICY OBJECTS
    const matchedPolicy = slaPolicies.find((p) => p.priority === priority);
    const respMins = matchedPolicy?.responseTargetMinutes ?? (priority === 'P1' ? 5 : priority === 'P2' ? 15 : priority === 'P3' ? 60 : 240);
    const resMins = matchedPolicy?.resolutionTargetMinutes ?? (priority === 'P1' ? 30 : priority === 'P2' ? 120 : priority === 'P3' ? 480 : 1440);

    const now = new Date();
    const respDeadline = new Date(now.getTime() + respMins * 60000).toISOString();
    const resDeadline = new Date(now.getTime() + resMins * 60000).toISOString();

    const incidentNumber = 1000 + existingIncidents.length + 1;
    const incId = `INC${incidentNumber}`;

    // TRUE STRATEGY PATTERN DISPATCH (SkillBased, LoadBased, RoundRobin, ExperienceBased)
    const strategyInstance = AssignmentStrategyContext.createFromCode(activeAssignmentStrategy);
    const strategyContext = new AssignmentStrategyContext(strategyInstance);
    const assignmentResult = strategyContext.execute(technicians, {
      incidentId: incId,
      categoryName: catObj.name,
      serviceName: srvObj.name,
      incidentDescription: description,
      affectedUsers,
    });
    const assignedTech = assignmentResult?.technician || null;

    const newIncident: Incident = {
      id: incId,
      title: title.trim(),
      description: description.trim(),
      reporterId: currentUser.id,
      reporterName: currentUser.fullName,
      categoryId: catObj.id,
      categoryName: catObj.name,
      serviceId: srvObj.id,
      serviceName: srvObj.name,
      impact,
      urgency,
      businessCriticality: srvObj.businessCriticality,
      affectedUsersCount: affectedUsers,
      priority,
      status: assignedTech ? 'ASSIGNED' : 'CLASSIFIED',
      createdAt: now.toISOString(),
      assignedTechnicianId: assignedTech?.id,
      assignedTechnicianName: assignedTech?.fullName,
      responseDeadline: respDeadline,
      resolutionDeadline: resDeadline,
      slaBreachedResponse: false,
      slaBreachedResolution: false,
      escalationLevel: 'TECHNICIAN',
      investigationNotes: [],
      auditTrail: [
        {
          id: `AUD-${Date.now()}-1`,
          incidentId: incId,
          timestamp: now.toISOString(),
          performedBy: currentUser.fullName,
          action: 'CREATE_INCIDENT',
          previousState: null,
          newState: 'NEW',
          description: `Reported by ${currentUser.fullName} via Self-Service Portal`,
        },
        {
          id: `AUD-${Date.now()}-2`,
          incidentId: incId,
          timestamp: new Date(now.getTime() + 1000).toISOString(),
          performedBy: 'System Classifier',
          action: 'CLASSIFY_INCIDENT',
          previousState: 'NEW',
          newState: 'CLASSIFIED',
          description: `Auto-classified into ${catObj.name} affecting ${srvObj.name}`,
        },
        {
          id: `AUD-${Date.now()}-3`,
          incidentId: incId,
          timestamp: new Date(now.getTime() + 2000).toISOString(),
          performedBy: 'System Prioritizer',
          action: 'CALCULATE_PRIORITY',
          previousState: 'CLASSIFIED',
          newState: 'CLASSIFIED',
          description: `${priorityCalc.rationale} → Priority set to ${priority}`,
        },
        ...(assignedTech
          ? [
              {
                id: `AUD-${Date.now()}-4`,
                incidentId: incId,
                timestamp: new Date(now.getTime() + 3000).toISOString(),
                performedBy: 'System Assigner',
                action: 'ASSIGN_TECHNICIAN',
                previousState: 'CLASSIFIED' as const,
                newState: 'ASSIGNED' as const,
                description: `Auto-assigned to ${assignedTech.fullName} (${assignedTech.id}) via Smart Recommendation Engine`,
              },
            ]
          : []),
      ],
    };

    setSubmitting(true);
    try {
      await onSubmit(newIncident);
    } finally {
      setSubmitting(false);
    }
  };

  const matchedPolicy = slaPolicies.find((p) => p.priority === priorityCalc.priority);
  const previewResp =
    matchedPolicy?.responseTargetMinutes ??
    (priorityCalc.priority === 'P1' ? 5 : priorityCalc.priority === 'P2' ? 15 : priorityCalc.priority === 'P3' ? 60 : 240);
  const previewRes =
    matchedPolicy?.resolutionTargetMinutes ??
    (priorityCalc.priority === 'P1' ? 30 : priorityCalc.priority === 'P2' ? 120 : priorityCalc.priority === 'P3' ? 480 : 1440);
  const fmtMins = (m: number) => (m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${m} min`);

  return (
    <Modal onClose={onClose} labelledBy="report-title-heading" size="lg">
      <OverlayHeader
        id="report-title-heading"
        icon={Layers}
        title="New incident"
        subtitle="We'll classify it, set its priority and SLA, check for duplicates and assign it automatically."
        onClose={onClose}
      />

      <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {duplicateMatches.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm dark:border-amber-500/30 dark:bg-amber-500/10" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="font-semibold text-amber-900 dark:text-amber-400">
                  Possible duplicate · {duplicateMatches[0].similarityScore}% match
                </p>
                <p className="mt-0.5 text-amber-800 dark:text-amber-400/80">
                  <span className="font-mono text-xs">{duplicateMatches[0].incident.id}</span> — {duplicateMatches[0].incident.title}
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/80">Shared terms: {duplicateMatches[0].sharedKeywords.join(', ')}</p>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="report-title" className="ui-label">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="report-title"
              type="text"
              autoFocus
              placeholder="e.g. Payment gateway returning 504 on checkout"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) setFieldErrors((f) => ({ ...f, title: validate(e.target.value).title }));
              }}
              onBlur={() => title && setFieldErrors((f) => ({ ...f, title: validate().title }))}
              className="ui-input"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={fieldErrors.title ? 'report-title-err' : undefined}
            />
            {fieldErrors.title && <p id="report-title-err" className="ui-field-error">{fieldErrors.title}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="report-service" className="ui-label">
                Affected service
              </label>
              <select id="report-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="ui-select">
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.businessCriticality.toLowerCase()} criticality
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="report-category" className="ui-label">
                  Category
                </label>
                {effectiveSuggestion && effectiveSuggestion.id !== categoryId && (
                  <button type="button" onClick={handleApplySuggestedCategory} className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">
                    <Sparkles className="h-3 w-3" /> Use {effectiveSuggestion.name} ({effectiveSuggestion.confidence}%)
                  </button>
                )}
              </div>
              <select id="report-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="ui-select">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {suggestedCategory && matchedKeywords.length > 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  Suggested from keywords: {matchedKeywords.join(', ')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="report-impact" className="ui-label">
                Impact
              </label>
              <select id="report-impact" value={impact} onChange={(e) => setImpact(e.target.value as Impact)} className="ui-select">
                <option value="CRITICAL">Critical · company-wide</option>
                <option value="HIGH">High · large department</option>
                <option value="MEDIUM">Medium · single team</option>
                <option value="LOW">Low · single user</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-urgency" className="ui-label">
                Urgency
              </label>
              <select id="report-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} className="ui-select">
                <option value="CRITICAL">Critical · work stopped</option>
                <option value="HIGH">High · work degraded</option>
                <option value="MEDIUM">Medium · workaround exists</option>
                <option value="LOW">Low · not urgent</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-users" className="ui-label">
                Affected users
              </label>
              <input
                id="report-users"
                type="number"
                min={1}
                max={50000}
                value={affectedUsers}
                onChange={(e) => setAffectedUsers(parseInt(e.target.value) || 1)}
                className="ui-input tabular-nums"
              />
            </div>
          </div>

          {/* Live priority / SLA preview */}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">
                Calculated priority · {activePriorityStrategy.replaceAll('_', ' ').toLowerCase()} · {activeAssignmentStrategy.replaceAll('_', ' ').toLowerCase()} dispatch
              </p>
              <p className="mt-1 text-sm text-ink-2">{priorityCalc.rationale}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
              <PriorityBadge priority={priorityCalc.priority} />
              <span className="text-xs text-muted tabular-nums">
                Respond {fmtMins(previewResp)} · resolve {fmtMins(previewRes)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="report-description" className="ui-label">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="report-description"
              rows={4}
              placeholder="Error codes, environment, steps to reproduce, affected endpoints…"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description) setFieldErrors((f) => ({ ...f, description: validate(title, e.target.value).description }));
              }}
              onBlur={() => description && setFieldErrors((f) => ({ ...f, description: validate().description }))}
              className="ui-textarea"
              aria-invalid={!!fieldErrors.description}
              aria-describedby={fieldErrors.description ? 'report-description-err' : 'report-description-hint'}
            />
            {fieldErrors.description ? (
              <p id="report-description-err" className="ui-field-error">{fieldErrors.description}</p>
            ) : (
              <p id="report-description-hint" className="mt-1.5 text-xs text-muted">More detail helps us route it to the right technician.</p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-6 py-3.5">
          <span className="hidden text-[12.5px] text-muted sm:block">Press <kbd className="ui-kbd">Esc</kbd> to cancel</span>
          <span className="flex gap-2">
          <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={submitting}>
            {submitting ? <Spinner /> : <Send className="h-4 w-4" />}
            {submitting ? 'Submitting…' : 'Submit incident'}
          </button>
          </span>
        </footer>
      </form>
    </Modal>
  );
};
