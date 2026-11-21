import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import app, { resetLoginRateLimits, resetAiRateLimits, runSlaWatchdogPass, incidentRepo, userRepo } from '../src/server';
import { getSqliteDb, flushDatabaseToDisk } from '../src/db/sqlite';
import { detectDuplicates } from '../src/utils/intelligentEngines';
import { aiService, RuleBasedAIProvider } from '../src/services/GeminiService';

describe('I-ITSM Comprehensive API & Integration Test Suite (12+ Tests)', () => {
  let adminToken: string;
  let employeeToken: string;
  let technicianToken: string;
  let employeeId: string;

  beforeAll(async () => {
    // Ensure SQLite database tables and seed are loaded
    await getSqliteDb();

    // Login Admin (Mauli Jain)
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'mauli', password: 'admin123' });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.token;

    // Provision and login a test employee
    const employeeUsername = `testemployee${Date.now().toString().slice(-8)}`;
    const createEmployeeRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: employeeUsername,
        fullName: 'Test Employee',
        email: `${employeeUsername}@iitsm.corp`,
        role: 'ROLE_EMPLOYEE',
        password: 'password',
        department: 'Engineering',
      });
    expect([201, 422]).toContain(createEmployeeRes.status);
    employeeId = createEmployeeRes.body.id;

    const empRes = await request(app)
      .post('/api/auth/login')
      .send({ username: employeeUsername, password: 'password' });
    expect(empRes.status).toBe(200);
    employeeToken = empRes.body.token;
    if (!employeeId) employeeId = empRes.body.user.id;

    // Login Technician (Shambhavi Chaturvedi)
    const techRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'shambhavi', password: 'password' });
    expect(techRes.status).toBe(200);
    technicianToken = techRes.body.token;
  }, 30000);

  // --- 1. Authentication & Zod Validation Tests ---
  it('1. POST /api/auth/login rejects empty or missing credentials with 422', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: '', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
  });

  it('2. POST /api/auth/login rejects invalid password with 401 generic error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'mauli', password: 'wrong_password_999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    expect(res.body.token).toBeUndefined();
  });

  it('3. POST /api/auth/login issues valid signed JWT and omits passwordHash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'mauli', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.role).toBe('ROLE_ADMIN');
  });

  // --- 2. Route Guard & Token Verification Tests ---
  it('4. Unauthenticated access to /api/incidents returns 401 Unauthorized', async () => {
    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('5. Tampered or invalid Bearer token returns 401', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', 'Bearer invalid.forged.token');
    expect(res.status).toBe(401);
  });

  // --- 3. Role-Based Access Control (RBAC) Filtering Tests ---
  it('6. Employee sees only incidents reported by themselves in GET /api/incidents', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const inc of res.body) {
      expect(inc.reporterId).toBe(employeeId);
    }
  });

  it('7. Technician sees only incidents assigned to them in GET /api/incidents', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${technicianToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const inc of res.body) {
      expect(inc.assignedTechnicianId).toBe('T102');
    }
  });

  it('8. Administrator has unrestricted visibility across all incidents', async () => {
    const res = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // --- 4. Role Authorization Guards on Operations ---
  it('9. Employee is forbidden from assigning technicians (returns 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/incidents/INC1001/assign')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ strategyCode: 'SKILL_BASED' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('10. Employee is forbidden from closing incidents (returns 403 Forbidden)', async () => {
    const res = await request(app)
      .post('/api/incidents/INC1001/transition')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ targetState: 'CLOSED', note: 'Employee tries to close' });
    expect(res.status).toBe(403);
  });

  // --- 5. Server-Side State Machine & Transition Tests ---
  it('11. State Machine rejects illegal direct jump (NEW -> CLOSED) with 409 Conflict', async () => {
    // Create new incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New State Machine Test Ticket',
        description: 'Verifying illegal jump rejection',
        categoryId: 'CAT-DB',
        serviceId: 'SRV-DB',
        impact: 'LOW',
        urgency: 'LOW',
        businessCriticality: 'LOW',
        affectedUsersCount: 1,
      });
    expect(createRes.status).toBe(201);
    const incidentId = createRes.body.id;

    // Attempt illegal transition from NEW to CLOSED
    const jumpRes = await request(app)
      .post(`/api/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetState: 'CLOSED', note: 'Attempting illegal direct jump' });

    expect(jumpRes.status).toBe(409);
    expect(jumpRes.body.name).toBe('InvalidStateTransitionException');
  });

  it('12. Admin executes Strategy Pattern dispatch and advances incident to ASSIGNED', async () => {
    // Create new incident
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Network Gateway Intermittent Dropouts',
        description: 'VPN routing table corrupted',
        categoryId: 'CAT-NET',
        serviceId: 'SRV-VPN',
        impact: 'HIGH',
        urgency: 'HIGH',
        businessCriticality: 'HIGH',
        affectedUsersCount: 80,
      });
    expect(createRes.status).toBe(201);
    const incidentId = createRes.body.id;

    // Dispatch via Skill-Based strategy
    const assignRes = await request(app)
      .post(`/api/incidents/${incidentId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ strategyCode: 'SKILL_BASED' });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.incident.status).toBe('ASSIGNED');
    expect(assignRes.body.incident.assignedTechnicianId).toBeDefined();
    expect(assignRes.body.rationale).toBeDefined();
  });

  it('13. Valid lifecycle progression: ASSIGNED -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED', async () => {
    // Create incident and directly assign to T102
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'PostgreSQL deadlocks on billing partition',
        description: 'Locks blocking active transactions',
        categoryId: 'CAT-DB',
        serviceId: 'SRV-DB',
        impact: 'HIGH',
        urgency: 'HIGH',
        businessCriticality: 'HIGH',
        affectedUsersCount: 200,
      });
    const incidentId = createRes.body.id;

    await request(app)
      .post(`/api/incidents/${incidentId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ technicianId: 'T102' });

    // Technician acknowledges
    const ackRes = await request(app)
      .post(`/api/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ targetState: 'ACKNOWLEDGED' });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.status).toBe('ACKNOWLEDGED');

    // Technician starts progress
    const progRes = await request(app)
      .post(`/api/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ targetState: 'IN_PROGRESS' });
    expect(progRes.status).toBe(200);
    expect(progRes.body.status).toBe('IN_PROGRESS');

    // Technician resolves
    const resRes = await request(app)
      .post(`/api/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ targetState: 'RESOLVED', note: 'Terminated blocked transaction and rebuilt index' });
    expect(resRes.status).toBe(200);
    expect(resRes.body.status).toBe('RESOLVED');
  });

  // --- 6. Notes, Feedback & SSE Ticket Tests ---
  it('14. Adding investigation notes records timestamped entry in audit trail', async () => {
    const res = await request(app)
      .post('/api/incidents/INC1001/notes')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ note: 'Inspected port flaps on switch core-01' });

    expect(res.status).toBe(200);
    expect(res.body.investigationNotes.length).toBeGreaterThan(0);
  });

  it('15. Zod request validation returns 422 for malformed incident creation body', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'AB', // Less than 3 chars
        description: 'CD', // Less than 5 chars
        affectedUsersCount: -5, // Invalid negative integer
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toBeDefined();
  });

  it('16. POST /api/events/ticket generates a valid single-use SSE ticket', async () => {
    const res = await request(app)
      .post('/api/events/ticket')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket).toBeDefined();
    expect(typeof res.body.ticket).toBe('string');
  });

  // --- 7. Security Hardening & Rate Limiting Tests ---
  it('17. Rate Limiter blocks account after 5 failed login attempts with HTTP 429 and generic message', async () => {
    resetLoginRateLimits();
    const badCreds = { username: 'victim_user', password: 'incorrect_password' };

    // First 4 attempts return 401
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/login').send(badCreds);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    }

    // 5th attempt triggers lockout and returns 429
    const lockRes = await request(app).post('/api/auth/login').send(badCreds);
    expect(lockRes.status).toBe(429);
    expect(lockRes.body.error).toContain('Account temporarily locked');
    expect(lockRes.body.error).not.toContain('victim_user');

    // Subsequent attempt is blocked immediately by lockout
    const blockedRes = await request(app).post('/api/auth/login').send(badCreds);
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toContain('Account temporarily locked');
  });

  // --- 8. Least Privilege & Data Redaction Tests ---
  it('18. Role Least Privilege: GET /api/users and /api/technicians strip fields for employees and omit passwordHash for all', async () => {
    // Employee perspective
    const empUsersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empUsersRes.status).toBe(200);
    expect(empUsersRes.body.length).toBeGreaterThan(0);
    for (const u of empUsersRes.body) {
      expect(Object.keys(u).sort()).toEqual(['fullName', 'id']);
      expect(u.passwordHash).toBeUndefined();
      expect(u.email).toBeUndefined();
      expect(u.role).toBeUndefined();
    }

    const empTechsRes = await request(app)
      .get('/api/technicians')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(empTechsRes.status).toBe(200);
    for (const t of empTechsRes.body) {
      expect(Object.keys(t).sort()).toEqual(['fullName', 'id']);
      expect(t.passwordHash).toBeUndefined();
      expect(t.skills).toBeUndefined();
    }

    // Admin perspective
    const adminUsersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminUsersRes.status).toBe(200);
    for (const u of adminUsersRes.body) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.email).toBeDefined();
      expect(u.role).toBeDefined();
    }
  });

  // --- 9. SLA Policy Driven Deadlines & Watchdog Tests ---
  it('19. SLA deadlines computed correctly according to policy for priority tiers P1-P4', async () => {
    const priorities: Array<{ priority: 'P1' | 'P2' | 'P3' | 'P4'; respMin: number; resMin: number }> = [
      { priority: 'P1', respMin: 5, resMin: 30 },
      { priority: 'P2', respMin: 15, resMin: 120 },
      { priority: 'P3', respMin: 60, resMin: 480 },
      { priority: 'P4', respMin: 240, resMin: 1440 },
    ];

    for (const { priority, respMin, resMin } of priorities) {
      const beforeTime = Date.now();
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `SLA Computation Test ${priority}`,
          description: `Testing dynamic deadline for priority ${priority}`,
          categoryId: 'CAT-DB',
          serviceId: 'SRV-DB',
          impact: priority === 'P1' ? 'CRITICAL' : 'MEDIUM',
          urgency: priority === 'P1' ? 'HIGH' : 'MEDIUM',
          businessCriticality: 'MEDIUM',
          affectedUsersCount: 10,
          priority,
        });

      expect(res.status).toBe(201);
      const inc = res.body;
      const respDeadlineMs = new Date(inc.responseDeadline).getTime();
      const resDeadlineMs = new Date(inc.resolutionDeadline).getTime();

      const expectedResp = beforeTime + respMin * 60 * 1000;
      const expectedRes = beforeTime + resMin * 60 * 1000;

      expect(Math.abs(respDeadlineMs - expectedResp)).toBeLessThan(10000);
      expect(Math.abs(resDeadlineMs - expectedRes)).toBeLessThan(10000);
    }
  });

  it('20. SLA watchdog pass detects overdue deadlines, marks breach, and auto-escalates level', async () => {
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Overdue SLA Ticket for Watchdog',
        description: 'Response deadline breached intentionally',
        categoryId: 'CAT-NET',
        serviceId: 'SRV-VPN',
        impact: 'HIGH',
        urgency: 'HIGH',
        businessCriticality: 'HIGH',
        affectedUsersCount: 25,
        priority: 'P2',
      });
    const incidentId = createRes.body.id;

    // Fast-forward responseDeadline into the past
    const overdueDeadline = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stored = await incidentRepo.findById(incidentId);
    expect(stored).not.toBeNull();
    if (stored) {
      stored.responseDeadline = overdueDeadline;
      stored.status = 'ASSIGNED';
      stored.assignedTechnicianId = 'T102';
      stored.assignedTechnicianName = 'Mauli Jain';
      stored.escalationLevel = 'TECHNICIAN';
      stored.slaBreachedResponse = false;
      await incidentRepo.save(stored);
    }

    // Run SLA watchdog pass
    await runSlaWatchdogPass();

    // Verify breach flag and escalation
    const updated = await incidentRepo.findById(incidentId);
    expect(updated).not.toBeNull();
    expect(Boolean(updated?.slaBreachedResponse)).toBe(true);
    expect(updated?.escalationLevel).toBe('TEAM_LEAD');
  });

  // --- 10. Intelligent Duplicate Detection Tests ---
  it('21. Duplicate detection identifies correlated incidents with high token similarity', async () => {
    // 1. HTTP API route
    const dupRes = await request(app)
      .post('/api/incidents/detect-duplicates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'PostgreSQL connection timeout deadlock',
        description: 'PostgreSQL database pool deadlocks blocking active transactions',
        serviceId: 'SRV-DB',
      });

    expect(dupRes.status).toBe(200);
    expect(Array.isArray(dupRes.body)).toBe(true);
    expect(dupRes.body.length).toBeGreaterThan(0);
    expect(dupRes.body[0].similarityScore).toBeGreaterThan(20);
    expect(dupRes.body[0].sharedKeywords).toContain('postgresql');

    // 2. Direct unit/integration call with detectDuplicates
    const allIncidents = await incidentRepo.findAll();
    const directMatches = detectDuplicates(
      'VPN connection dropped repeatedly',
      'Corporate VPN routing table corrupted network disconnects',
      'SRV-VPN',
      allIncidents
    );
    expect(directMatches.length).toBeGreaterThan(0);
    expect(directMatches[0].incident.serviceId).toBe('SRV-VPN');
  });

  // --- 11. Strategy Pattern Assignment Tests Across All 4 Strategies ---
  it('22. Assignment through each of the four strategies via POST /api/incidents/:id/assign returns valid technicians', async () => {
    const strategies = ['SKILL_BASED', 'LOAD_BASED', 'ROUND_ROBIN', 'EXPERIENCE_BASED'] as const;

    for (const strat of strategies) {
      const incRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Dispatch Test for ${strat}`,
          description: 'Testing Strategy Pattern selection',
          categoryId: 'CAT-NET',
          serviceId: 'SRV-VPN',
          impact: 'MEDIUM',
          urgency: 'MEDIUM',
          businessCriticality: 'MEDIUM',
          affectedUsersCount: 15,
        });
      expect(incRes.status).toBe(201);
      const incId = incRes.body.id;

      const assignRes = await request(app)
        .post(`/api/incidents/${incId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ strategyCode: strat });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.incident.status).toBe('ASSIGNED');
      expect(assignRes.body.assignedTechnician).toBeDefined();
      expect(assignRes.body.assignedTechnician.id).toBeDefined();
      expect(assignRes.body.rationale).toBeDefined();
    }
  });

  // --- 12. Disk Storage Persistence Tests ---
  it('23. Disk persistence: data survives database re-instantiation directly from data/iitsm.db', async () => {
    const markerTitle = `Disk Persistence Check Marker ${Date.now()}`;
    const createRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: markerTitle,
        description: 'Verifying sql.js disk persistence and export',
        categoryId: 'CAT-DB',
        serviceId: 'SRV-DB',
        impact: 'LOW',
        urgency: 'LOW',
        businessCriticality: 'LOW',
        affectedUsersCount: 1,
      });
    expect(createRes.status).toBe(201);
    const incidentId = createRes.body.id;

    // Flush in-memory DB directly to data/iitsm.db
    flushDatabaseToDisk();

    // Verify disk file exists and is non-empty
    const dbPath = path.resolve(process.cwd(), 'data', 'iitsm.db');
    expect(fs.existsSync(dbPath)).toBe(true);
    const fileBytes = fs.readFileSync(dbPath);
    expect(fileBytes.length).toBeGreaterThan(1000);

    // Recreate a totally separate sql.js database instance directly from file bytes
    const SQL = await initSqlJs();
    const isolatedDb = new SQL.Database(fileBytes);

    const stmt = isolatedDb.prepare('SELECT id, title FROM incidents WHERE id = ?');
    stmt.bind([incidentId]);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as { id: string; title: string };
    expect(row.id).toBe(incidentId);
    expect(row.title).toBe(markerTitle);
    stmt.free();
    isolatedDb.close();
  });

  // --- 13. User and Admin Entity Zod Validation & Mass-Assignment Tests ---
  it('24. POST /api/users rejects invalid role with 422 Unprocessable Entity', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'invalid_role_user',
        fullName: 'Invalid Role',
        email: 'invalid@corp.com',
        role: 'SUPER_ADMIN', // Not in ['ROLE_EMPLOYEE', 'ROLE_TECHNICIAN', 'ROLE_ADMIN']
        password: 'password123',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details?.role).toBeDefined();
  });

  it('25. POST /api/users rejects password shorter than 8 characters with 422', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'short_pwd_user',
        fullName: 'Short Password',
        email: 'short@corp.com',
        role: 'ROLE_EMPLOYEE',
        password: 'short', // Less than 8 characters
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details?.password).toBeDefined();
  });

  it('26. POST /api/users ignores mass-assignment of passwordHash and id', async () => {
    const testUsername = `mass_assign_${Date.now().toString().slice(-4)}`;
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: testUsername,
        fullName: 'Mass Assignment Tester',
        email: `${testUsername}@corp.com`,
        role: 'ROLE_EMPLOYEE',
        password: 'strongPassword123',
        passwordHash: 'injected_evil_hash', // Mass assignment attempt
        id: 'INJECTED-FORGED-ID', // Mass assignment attempt
      });

    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe('INJECTED-FORGED-ID');
    expect(res.body.id.startsWith('EMP-')).toBe(true);
    expect(res.body.passwordHash).toBeUndefined();

    // Verify stored user in database has real bcrypt hash, not injected hash
    const stored = await userRepo.findByUsername(testUsername);
    expect(stored).not.toBeNull();
    expect(stored?.passwordHash).not.toBe('injected_evil_hash');
    expect(stored?.passwordHash?.startsWith('$2')).toBe(true);
  });

  it('27. Admin entity POST routes for services, categories, and SLA policies enforce Zod validation', async () => {
    // Malformed service
    const srvRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'S', // Less than 2 chars
        businessCriticality: 'ULTRA_CRITICAL', // Invalid enum
      });
    expect(srvRes.status).toBe(422);
    expect(srvRes.body.error).toBe('Validation failed');

    // Malformed SLA policy
    const slaRes = await request(app)
      .post('/api/sla-policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        priority: 'P9', // Invalid priority enum
        responseTargetMinutes: -10, // Invalid negative integer
      });
    expect(slaRes.status).toBe(422);
    expect(slaRes.body.error).toBe('Validation failed');
  });

  // --- 14. Server-Side AI Endpoints & Fallback Provider Tests ---
  it('28. POST /api/ai/suggest-category provides category suggestion with fallback provider', async () => {
    aiService.setProvider(new RuleBasedAIProvider());
    const res = await request(app)
      .post('/api/ai/suggest-category')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        description: 'PostgreSQL database connection pool deadlocks and transaction lock timeouts',
      });

    expect(res.status).toBe(200);
    expect(res.body.categoryId).toBeDefined();
    expect(res.body.categoryName).toBe('Database');
    expect(res.body.confidence).toBeGreaterThan(0.4);
    expect(res.body.rationale).toBeDefined();
  });

  it('29. POST /api/ai/suggest-resolution provides actionable remediation using resolved incident context', async () => {
    const res = await request(app)
      .post('/api/ai/suggest-resolution')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        description: 'Payment Gateway 504 gateway timeout customer card checkout',
      });

    expect(res.status).toBe(200);
    expect(res.body.suggestedResolution).toBeDefined();
    expect(typeof res.body.suggestedResolution).toBe('string');
    expect(res.body.confidence).toBeGreaterThan(0.5);
  });

  it('30. AI endpoints enforce per-user rate limit of 20 calls per minute returning 429', async () => {
    resetAiRateLimits();
    const payload = { description: 'Network switch port flaps on VLAN 10' };

    // 20 requests succeed
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/ai/suggest-category')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send(payload);
      expect(res.status).toBe(200);
    }

    // 21st request hits rate limit
    const limitedRes = await request(app)
      .post('/api/ai/suggest-category')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send(payload);

    expect(limitedRes.status).toBe(429);
    expect(limitedRes.body.error).toContain('AI rate limit exceeded');
  });

  it('31. POST /api/ai/suggest-resolution restricts access to ROLE_TECHNICIAN and ROLE_ADMIN (403 for employees)', async () => {
    // Attempt with employee token (must return 403 Forbidden)
    const empRes = await request(app)
      .post('/api/ai/suggest-resolution')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        description: 'Payment Gateway 504 gateway timeout customer card checkout',
      });
    expect(empRes.status).toBe(403);
    expect(empRes.body.error).toContain('Forbidden');

    // Attempt with admin token (must succeed with 200)
    const adminRes = await request(app)
      .post('/api/ai/suggest-resolution')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        description: 'Payment Gateway 504 gateway timeout customer card checkout',
      });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.suggestedResolution).toBeDefined();
  });
});


