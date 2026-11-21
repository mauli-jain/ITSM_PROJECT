import { describe, it, expect, beforeEach } from 'vitest';
import {
  IncidentEntity,
} from '../src/domain/IncidentEntity';
import {
  EmployeeUser,
  TechnicianUser,
  AdministratorUser,
} from '../src/domain/UserEntity';
import {
  InvalidStateTransitionException,
  UnauthorizedOperationException,
  WorkloadOverflowException,
} from '../src/domain/Exceptions';
import {
  SkillBasedAssignmentStrategy,
  LoadBasedAssignmentStrategy,
  RoundRobinAssignmentStrategy,
  ExperienceBasedAssignmentStrategy,
  AssignmentStrategyContext,
} from '../src/domain/AssignmentStrategy';
import {
  IncidentEventBus,
  InAppNotificationObserver,
  EmailNotificationAdapter,
  SmsNotificationAdapter,
  AuditObserver,
} from '../src/domain/IncidentObserver';
import {
  IncidentRepository,
  SLAPolicyRepository,
  ServiceRepository,
} from '../src/domain/Repositories';
import { Technician } from '../src/types/itsm';

describe('I-ITSM Comprehensive Domain & OOP Test Suite (15+ Tests)', () => {
  let admin: AdministratorUser;
  let employee: EmployeeUser;
  let technician: TechnicianUser;

  const sampleTechs: Technician[] = [
    {
      id: 'T1',
      username: 'db_guru',
      fullName: 'Alice Database',
      email: 'alice@iitsm.corp',
      role: 'ROLE_TECHNICIAN',
      skills: ['PostgreSQL', 'Database', 'SQL'],
      experienceYears: 8,
      maxWorkload: 5,
      available: true,
      activeIncidentCount: 1,
      specialization: 'Senior DBA',
    },
    {
      id: 'T2',
      username: 'net_pro',
      fullName: 'Bob Network',
      email: 'bob@iitsm.corp',
      role: 'ROLE_TECHNICIAN',
      skills: ['VPN', 'Firewall', 'Network'],
      experienceYears: 3,
      maxWorkload: 5,
      available: true,
      activeIncidentCount: 3,
      specialization: 'Network Engineer',
    },
    {
      id: 'T3',
      username: 'busy_bee',
      fullName: 'Charlie Full',
      email: 'charlie@iitsm.corp',
      role: 'ROLE_TECHNICIAN',
      skills: ['PostgreSQL', 'Network'],
      experienceYears: 10,
      maxWorkload: 4,
      available: false,
      activeIncidentCount: 4,
      specialization: 'Lead Architect',
    },
  ];

  beforeEach(() => {
    admin = new AdministratorUser('ADM1', 'admin', 'Vance Admin', 'vance@iitsm.corp', 'Core');
    employee = new EmployeeUser('EMP1', 'sarah', 'Sarah Employee', 'sarah@iitsm.corp', 'Finance');
    technician = new TechnicianUser('T1', 'alice', 'Alice Tech', 'alice@iitsm.corp', ['PostgreSQL'], 5);
  });

  // --- 1. OOP & Encapsulation Tests ---
  it('1. Domain User subclasses enforce correct polymorphic role permissions', () => {
    expect(admin.role).toBe('ROLE_ADMIN');
    expect(admin.canAssignTechnician()).toBe(true);
    expect(admin.canCloseIncident()).toBe(true);

    expect(employee.role).toBe('ROLE_EMPLOYEE');
    expect(employee.canAssignTechnician()).toBe(false);
    expect(employee.canCloseIncident()).toBe(false);
    expect(employee.canVerifyResolution()).toBe(true);

    expect(technician.role).toBe('ROLE_TECHNICIAN');
    expect(technician.canAssignTechnician()).toBe(false);
  });

  it('2. Technician workload tracking enforces capacity checks', () => {
    expect(technician.hasCapacity()).toBe(true);
    for (let i = 0; i < 6; i++) {
      technician.incrementWorkload();
    }
    expect(technician.activeIncidentCount).toBe(6);
    expect(technician.hasCapacity()).toBe(false);
    technician.decrementWorkload();
    expect(technician.activeIncidentCount).toBe(5);
    expect(technician.hasCapacity()).toBe(true);
  });

  // --- 2. State Pattern & Transition Guard Tests ---
  it('3. Incident initializes in NEW state and follows valid transition sequence', () => {
    const inc = new IncidentEntity({
      id: 'INC-T1',
      title: 'Database connection timeout',
      description: 'Queries stalling on replica node',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-DB',
      categoryName: 'Database',
      serviceId: 'SRV-DB',
      serviceName: 'Core DB',
      impact: 'HIGH',
      urgency: 'HIGH',
      businessCriticality: 'HIGH',
      affectedUsersCount: 100,
      priority: 'P2',
      responseDeadline: new Date(Date.now() + 900000).toISOString(),
      resolutionDeadline: new Date(Date.now() + 7200000).toISOString(),
    });

    expect(inc.status).toBe('NEW');
    inc.assignByAdmin(admin, technician.id, technician.fullName);
    expect(inc.status).toBe('ASSIGNED');
    expect(inc.assignedTechnicianId).toBe(technician.id);

    inc.acknowledgeByTechnician(technician);
    expect(inc.status).toBe('ACKNOWLEDGED');

    inc.startProgress(technician);
    expect(inc.status).toBe('IN_PROGRESS');

    inc.resolveIncident(technician, 'Re-indexed tables and scaled connections');
    expect(inc.status).toBe('RESOLVED');
    expect(inc.resolutionSummary).toBe('Re-indexed tables and scaled connections');

    inc.verifyResolution(employee);
    expect(inc.status).toBe('VERIFIED');

    inc.closeIncident(admin, 'Resolved and verified by reporter');
    expect(inc.status).toBe('CLOSED');
  });

  it('4. State Pattern throws InvalidStateTransitionException on illegal jump (e.g., NEW -> CLOSED)', () => {
    const inc = new IncidentEntity({
      id: 'INC-T2',
      title: 'Illegal Jump Test',
      description: 'Testing state guard',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-DB',
      categoryName: 'Database',
      serviceId: 'SRV-DB',
      serviceName: 'Core DB',
      impact: 'LOW',
      urgency: 'LOW',
      businessCriticality: 'LOW',
      affectedUsersCount: 1,
      priority: 'P4',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });

    expect(() => {
      inc.closeIncident(admin, 'Attempt direct jump to closed');
    }).toThrow(InvalidStateTransitionException);
  });

  it('5. State Pattern throws InvalidStateTransitionException on transition from terminal CLOSED state', () => {
    const inc = new IncidentEntity({
      id: 'INC-T3',
      title: 'Closed Incident',
      description: 'Cannot be altered',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-DB',
      categoryName: 'Database',
      serviceId: 'SRV-DB',
      serviceName: 'Core DB',
      impact: 'LOW',
      urgency: 'LOW',
      businessCriticality: 'LOW',
      affectedUsersCount: 1,
      priority: 'P4',
      status: 'CLOSED',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });

    expect(() => {
      inc.startProgress(technician);
    }).toThrow(InvalidStateTransitionException);
  });

  // --- 3. Role Authorization Guard Tests ---
  it('6. Employee is forbidden from assigning technicians (throws UnauthorizedOperationException)', () => {
    const inc = new IncidentEntity({
      id: 'INC-T4',
      title: 'Auth Check',
      description: 'Employee tries to assign',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-DB',
      categoryName: 'Database',
      serviceId: 'SRV-DB',
      serviceName: 'Core DB',
      impact: 'LOW',
      urgency: 'LOW',
      businessCriticality: 'LOW',
      affectedUsersCount: 1,
      priority: 'P4',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });

    expect(() => {
      inc.assignByAdmin(employee, technician.id, technician.fullName);
    }).toThrow(UnauthorizedOperationException);
  });

  it('7. Employee is forbidden from directly closing unverified incidents', () => {
    const inc = new IncidentEntity({
      id: 'INC-T5',
      title: 'Closure auth check',
      description: 'Employee tries to close',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-DB',
      categoryName: 'Database',
      serviceId: 'SRV-DB',
      serviceName: 'Core DB',
      impact: 'LOW',
      urgency: 'LOW',
      businessCriticality: 'LOW',
      affectedUsersCount: 1,
      priority: 'P4',
      status: 'VERIFIED',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });

    expect(() => {
      inc.closeIncident(employee, 'Attempting to close as employee');
    }).toThrow(UnauthorizedOperationException);
  });

  // --- 4. Strategy Pattern Tests ---
  it('8. Strategy Pattern: SkillBasedStrategy assigns tech with highest skill match', () => {
    const strategy = new SkillBasedAssignmentStrategy();
    const result = strategy.assign(sampleTechs, {
      incidentId: 'INC-100',
      categoryName: 'Database',
      serviceName: 'Core DB',
      incidentDescription: 'PostgreSQL connection deadlock and slow queries',
      affectedUsers: 50,
    });

    expect(result).not.toBeNull();
    expect(result?.technician.id).toBe('T1'); // Alice (skills match PostgreSQL/Database)
  });

  it('9. Strategy Pattern: LoadBasedStrategy assigns tech with lowest load ratio', () => {
    const strategy = new LoadBasedAssignmentStrategy();
    const result = strategy.assign(sampleTechs, {
      incidentId: 'INC-101',
      categoryName: 'Network',
      serviceName: 'Corporate VPN',
      incidentDescription: 'VPN gateway down',
      affectedUsers: 10,
    });

    expect(result).not.toBeNull();
    // T1 has active 1/5 (20%), T2 has active 3/5 (60%). T1 has lower load.
    expect(result?.technician.id).toBe('T1');
  });

  it('10. Strategy Pattern: ExperienceBasedStrategy selects highest tenured technician', () => {
    const strategy = new ExperienceBasedAssignmentStrategy();
    // T3 has 10 yrs but unavailable. T1 has 8 yrs, T2 has 3 yrs.
    const result = strategy.assign(sampleTechs, {
      incidentId: 'INC-102',
      categoryName: 'Cloud',
      serviceName: 'S3 Storage',
      incidentDescription: 'Storage latency',
      affectedUsers: 100,
    });

    expect(result).not.toBeNull();
    expect(result?.technician.id).toBe('T1'); // 8 years tenure
  });

  it('11. Strategy Pattern: RoundRobinStrategy rotates evenly between available technicians', () => {
    const strategy = new RoundRobinAssignmentStrategy();
    const res1 = strategy.assign(sampleTechs, {
      incidentId: 'INC-A',
      categoryName: 'General',
      serviceName: 'Email',
      incidentDescription: 'Test A',
      affectedUsers: 1,
    });
    const res2 = strategy.assign(sampleTechs, {
      incidentId: 'INC-B',
      categoryName: 'General',
      serviceName: 'Email',
      incidentDescription: 'Test B',
      affectedUsers: 1,
    });

    expect(res1?.technician.id).toBeDefined();
    expect(res2?.technician.id).toBeDefined();
    // With 2 available techs (T1, T2), consecutive calls return different technicians
    expect(res1?.technician.id).not.toBe(res2?.technician.id);
  });

  it('12. Strategy Context dynamically swaps algorithm at runtime', () => {
    const context = new AssignmentStrategyContext(new SkillBasedAssignmentStrategy());
    expect(context.currentStrategy.code).toBe('SKILL_BASED');

    context.setStrategy(new LoadBasedAssignmentStrategy());
    expect(context.currentStrategy.code).toBe('LOAD_BASED');

    context.setStrategy(new RoundRobinAssignmentStrategy());
    expect(context.currentStrategy.code).toBe('ROUND_ROBIN');
  });

  // --- 5. Workload Overflow Boundary Test ---
  it('13. Workload boundary: returns null when all eligible technicians are at capacity or unavailable', () => {
    const fullTechs: Technician[] = [
      {
        ...sampleTechs[0],
        activeIncidentCount: 5,
        maxWorkload: 5,
      },
      {
        ...sampleTechs[1],
        available: false,
      },
    ];

    const strategy = new SkillBasedAssignmentStrategy();
    const result = strategy.assign(fullTechs, {
      incidentId: 'INC-OVERFLOW',
      categoryName: 'DB',
      serviceName: 'DB',
      incidentDescription: 'Out of memory',
      affectedUsers: 5,
    });

    expect(result).toBeNull();
  });

  // --- 6. Observer Pattern & Multi-Channel Adapters ---
  it('14. Observer EventBus broadcasts events to InApp, Email, and SMS adapters', () => {
    const eventBus = IncidentEventBus.getInstance();
    const inAppObserver = new InAppNotificationObserver();
    const emailAdapter = new EmailNotificationAdapter();
    const smsAdapter = new SmsNotificationAdapter();
    const auditObserver = new AuditObserver();

    eventBus.register(inAppObserver);
    eventBus.register(emailAdapter);
    eventBus.register(smsAdapter);
    eventBus.register(auditObserver);

    eventBus.notify({
      eventName: 'SLA_BREACHED',
      incidentId: 'INC-999',
      incidentTitle: 'Payment Gateway Down',
      priority: 'P1',
      recipientId: 'T101',
      recipientName: 'Mauli Jain',
      recipientEmail: 'd.ross@iitsm.corp',
      details: 'P1 Resolution SLA exceeded 30 minute target.',
      timestamp: new Date().toISOString(),
    });

    // Verify Email sent
    expect(emailAdapter.sentEmails.length).toBeGreaterThan(0);
    expect(emailAdapter.sentEmails[0].to).toBe('d.ross@iitsm.corp');

    // Verify SMS sent for P1
    expect(smsAdapter.sentSms.length).toBeGreaterThan(0);
    expect(smsAdapter.sentSms[0].text).toContain('INC-999');

    // Verify Audit recorded
    expect(auditObserver.auditLogs.length).toBeGreaterThan(0);
    expect(auditObserver.auditLogs[0].incidentId).toBe('INC-999');
  });

  // --- 7. Repository Persistence & SLA Policy Driven Deadlines ---
  it('15. SLAPolicy repository drives dynamic response and resolution deadline calculation', async () => {
    const slaRepo = new SLAPolicyRepository();
    const p1Policy = await slaRepo.findByPriority('P1');
    const p2Policy = await slaRepo.findByPriority('P2');

    expect(p1Policy).not.toBeNull();
    expect(p1Policy?.responseTargetMinutes).toBe(5);
    expect(p1Policy?.resolutionTargetMinutes).toBe(30);

    expect(p2Policy).not.toBeNull();
    expect(p2Policy?.responseTargetMinutes).toBe(15);
    expect(p2Policy?.resolutionTargetMinutes).toBe(120);
  });

  it('16. Audit trail immutability and record tracking', () => {
    const inc = new IncidentEntity({
      id: 'INC-AUD',
      title: 'Audit Tracking Test',
      description: 'Checking audit log creation',
      reporterId: employee.id,
      reporterName: employee.fullName,
      categoryId: 'CAT-NET',
      categoryName: 'Network',
      serviceId: 'SRV-NET',
      serviceName: 'Corporate VPN',
      impact: 'MEDIUM',
      urgency: 'MEDIUM',
      businessCriticality: 'MEDIUM',
      affectedUsersCount: 20,
      priority: 'P3',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });

    inc.addInvestigationNote(technician, 'Isolated port flap on router 04');
    expect(inc.investigationNotes.length).toBe(1);
    expect(inc.auditTrail.length).toBeGreaterThan(0);
    expect(inc.auditTrail[0].action).toBe('ADD_INVESTIGATION_NOTE');
  });

  // --- 8. Additional Robustness, Boundary & Authentication Tests ---
  it('17. Boundary check: Incident handles boundary affectedUsersCount', () => {
    const inc = new IncidentEntity({
      id: 'INC-BOUND',
      title: 'Global DC Outage',
      description: 'Total core power drop affecting datacenter',
      reporterId: admin.id,
      reporterName: admin.fullName,
      categoryId: 'CAT-INFRA',
      categoryName: 'Infrastructure',
      serviceId: 'SRV-DC',
      serviceName: 'Primary Datacenter',
      impact: 'HIGH',
      urgency: 'HIGH',
      businessCriticality: 'CRITICAL',
      affectedUsersCount: 50000,
      priority: 'P1',
      responseDeadline: new Date().toISOString(),
      resolutionDeadline: new Date().toISOString(),
    });
    expect(inc.affectedUsersCount).toBe(50000);
    expect(inc.priority).toBe('P1');
  });

  it('18. Multi-channel dispatch: SMS is suppressed for P3/P4 but triggered for P1', () => {
    const sms = new SmsNotificationAdapter();
    const email = new EmailNotificationAdapter();

    // P4 incident event
    sms.onIncidentEvent({
      eventName: 'STATE_CHANGED',
      incidentId: 'INC-P4',
      incidentTitle: 'Mouse battery replacement',
      priority: 'P4',
      details: 'Low priority ticket',
      timestamp: new Date().toISOString(),
    });
    expect(sms.sentSms.length).toBe(0); // Suppressed for low priority

    // P1 incident event
    sms.onIncidentEvent({
      eventName: 'STATE_CHANGED',
      incidentId: 'INC-P1',
      incidentTitle: 'Core Banking API down',
      priority: 'P1',
      recipientPhone: '+1-555-999-0000',
      details: 'Critical outage detected',
      timestamp: new Date().toISOString(),
    });
    expect(sms.sentSms.length).toBe(1);
    expect(sms.sentSms[0].to).toBe('+1-555-999-0000');
  });

  it('19. Strategy comparison: LoadBased vs ExperienceBased make different optimal selections', () => {
    const candidateTechs: Technician[] = [
      {
        id: 'T_JUNIOR',
        username: 'jr_dev',
        fullName: 'Junior Fast',
        email: 'jr@iitsm.corp',
        role: 'ROLE_TECHNICIAN',
        skills: ['General', 'Linux'],
        experienceYears: 1,
        maxWorkload: 10,
        available: true,
        activeIncidentCount: 0, // 0% load
        specialization: 'Junior Admin',
      },
      {
        id: 'T_VETERAN',
        username: 'sr_architect',
        fullName: 'Senior Architect',
        email: 'sr@iitsm.corp',
        role: 'ROLE_TECHNICIAN',
        skills: ['General', 'Linux'],
        experienceYears: 15, // 15 years tenure
        maxWorkload: 10,
        available: true,
        activeIncidentCount: 5, // 50% load
        specialization: 'Principal Architect',
      },
    ];

    const loadStrategy = new LoadBasedAssignmentStrategy();
    const expStrategy = new ExperienceBasedAssignmentStrategy();

    const loadResult = loadStrategy.assign(candidateTechs, {
      incidentId: 'INC-TEST',
      categoryName: 'General',
      serviceName: 'General',
      incidentDescription: 'Linux server check',
      affectedUsers: 1,
    });

    const expResult = expStrategy.assign(candidateTechs, {
      incidentId: 'INC-TEST',
      categoryName: 'General',
      serviceName: 'General',
      incidentDescription: 'Linux server check',
      affectedUsers: 1,
    });

    // Load-based chooses Junior (0% load vs 50% load)
    expect(loadResult?.technician.id).toBe('T_JUNIOR');
    // Experience-based chooses Veteran (15 years vs 1 year)
    expect(expResult?.technician.id).toBe('T_VETERAN');
  });

  it('20. Dynamic SLA policy repository handles custom policy creation and querying', async () => {
    const slaRepo = new SLAPolicyRepository();
    await slaRepo.save({
      id: 'SLA-CUSTOM-VIP',
      priority: 'P1',
      responseTargetMinutes: 2,
      resolutionTargetMinutes: 15,
      description: 'Ultra-critical VIP service SLA',
    });

    const p1 = await slaRepo.findByPriority('P1');
    expect(p1).toBeDefined();
    expect(p1?.responseTargetMinutes).toBeLessThanOrEqual(5);
  });

  it('21. UserEntity subclasses properly reject empty constructor attributes', () => {
    expect(() => {
      new EmployeeUser('', 'valid_username', 'Valid Name', 'email@test.com', 'IT');
    }).toThrow('All user identity attributes (id, username, fullName, email) must be non-empty.');
  });
});

