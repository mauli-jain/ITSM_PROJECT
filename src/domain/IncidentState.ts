import { IncidentStatus } from '../types/itsm';
import { InvalidStateTransitionException } from './Exceptions';
import { IncidentEntity } from './IncidentEntity';

/**
 * State Pattern Interface
 * Every state is encapsulated into its own dedicated class.
 */
export interface IncidentState {
  readonly status: IncidentStatus;
  readonly description: string;
  allowedTransitions(): IncidentStatus[];

  classify(context: IncidentEntity): void;
  assign(context: IncidentEntity, technicianId: string, technicianName: string): void;
  acknowledge(context: IncidentEntity): void;
  startProgress(context: IncidentEntity): void;
  requestInfo(context: IncidentEntity): void;
  resolve(context: IncidentEntity, summary: string): void;
  verify(context: IncidentEntity): void;
  close(context: IncidentEntity, closureReason: string): void;
}

/**
 * Base abstract state providing default guarded behavior (throws InvalidStateTransitionException)
 */
export abstract class BaseIncidentState implements IncidentState {
  public abstract readonly status: IncidentStatus;
  public abstract readonly description: string;
  public abstract allowedTransitions(): IncidentStatus[];

  protected illegalTransition(target: IncidentStatus): never {
    throw new InvalidStateTransitionException(
      this.status,
      target,
      `Permitted next states from '${this.status}' are: [${this.allowedTransitions().join(', ') || 'None (Terminal)'}]`
    );
  }

  public classify(_context: IncidentEntity): void {
    this.illegalTransition('CLASSIFIED');
  }

  public assign(_context: IncidentEntity, _technicianId: string, _technicianName: string): void {
    this.illegalTransition('ASSIGNED');
  }

  public acknowledge(_context: IncidentEntity): void {
    this.illegalTransition('ACKNOWLEDGED');
  }

  public startProgress(_context: IncidentEntity): void {
    this.illegalTransition('IN_PROGRESS');
  }

  public requestInfo(_context: IncidentEntity): void {
    this.illegalTransition('NEEDS_INFO');
  }

  public resolve(_context: IncidentEntity, _summary: string): void {
    this.illegalTransition('RESOLVED');
  }

  public verify(_context: IncidentEntity): void {
    this.illegalTransition('VERIFIED');
  }

  public close(_context: IncidentEntity, _closureReason: string): void {
    this.illegalTransition('CLOSED');
  }
}

/** 1. NEW STATE */
export class NewState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'NEW';
  public readonly description = 'Incident newly reported. Pending automated triage, classification or assignment.';

  public allowedTransitions(): IncidentStatus[] {
    return ['CLASSIFIED', 'ASSIGNED'];
  }

  public override classify(context: IncidentEntity): void {
    context.setState(new ClassifiedState());
  }

  public override assign(context: IncidentEntity, technicianId: string, technicianName: string): void {
    context.setAssignedTechnician(technicianId, technicianName);
    context.setState(new AssignedState());
  }
}

/** 2. CLASSIFIED STATE */
export class ClassifiedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'CLASSIFIED';
  public readonly description = 'Priority and impact assessed. Ready for technician dispatch.';

  public allowedTransitions(): IncidentStatus[] {
    return ['ASSIGNED'];
  }

  public override assign(context: IncidentEntity, technicianId: string, technicianName: string): void {
    context.setAssignedTechnician(technicianId, technicianName);
    context.setState(new AssignedState());
  }
}

/** 3. ASSIGNED STATE */
export class AssignedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'ASSIGNED';
  public readonly description = 'Dispatched to specialized technician. Awaiting initial technician response.';

  public allowedTransitions(): IncidentStatus[] {
    return ['ACKNOWLEDGED'];
  }

  public override acknowledge(context: IncidentEntity): void {
    context.recordAcknowledgement(new Date().toISOString());
    context.setState(new AcknowledgedState());
  }
}

/** 4. ACKNOWLEDGED STATE */
export class AcknowledgedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'ACKNOWLEDGED';
  public readonly description = 'Technician confirmed ticket receipt and commenced response.';

  public allowedTransitions(): IncidentStatus[] {
    return ['IN_PROGRESS', 'NEEDS_INFO'];
  }

  public override startProgress(context: IncidentEntity): void {
    context.setState(new InProgressState());
  }

  public override requestInfo(context: IncidentEntity): void {
    context.setState(new NeedsInfoState());
  }
}

/** 5. IN_PROGRESS STATE */
export class InProgressState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'IN_PROGRESS';
  public readonly description = 'Active diagnosis, debugging, remediation, or patch testing.';

  public allowedTransitions(): IncidentStatus[] {
    return ['NEEDS_INFO', 'RESOLVED'];
  }

  public override requestInfo(context: IncidentEntity): void {
    context.setState(new NeedsInfoState());
  }

  public override resolve(context: IncidentEntity, summary: string): void {
    context.recordResolution(summary, new Date().toISOString());
    context.setState(new ResolvedState());
  }
}

/** 6. NEEDS_INFO STATE */
export class NeedsInfoState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'NEEDS_INFO';
  public readonly description = 'Waiting on reporter diagnostic logs or clarification.';

  public allowedTransitions(): IncidentStatus[] {
    return ['IN_PROGRESS'];
  }

  public override startProgress(context: IncidentEntity): void {
    context.setState(new InProgressState());
  }
}

/** 7. RESOLVED STATE */
export class ResolvedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'RESOLVED';
  public readonly description = 'Fix applied. Awaiting employee verification or closure.';

  public allowedTransitions(): IncidentStatus[] {
    return ['VERIFIED', 'IN_PROGRESS'];
  }

  public override verify(context: IncidentEntity): void {
    context.setState(new VerifiedState());
  }

  public override startProgress(context: IncidentEntity): void {
    // Reopen incident if verification failed
    context.setState(new InProgressState());
  }
}

/** 8. VERIFIED STATE */
export class VerifiedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'VERIFIED';
  public readonly description = 'Reporter verified service restoration. Ready for formal administrative closure.';

  public allowedTransitions(): IncidentStatus[] {
    return ['CLOSED'];
  }

  public override close(context: IncidentEntity, closureReason: string): void {
    context.recordClosure(closureReason, new Date().toISOString());
    context.setState(new ClosedState());
  }
}

/** 9. CLOSED STATE (Terminal) */
export class ClosedState extends BaseIncidentState {
  public readonly status: IncidentStatus = 'CLOSED';
  public readonly description = 'Incident closed and audited. Terminal lifecycle state.';

  public allowedTransitions(): IncidentStatus[] {
    return [];
  }
}

/**
 * State Factory for rehydrating from stored status strings
 */
export class IncidentStateFactory {
  public static createState(status: IncidentStatus): IncidentState {
    switch (status) {
      case 'NEW':
        return new NewState();
      case 'CLASSIFIED':
        return new ClassifiedState();
      case 'ASSIGNED':
        return new AssignedState();
      case 'ACKNOWLEDGED':
        return new AcknowledgedState();
      case 'IN_PROGRESS':
        return new InProgressState();
      case 'NEEDS_INFO':
        return new NeedsInfoState();
      case 'RESOLVED':
        return new ResolvedState();
      case 'VERIFIED':
        return new VerifiedState();
      case 'CLOSED':
        return new ClosedState();
      default:
        return new NewState();
    }
  }
}
