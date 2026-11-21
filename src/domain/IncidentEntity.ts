import {
  AuditRecord,
  BusinessCriticality,
  EscalationLevel,
  Impact,
  Incident,
  IncidentStatus,
  Priority,
  Urgency,
} from '../types/itsm';
import { IncidentState, IncidentStateFactory, NewState } from './IncidentState';
import { UserEntity } from './UserEntity';
import { UnauthorizedOperationException } from './Exceptions';

export interface IncidentProps {
  id: string;
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
  status?: IncidentStatus;
  createdAt?: string;
  assignedTechnicianId?: string;
  assignedTechnicianName?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  responseDeadline: string;
  resolutionDeadline: string;
  slaBreachedResponse?: boolean;
  slaBreachedResolution?: boolean;
  escalationLevel?: EscalationLevel;
  investigationNotes?: string[];
  resolutionSummary?: string;
  closureReason?: string;
  auditTrail?: AuditRecord[];
}

/**
 * Incident Domain Class
 * Implements encapsulation: private properties with getters, business logic methods,
 * and state management through the GoF State Pattern.
 */
export class IncidentEntity {
  private readonly _id: string;
  private _title: string;
  private _description: string;
  private readonly _reporterId: string;
  private readonly _reporterName: string;
  private _categoryId: string;
  private _categoryName: string;
  private _serviceId: string;
  private _serviceName: string;
  private _impact: Impact;
  private _urgency: Urgency;
  private _businessCriticality: BusinessCriticality;
  private _affectedUsersCount: number;
  private _priority: Priority;

  // State pattern context
  private _state: IncidentState;

  private readonly _createdAt: string;
  private _assignedTechnicianId?: string;
  private _assignedTechnicianName?: string;
  private _acknowledgedAt?: string;
  private _resolvedAt?: string;
  private _closedAt?: string;
  private _responseDeadline: string;
  private _resolutionDeadline: string;
  private _slaBreachedResponse: boolean;
  private _slaBreachedResolution: boolean;
  private _escalationLevel: EscalationLevel;
  private _investigationNotes: string[];
  private _resolutionSummary?: string;
  private _closureReason?: string;
  private _auditTrail: AuditRecord[];

  constructor(props: IncidentProps) {
    this._id = props.id;
    this._title = props.title;
    this._description = props.description;
    this._reporterId = props.reporterId;
    this._reporterName = props.reporterName;
    this._categoryId = props.categoryId;
    this._categoryName = props.categoryName;
    this._serviceId = props.serviceId;
    this._serviceName = props.serviceName;
    this._impact = props.impact;
    this._urgency = props.urgency;
    this._businessCriticality = props.businessCriticality;
    this._affectedUsersCount = props.affectedUsersCount;
    this._priority = props.priority;
    this._createdAt = props.createdAt || new Date().toISOString();
    this._assignedTechnicianId = props.assignedTechnicianId;
    this._assignedTechnicianName = props.assignedTechnicianName;
    this._acknowledgedAt = props.acknowledgedAt;
    this._resolvedAt = props.resolvedAt;
    this._closedAt = props.closedAt;
    this._responseDeadline = props.responseDeadline;
    this._resolutionDeadline = props.resolutionDeadline;
    this._slaBreachedResponse = props.slaBreachedResponse || false;
    this._slaBreachedResolution = props.slaBreachedResolution || false;
    this._escalationLevel = props.escalationLevel || 'TECHNICIAN';
    this._investigationNotes = props.investigationNotes ? [...props.investigationNotes] : [];
    this._resolutionSummary = props.resolutionSummary;
    this._closureReason = props.closureReason;
    this._auditTrail = props.auditTrail ? [...props.auditTrail] : [];

    // Initialize state
    if (props.status) {
      this._state = IncidentStateFactory.createState(props.status);
    } else {
      this._state = new NewState();
    }
  }

