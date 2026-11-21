import { IncidentStatus } from '../types/itsm';

export interface StateTransitionResult {
  valid: boolean;
  message?: string;
}

export const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  NEW: ['CLASSIFIED', 'ASSIGNED'],
  CLASSIFIED: ['ASSIGNED'],
  ASSIGNED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'NEEDS_INFO'],
  IN_PROGRESS: ['NEEDS_INFO', 'RESOLVED'],
  NEEDS_INFO: ['IN_PROGRESS'],
  RESOLVED: ['VERIFIED', 'IN_PROGRESS'], // Employee verifies or reopens
  VERIFIED: ['CLOSED'],
  CLOSED: [], // Terminal state
};

export const STATE_DESCRIPTIONS: Record<IncidentStatus, string> = {
  NEW: 'Incident just reported by employee. Awaiting triage and classification.',
  CLASSIFIED: 'Service, category, and priority computed based on business criticality.',
  ASSIGNED: 'Dispatched to specialized technician based on active assignment strategy.',
  ACKNOWLEDGED: 'Technician confirmed receipt and commenced initial response SLA.',
  IN_PROGRESS: 'Active root-cause investigation, debugging, and patch deployment.',
  NEEDS_INFO: 'Pending additional diagnostic logs or clarification from the reporter.',
  RESOLVED: 'Technician provided work-around or permanent fix and submitted resolution notes.',
  VERIFIED: 'Reporter or Quality lead confirmed service restoration in production.',
  CLOSED: 'Formal post-incident review completed and SLA recorded.',
};

export function validateStateTransition(
  currentState: IncidentStatus,
  targetState: IncidentStatus
): StateTransitionResult {
  if (currentState === targetState) {
    return { valid: false, message: `Incident is already in status '${currentState}'.` };
  }

  const allowedNext = VALID_TRANSITIONS[currentState] || [];
  if (!allowedNext.includes(targetState)) {
    return {
      valid: false,
      message: `Invalid State Transition: Cannot move directly from '${currentState}' to '${targetState}'. Permitted transitions from '${currentState}' are: [${allowedNext.join(
        ', '
      ) || 'None (Terminal state)'}].`,
    };
  }

  return { valid: true };
}
