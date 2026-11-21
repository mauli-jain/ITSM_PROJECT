/**
 * OOP Domain Model: Exceptions
 */
export class ITSMException extends Error {
  constructor(message: string, public readonly code: string = 'ITSM_ERROR') {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidStateTransitionException extends ITSMException {
  constructor(
    public readonly fromState: string,
    public readonly toState: string,
    details?: string
  ) {
    super(
      `Invalid State Transition: Cannot transition from '${fromState}' to '${toState}'. ${details || ''}`.trim(),
      'INVALID_STATE_TRANSITION'
    );
  }
}

export class UnauthorizedOperationException extends ITSMException {
  constructor(
    public readonly userRole: string,
    public readonly operation: string
  ) {
    super(
      `Access Denied: Role '${userRole}' is not authorized to execute operation '${operation}'.`,
      'UNAUTHORIZED_OPERATION'
    );
  }
}

export class WorkloadOverflowException extends ITSMException {
  constructor(
    public readonly technicianId: string,
    public readonly currentCount: number,
    public readonly maxCapacity: number
  ) {
    super(
      `Workload Overflow: Technician '${technicianId}' is at capacity (${currentCount}/${maxCapacity}). Cannot assign additional incidents.`,
      'WORKLOAD_OVERFLOW'
    );
  }
}

export class EntityNotFoundException extends ITSMException {
  constructor(public readonly entityName: string, public readonly id: string) {
    super(`Entity '${entityName}' with ID '${id}' was not found.`, 'ENTITY_NOT_FOUND');
  }
}

export class ValidationException extends ITSMException {
  constructor(public readonly field: string, message: string) {
    super(`Validation failed on '${field}': ${message}`, 'VALIDATION_ERROR');
  }
}