  // --- Getters ---
  public get id(): string { return this._id; }
  public get title(): string { return this._title; }
  public get description(): string { return this._description; }
  public get reporterId(): string { return this._reporterId; }
  public get reporterName(): string { return this._reporterName; }
  public get categoryId(): string { return this._categoryId; }
  public get categoryName(): string { return this._categoryName; }
  public get serviceId(): string { return this._serviceId; }
  public get serviceName(): string { return this._serviceName; }
  public get impact(): Impact { return this._impact; }
  public get urgency(): Urgency { return this._urgency; }
  public get businessCriticality(): BusinessCriticality { return this._businessCriticality; }
  public get affectedUsersCount(): number { return this._affectedUsersCount; }
  public get priority(): Priority { return this._priority; }
  public get status(): IncidentStatus { return this._state.status; }
  public get state(): IncidentState { return this._state; }
  public get createdAt(): string { return this._createdAt; }
  public get assignedTechnicianId(): string | undefined { return this._assignedTechnicianId; }
  public get assignedTechnicianName(): string | undefined { return this._assignedTechnicianName; }
  public get acknowledgedAt(): string | undefined { return this._acknowledgedAt; }
  public get resolvedAt(): string | undefined { return this._resolvedAt; }
  public get closedAt(): string | undefined { return this._closedAt; }
  public get responseDeadline(): string { return this._responseDeadline; }
  public get resolutionDeadline(): string { return this._resolutionDeadline; }
  public get slaBreachedResponse(): boolean { return this._slaBreachedResponse; }
  public get slaBreachedResolution(): boolean { return this._slaBreachedResolution; }
  public get escalationLevel(): EscalationLevel { return this._escalationLevel; }
  public get investigationNotes(): string[] { return [...this._investigationNotes]; }
  public get resolutionSummary(): string | undefined { return this._resolutionSummary; }
  public get closureReason(): string | undefined { return this._closureReason; }
  public get auditTrail(): AuditRecord[] { return [...this._auditTrail]; }

  // --- State Pattern Hooks ---
  public setState(newState: IncidentState): void {
    const prevStatus = this._state.status;
    this._state = newState;
    this.addAuditRecord({
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      incidentId: this._id,
      timestamp: new Date().toISOString(),
      performedBy: 'System/StateEngine',
      action: `TRANSITION_${prevStatus}_TO_${newState.status}`,
      previousState: prevStatus,
      newState: newState.status,
      description: `State moved to ${newState.status}: ${newState.description}`,
    });
  }

  public setAssignedTechnician(technicianId: string, technicianName: string): void {
    this._assignedTechnicianId = technicianId;
    this._assignedTechnicianName = technicianName;
  }

  public recordAcknowledgement(timestamp: string): void {
    this._acknowledgedAt = timestamp;
  }

  public recordResolution(summary: string, timestamp: string): void {
    this._resolutionSummary = summary;
    this._resolvedAt = timestamp;
  }

  public recordClosure(reason: string, timestamp: string): void {
    this._closureReason = reason;
    this._closedAt = timestamp;
  }

  // Business operations guarded by user roles and state pattern
  public assignByAdmin(admin: UserEntity, technicianId: string, technicianName: string): void {
    if (!admin.canAssignTechnician()) {
      throw new UnauthorizedOperationException(admin.role, 'assignByAdmin');
    }
    // Delegate transition to current state
    this._state.assign(this, technicianId, technicianName);
  }

  public acknowledgeByTechnician(technician: UserEntity): void {
    if (technician.role !== 'ROLE_TECHNICIAN' && technician.role !== 'ROLE_ADMIN') {
      throw new UnauthorizedOperationException(technician.role, 'acknowledgeByTechnician');
    }
    this._state.acknowledge(this);
  }

