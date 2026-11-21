export type Role = 'ROLE_EMPLOYEE' | 'ROLE_TECHNICIAN' | 'ROLE_ADMIN';

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Impact = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BusinessCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus =
  | 'NEW'
  | 'CLASSIFIED'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'NEEDS_INFO'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CLOSED';

export type EscalationLevel = 'TECHNICIAN' | 'TEAM_LEAD' | 'SYSTEM_ADMIN' | 'IT_MANAGER';

export type PriorityStrategyType = 'WEIGHTED_SCORING' | 'RULE_BASED';
export type AssignmentStrategyType = 'SKILL_BASED' | 'LOAD_BASED' | 'ROUND_ROBIN' | 'EXPERIENCE_BASED';

export interface BaseUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  passwordHash?: string;
}

export interface Employee extends BaseUser {
  role: 'ROLE_EMPLOYEE';
  department: string;
}

export interface Technician extends BaseUser {
  role: 'ROLE_TECHNICIAN';
  skills: string[];
  experienceYears: number;
  maxWorkload: number;
  available: boolean;
  activeIncidentCount: number;
  specialization: string;
}

export interface Administrator extends BaseUser {
  role: 'ROLE_ADMIN';
  managedDivision: string;
}

export type User = Employee | Technician | Administrator;

export interface ITService {
  id: string;
  name: string;
  businessCriticality: BusinessCriticality;
  ownerTeam: string;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'OUTAGE';
}

export interface Category {
  id: string;
  name: string;
  description: string;
  keywords: string[];
}

export interface SLAPolicy {
  id: string;
  priority: Priority;
  responseTargetMinutes: number;
  resolutionTargetMinutes: number;
  description: string;
}

export interface AuditRecord {
  id: string;
  incidentId: string;
  timestamp: string;
  performedBy: string;
  action: string;
  previousState: IncidentStatus | null;
  newState: IncidentStatus | null;
  description: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  recipientName: string;
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface Feedback {
  id: string;
  incidentId: string;
  employeeId: string;
  rating: number; // 1 to 5
  comments: string;
  createdAt: string;
}

export interface Incident {
  id: string; // INC1001
  title: string;
  description: string;
  reporterId: string;
  reporterName: string;
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceName: string;
  impact: Impact;
  urgency: Urgency;
  businessCriticality: BusinessCriticality;
  affectedUsersCount: number;
  priority: Priority;
  status: IncidentStatus;
  createdAt: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  responseDeadline: string;
  resolutionDeadline: string;
  slaBreachedResponse: boolean;
  slaBreachedResolution: boolean;
  escalationLevel: EscalationLevel;
  investigationNotes: string[];
  resolutionSummary?: string;
  closureReason?: string;
  auditTrail: AuditRecord[];
}