  public startProgress(user: UserEntity): void {
    if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
      throw new UnauthorizedOperationException(user.role, 'startProgress');
    }
    this._state.startProgress(this);
  }

  public requestInfo(user: UserEntity, note?: string): void {
    if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
      throw new UnauthorizedOperationException(user.role, 'requestInfo');
    }
    this._state.requestInfo(this);
    if (note) {
      this.addInvestigationNote(user, `[NEEDS_INFO] ${note}`);
    }
  }

  public resolveIncident(technician: UserEntity, summary: string): void {
    if (technician.role !== 'ROLE_TECHNICIAN' && technician.role !== 'ROLE_ADMIN') {
      throw new UnauthorizedOperationException(technician.role, 'resolveIncident');
    }
    this._state.resolve(this, summary);
  }

  public verifyResolution(employee: UserEntity): void {
    if (!employee.canVerifyResolution()) {
      throw new UnauthorizedOperationException(employee.role, 'verifyResolution');
    }
    this._state.verify(this);
  }

  public closeIncident(user: UserEntity, reason: string): void {
    if (!user.canCloseIncident()) {
      throw new UnauthorizedOperationException(user.role, 'closeIncident');
    }
    this._state.close(this, reason);
  }

  public addInvestigationNote(author: UserEntity, note: string): void {
    const formatted = `[${new Date().toLocaleTimeString()}] ${author.fullName} (${author.role.replace('ROLE_', '')}): ${note}`;
    this._investigationNotes.push(formatted);
    this.addAuditRecord({
      id: `AUD-${Date.now()}`,
      incidentId: this._id,
      timestamp: new Date().toISOString(),
      performedBy: author.fullName,
      action: 'ADD_INVESTIGATION_NOTE',
      previousState: this.status,
      newState: this.status,
      description: `Investigation note added: "${note.substring(0, 60)}${note.length > 60 ? '...' : ''}"`,
    });
  }

  public escalate(level: EscalationLevel, reason: string): void {
    this._escalationLevel = level;
    this.addAuditRecord({
      id: `AUD-${Date.now()}`,
      incidentId: this._id,
      timestamp: new Date().toISOString(),
      performedBy: 'SLA_EscalationDaemon',
      action: 'ESCALATE_INCIDENT',
      previousState: this.status,
      newState: this.status,
      description: `Escalated to ${level}: ${reason}`,
    });
  }

  public markSlaViolation(responseBreach: boolean, resolutionBreach: boolean): void {
    if (responseBreach) this._slaBreachedResponse = true;
    if (resolutionBreach) this._slaBreachedResolution = true;
  }

  public addAuditRecord(record: AuditRecord): void {
    this._auditTrail.unshift(record);
  }

  public toJSON(): Incident {
    return {
      id: this._id,
      title: this._title,
      description: this._description,
      reporterId: this._reporterId,
      reporterName: this._reporterName,
      categoryId: this._categoryId,
      categoryName: this._categoryName,
      serviceId: this._serviceId,
      serviceName: this._serviceName,
      impact: this._impact,
      urgency: this._urgency,
      businessCriticality: this._businessCriticality,
      affectedUsersCount: this._affectedUsersCount,
      priority: this._priority,
      status: this.status,
      createdAt: this._createdAt,
      assignedTechnicianId: this._assignedTechnicianId,
      assignedTechnicianName: this._assignedTechnicianName,
      acknowledgedAt: this._acknowledgedAt,
      resolvedAt: this._resolvedAt,
      closedAt: this._closedAt,
      responseDeadline: this._responseDeadline,
      resolutionDeadline: this._resolutionDeadline,
      slaBreachedResponse: this._slaBreachedResponse,
      slaBreachedResolution: this._slaBreachedResolution,
      escalationLevel: this._escalationLevel,
      investigationNotes: this._investigationNotes,
      resolutionSummary: this._resolutionSummary,
      closureReason: this._closureReason,
      auditTrail: this._auditTrail,
    };
  }

  public static fromJSON(raw: Incident): IncidentEntity {
    return new IncidentEntity(raw);
  }
}
