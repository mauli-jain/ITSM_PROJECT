import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

dotenv.config();

import {
  SqliteIncidentRepository,
  SqliteUserRepository,
  SqliteServiceRepository,
  SqliteCategoryRepository,
  SqliteSLAPolicyRepository,
  SqliteFeedbackRepository,
  SqliteAuditRepository,
} from './domain/SqliteRepositories';
import { getSqliteDb, resetDatabase, runQuery } from './db/sqlite';
import { IncidentEntity } from './domain/IncidentEntity';
import {
  EmployeeUser,
  TechnicianUser,
  AdministratorUser,
  UserEntity,
} from './domain/UserEntity';
import { AssignmentStrategyContext } from './domain/AssignmentStrategy';
import {
  IncidentEventBus,
  InAppNotificationObserver,
  EmailNotificationAdapter,
  SmsNotificationAdapter,
  AuditObserver,
} from './domain/IncidentObserver';
import { InvalidStateTransitionException, UnauthorizedOperationException } from './domain/Exceptions';
import { Incident, Role, Employee, Technician, Administrator } from './types/itsm';
import { detectDuplicates } from './utils/intelligentEngines';
import { aiService } from './services/GeminiService';

// Fail fast if JWT_SECRET is missing or shorter than 32 characters (no fallback)
const rawSecret = process.env.JWT_SECRET;
if (!rawSecret || rawSecret.length < 32) {
  console.error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
  process.exit(1);
}
const JWT_SECRET: string = rawSecret;

// In-memory rate limiting map for login attempts (max 5 failed attempts per username+IP per 15m)
interface FailedLoginTracker {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}
export const loginRateLimitMap = new Map<string, FailedLoginTracker>();

export function resetLoginRateLimits(): void {
  loginRateLimitMap.clear();
}

// In-memory rate limiting map for AI endpoints (max 20 calls per user per minute)
interface AiRateTracker {
  count: number;
  windowStart: number;
}
export const aiRateLimitMap = new Map<string, AiRateTracker>();

export function resetAiRateLimits(): void {
  aiRateLimitMap.clear();
}

export function checkAiRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const current = aiRateLimitMap.get(userId);
  if (!current || now - current.windowStart > windowMs) {
    aiRateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (current.count >= 20) {
    return false;
  }
  current.count += 1;
  return true;
}

const app = express();
app.use(express.json());

// Basic security headers & CORS policy
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// SQLite Repository Singletons
export const incidentRepo = new SqliteIncidentRepository();
export const userRepo = new SqliteUserRepository();
export const serviceRepo = new SqliteServiceRepository();
export const categoryRepo = new SqliteCategoryRepository();
export const slaPolicyRepo = new SqliteSLAPolicyRepository();
export const feedbackRepo = new SqliteFeedbackRepository();
export const auditRepo = new SqliteAuditRepository();

// Initialize event bus & notification observers
export const eventBus = IncidentEventBus.getInstance();
export const inAppObserver = new InAppNotificationObserver();
export const emailAdapter = new EmailNotificationAdapter();
export const smsAdapter = new SmsNotificationAdapter();
export const auditObserver = new AuditObserver();

eventBus.register(inAppObserver);
eventBus.register(emailAdapter);
eventBus.register(smsAdapter);
eventBus.register(auditObserver);

// Type definition for JWT Auth payload
export interface AuthUserPayload {
  userId: string;
  username: string;
  role: Role;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

// Authentication middleware
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
    return;
  }

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as unknown as AuthUserPayload;
    // Roles may change across migrations; never trust stale JWT claims for authorization.
    const active = await userRepo.findById(decoded.userId);
    if (!active || active.role !== decoded.role || active.username !== decoded.username) {
      res.status(401).json({ error: 'Account updated. Please sign in again.' });
      return;
    }
    req.user = { userId: active.id, username: active.username, role: active.role, fullName: active.fullName };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Session token invalid or expired' });
  }
}

// Role Authorization middleware
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: `Forbidden: Operation requires one of [${allowedRoles.join(', ')}]. Current role: ${user?.role || 'ANONYMOUS'}`,
      });
    }
    next();
  };
}

// Validation middleware generator using Zod
function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    next();
  };
}

// Zod Request Schemas
const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const CreateIncidentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  categoryId: z.string().min(1, 'Category is required'),
  serviceId: z.string().min(1, 'Service is required'),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  businessCriticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  affectedUsersCount: z.number().int().min(1),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
});

const TransitionIncidentSchema = z.object({
  targetState: z.enum([
    'NEW',
    'CLASSIFIED',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'NEEDS_INFO',
    'RESOLVED',
    'VERIFIED',
    'CLOSED',
  ]),
  note: z.string().optional(),
});

const AddNoteSchema = z.object({
  note: z.string().min(1, 'Note content cannot be empty'),
});

const AssignIncidentSchema = z.object({
  strategyCode: z
    .enum(['SKILL_BASED', 'LOAD_BASED', 'ROUND_ROBIN', 'EXPERIENCE_BASED'])
    .optional(),
  technicianId: z.string().optional(),
});

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comments: z.string().optional(),
});

const CreateUserSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  role: z.enum(['ROLE_EMPLOYEE', 'ROLE_TECHNICIAN', 'ROLE_ADMIN']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  skills: z.array(z.string()).optional(),
  department: z.string().optional(),
  experienceYears: z.number().int().min(0).optional(),
  maxWorkload: z.number().int().min(1).optional(),
  available: z.boolean().optional(),
  specialization: z.string().optional(),
  managedDivision: z.string().optional(),
});

const ServiceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Service name must be at least 2 characters'),
  businessCriticality: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  ownerTeam: z.string().min(2, 'Owner team is required'),
  healthStatus: z.enum(['HEALTHY', 'DEGRADED', 'OUTAGE']),
});

const CategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Category name must be at least 2 characters'),
  description: z.string().min(3, 'Description is required'),
  keywords: z.array(z.string()).optional(),
});

const SLAPolicySchema = z.object({
  id: z.string().optional(),
  priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  responseTargetMinutes: z.number().int().positive('Response target minutes must be a positive integer'),
  resolutionTargetMinutes: z.number().int().positive('Resolution target minutes must be a positive integer'),
  description: z.string().min(3, 'Description is required'),
});

const SuggestCategorySchema = z.object({
  description: z.string().min(3, 'Description must be at least 3 characters'),
});

const SuggestResolutionSchema = z.object({
  description: z.string().min(3, 'Description must be at least 3 characters'),
  incidentId: z.string().optional(),
});

// ==================== AUTH API ====================
app.post('/api/auth/login', validateBody(LoginSchema), async (req: Request, res: Response) => {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  const cleanUsername = req.body.username.toLowerCase().trim();
  const rateLimitKey = `${ip}:${cleanUsername}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;

  const existing = loginRateLimitMap.get(rateLimitKey);
  if (existing && existing.lockedUntil && existing.lockedUntil > now) {
    return res.status(429).json({
      error: 'Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
    });
  }

  // Clean expired window
  if (existing && now - existing.firstAttemptAt > windowMs) {
    loginRateLimitMap.delete(rateLimitKey);
  }

  const { username, password } = req.body;
  const user = await userRepo.findByUsername(username);

  const isInvalid = !user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash);

  if (isInvalid) {
    const current = loginRateLimitMap.get(rateLimitKey) || { attempts: 0, firstAttemptAt: now };
    current.attempts += 1;
    if (current.attempts >= 5) {
      current.lockedUntil = now + windowMs;
      loginRateLimitMap.set(rateLimitKey, current);
      return res.status(429).json({
        error: 'Account temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
      });
    }
    loginRateLimitMap.set(rateLimitKey, current);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Successful login clears failed attempt records
  loginRateLimitMap.delete(rateLimitKey);

  const payload: AuthUserPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  const { passwordHash, ...safeUser } = user;

  return res.json({ token, user: safeUser });
});

app.post('/api/auth/logout', authenticate, (_req: Request, res: Response) => {
  return res.json({ message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticate, async (req: Request, res: Response) => {
  const user = await userRepo.findById(req.user!.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash, ...safeUser } = user;
  return res.json({ user: safeUser });
});

// ==================== INCIDENTS API ====================
// Role-based filtering on GET /api/incidents
app.get('/api/incidents', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const all = await incidentRepo.findAll();

  if (user.role === 'ROLE_EMPLOYEE') {
    return res.json(all.filter((i) => i.reporterId === user.userId));
  }
  if (user.role === 'ROLE_TECHNICIAN') {
    return res.json(all.filter((i) => i.assignedTechnicianId === user.userId));
  }
  // ROLE_ADMIN sees all
  return res.json(all);
});

app.get('/api/incidents/:id', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const incident = await incidentRepo.findById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  if (user.role === 'ROLE_EMPLOYEE' && incident.reporterId !== user.userId) {
    return res.status(403).json({ error: 'Forbidden: You can only view your own reported incidents' });
  }
  if (user.role === 'ROLE_TECHNICIAN' && incident.assignedTechnicianId !== user.userId) {
    return res.status(403).json({ error: 'Forbidden: You can only view incidents assigned to you' });
  }

  return res.json(incident);
});

// Detect duplicate incidents via Jaccard token similarity
app.post('/api/incidents/detect-duplicates', authenticate, async (req: Request, res: Response) => {
  const { title = '', description = '', serviceId = '' } = req.body || {};
  const existing = await incidentRepo.findAll();
  const matches = detectDuplicates(title, description, serviceId, existing);
  return res.json(matches);
});

// Create Incident
app.post(
  '/api/incidents',
  authenticate,
  requireRole(['ROLE_EMPLOYEE', 'ROLE_TECHNICIAN', 'ROLE_ADMIN']),
  validateBody(CreateIncidentSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const category = await categoryRepo.findById(req.body.categoryId);
      const service = await serviceRepo.findById(req.body.serviceId);

      const categoryName = category?.name || 'General';
      const serviceName = service?.name || 'General Support';

      // Compute SLA Deadlines based on SLA Policy
      const priority = req.body.priority || 'P3';
      const policy = (await slaPolicyRepo.findByPriority(priority)) || {
        responseTargetMinutes: 60,
        resolutionTargetMinutes: 240,
      };

      const now = Date.now();
      const responseDeadline = new Date(now + policy.responseTargetMinutes * 60 * 1000).toISOString();
      const resolutionDeadline = new Date(now + policy.resolutionTargetMinutes * 60 * 1000).toISOString();

      const newId = `INC-${Date.now().toString().slice(-6)}`;
      const entity = new IncidentEntity({
        id: newId,
        title: req.body.title,
        description: req.body.description,
        reporterId: user.userId,
        reporterName: user.fullName,
        categoryId: req.body.categoryId,
        categoryName,
        serviceId: req.body.serviceId,
        serviceName,
        impact: req.body.impact,
        urgency: req.body.urgency,
        businessCriticality: req.body.businessCriticality,
        affectedUsersCount: req.body.affectedUsersCount,
        priority,
        status: 'NEW',
        responseDeadline,
        resolutionDeadline,
      });

      const saved = await incidentRepo.save(entity.toJSON());

      eventBus.notify({
        eventName: 'INCIDENT_CREATED',
        incidentId: entity.id,
        incidentTitle: entity.title,
        newState: entity.status,
        priority: entity.priority,
        details: `Incident reported by ${user.fullName} (${user.role})`,
        timestamp: new Date().toISOString(),
      });

      return res.status(201).json(saved);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// State Machine Transition Endpoint (Replaces generic PUT)
app.post(
  '/api/incidents/:id/transition',
  authenticate,
  validateBody(TransitionIncidentSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const incidentData = await incidentRepo.findById(req.params.id);
      if (!incidentData) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const entity = IncidentEntity.fromJSON(incidentData);
      const { targetState, note } = req.body;

      // Load the acting user from the repository by token userId
      const actingUserRecord = await userRepo.findById(user.userId);
      if (!actingUserRecord) {
        return res.status(404).json({ error: 'Acting user account not found in directory' });
      }

      let domainActor: UserEntity;
      if (actingUserRecord.role === 'ROLE_ADMIN') {
        const admin = actingUserRecord as Administrator;
        domainActor = new AdministratorUser(
          admin.id,
          admin.username,
          admin.fullName,
          admin.email,
          admin.managedDivision || 'Global IT Operations'
        );
      } else if (actingUserRecord.role === 'ROLE_TECHNICIAN') {
        const tech = actingUserRecord as Technician;
        domainActor = new TechnicianUser(
          tech.id,
          tech.username,
          tech.fullName,
          tech.email,
          tech.skills || [],
          tech.experienceYears ?? 4,
          tech.maxWorkload ?? 6,
          tech.available ?? true,
          tech.activeIncidentCount ?? 0,
          tech.specialization || 'Technical Support'
        );
      } else {
        const emp = actingUserRecord as Employee;
        domainActor = new EmployeeUser(
          emp.id,
          emp.username,
          emp.fullName,
          emp.email,
          emp.department || 'Corporate Operations'
        );
      }

      // Check role authorization for specific state transitions
      switch (targetState) {
        case 'ACKNOWLEDGED':
          if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only assigned technician or admin can acknowledge' });
          }
          if (user.role === 'ROLE_TECHNICIAN' && entity.assignedTechnicianId !== user.userId) {
            return res.status(403).json({ error: 'Forbidden: Only the assigned technician can acknowledge this incident' });
          }
          entity.acknowledgeByTechnician(domainActor as TechnicianUser);
          break;

        case 'IN_PROGRESS':
          if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only assigned technician or admin can start progress' });
          }
          if (user.role === 'ROLE_TECHNICIAN' && entity.assignedTechnicianId !== user.userId) {
            return res.status(403).json({ error: 'Forbidden: Only the assigned technician can advance progress' });
          }
          entity.startProgress(domainActor as TechnicianUser);
          break;

        case 'NEEDS_INFO':
          if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only assigned technician or admin can request info' });
          }
          entity.requestInfo(domainActor as TechnicianUser, note || 'Additional diagnostic details requested from reporter');
          break;

        case 'RESOLVED':
          if (user.role !== 'ROLE_TECHNICIAN' && user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only assigned technician or admin can resolve incident' });
          }
          if (user.role === 'ROLE_TECHNICIAN' && entity.assignedTechnicianId !== user.userId) {
            return res.status(403).json({ error: 'Forbidden: Only the assigned technician can mark as resolved' });
          }
          entity.resolveIncident(domainActor as TechnicianUser, note || 'Incident successfully resolved by technical operator.');
          break;

        case 'VERIFIED':
          if (user.role !== 'ROLE_EMPLOYEE' && user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only the reporter or administrator can verify resolution' });
          }
          if (user.role === 'ROLE_EMPLOYEE' && entity.reporterId !== user.userId) {
            return res.status(403).json({ error: 'Forbidden: Only the reporter can verify this incident resolution' });
          }
          entity.verifyResolution(domainActor as EmployeeUser);
          break;

        case 'CLOSED':
          if (user.role !== 'ROLE_ADMIN') {
            return res.status(403).json({ error: 'Forbidden: Only administrators can close incidents' });
          }
          entity.closeIncident(domainActor as AdministratorUser, note || 'Incident closed following verification.');
          break;

        default:
          return res.status(400).json({ error: `Unsupported direct state transition target: ${targetState}` });
      }

      const updated = await incidentRepo.save(entity.toJSON());

      eventBus.notify({
        eventName: 'STATE_CHANGED',
        incidentId: entity.id,
        incidentTitle: entity.title,
        newState: entity.status,
        priority: entity.priority,
        details: note || `State transitioned to ${targetState} by ${user.fullName}`,
        timestamp: new Date().toISOString(),
      });

      return res.json(updated);
    } catch (err: any) {
      if (err instanceof InvalidStateTransitionException) {
        return res.status(409).json({
          error: err.message,
          name: 'InvalidStateTransitionException',
        });
      }
      if (err instanceof UnauthorizedOperationException) {
        return res.status(403).json({
          error: err.message,
          name: 'UnauthorizedOperationException',
        });
      }
      return res.status(400).json({ error: err.message || 'State transition error' });
    }
  }
);

// Add Investigation Note
app.post(
  '/api/incidents/:id/notes',
  authenticate,
  validateBody(AddNoteSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const incidentData = await incidentRepo.findById(req.params.id);
      if (!incidentData) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const entity = IncidentEntity.fromJSON(incidentData);
      const actingUserRecord = await userRepo.findById(user.userId);
      if (!actingUserRecord) {
        return res.status(404).json({ error: 'Acting user account not found in directory' });
      }

      let actor: UserEntity;
      if (actingUserRecord.role === 'ROLE_ADMIN') {
        const admin = actingUserRecord as Administrator;
        actor = new AdministratorUser(
          admin.id,
          admin.username,
          admin.fullName,
          admin.email,
          admin.managedDivision || 'Global IT Operations'
        );
      } else if (actingUserRecord.role === 'ROLE_TECHNICIAN') {
        const tech = actingUserRecord as Technician;
        actor = new TechnicianUser(
          tech.id,
          tech.username,
          tech.fullName,
          tech.email,
          tech.skills || [],
          tech.experienceYears ?? 4,
          tech.maxWorkload ?? 6,
          tech.available ?? true,
          tech.activeIncidentCount ?? 0,
          tech.specialization || 'Technical Support'
        );
      } else {
        const emp = actingUserRecord as Employee;
        actor = new EmployeeUser(
          emp.id,
          emp.username,
          emp.fullName,
          emp.email,
          emp.department || 'Corporate Operations'
        );
      }

      entity.addInvestigationNote(actor, req.body.note);
      const saved = await incidentRepo.save(entity.toJSON());

      return res.json(saved);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// Assign Incident (Strategy Pattern)
app.post(
  '/api/incidents/:id/assign',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(AssignIncidentSchema),
  async (req: Request, res: Response) => {
    try {
      const adminPayload = req.user!;
      const { strategyCode, technicianId } = req.body;
      const incident = await incidentRepo.findById(req.params.id);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      const allUsers = await userRepo.findAll();
      const technicians = allUsers.filter((u): u is any => u.role === 'ROLE_TECHNICIAN');

      let assignedTech: any = null;
      let rationale = '';

      if (technicianId) {
        assignedTech = technicians.find((t) => t.id === technicianId);
        if (!assignedTech) {
          return res.status(400).json({ error: `Technician with ID ${technicianId} not found` });
        }
        rationale = 'Manual administrative direct assignment';
      } else {
        const strategy = AssignmentStrategyContext.createFromCode(strategyCode || 'SKILL_BASED');
        const dispatcher = new AssignmentStrategyContext(strategy);

        const result = dispatcher.execute(technicians, {
          incidentId: incident.id,
          categoryName: incident.categoryName,
          serviceName: incident.serviceName,
          incidentDescription: incident.description,
          affectedUsers: incident.affectedUsersCount,
        });

        if (!result) {
          return res.status(400).json({ error: 'No available technicians within capacity limits.' });
        }
        assignedTech = result.technician;
        rationale = `${result.strategyUsed}: ${result.rationale}`;
      }

      const entity = IncidentEntity.fromJSON(incident);
      // Domain admin user loaded from repository by token userId
      const adminRecord = await userRepo.findById(adminPayload.userId);
      const adminEmail = adminRecord?.email || `${adminPayload.username}@iitsm.corp`;
      const adminDivision = (adminRecord as Administrator)?.managedDivision || 'Global IT Operations';
      const domainAdmin = new AdministratorUser(
        adminPayload.userId,
        adminPayload.username,
        adminPayload.fullName,
        adminEmail,
        adminDivision
      );

      entity.assignByAdmin(domainAdmin, assignedTech.id, assignedTech.fullName);
      const saved = await incidentRepo.save(entity.toJSON());

      eventBus.notify({
        eventName: 'TECHNICIAN_ASSIGNED',
        incidentId: entity.id,
        incidentTitle: entity.title,
        newState: 'ASSIGNED',
        recipientId: assignedTech.id,
        recipientName: assignedTech.fullName,
        recipientEmail: assignedTech.email,
        priority: entity.priority,
        details: rationale,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        incident: saved,
        assignedTechnician: assignedTech,
        rationale,
      });
    } catch (err: any) {
      if (err instanceof InvalidStateTransitionException) {
        return res.status(409).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
  }
);

// Feedback Endpoint
app.post(
  '/api/incidents/:id/feedback',
  authenticate,
  requireRole(['ROLE_EMPLOYEE', 'ROLE_ADMIN']),
  validateBody(FeedbackSchema),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const incident = await incidentRepo.findById(req.params.id);
      if (!incident) {
        return res.status(404).json({ error: 'Incident not found' });
      }

      if (user.role === 'ROLE_EMPLOYEE' && incident.reporterId !== user.userId) {
        return res.status(403).json({ error: 'Forbidden: You can only submit feedback for your own incidents' });
      }

      const feedbackRecord = {
        id: `FB-${Date.now().toString().slice(-6)}`,
        incidentId: incident.id,
        employeeId: user.userId,
        rating: req.body.rating,
        comments: req.body.comments || '',
        createdAt: new Date().toISOString(),
      };

      await feedbackRepo.save(feedbackRecord);
      return res.status(201).json(feedbackRecord);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
);

// ==================== LIVE NOTIFICATIONS SSE API (Phase 6) ====================
// Short-lived tickets for SSE connection
const sseTickets = new Map<string, { userId: string; expiresAt: number }>();

app.post('/api/events/ticket', authenticate, (req: Request, res: Response) => {
  const ticket = crypto.randomUUID();
  sseTickets.set(ticket, {
    userId: req.user!.userId,
    expiresAt: Date.now() + 60 * 1000, // 60s ticket
  });
  return res.json({ ticket });
});

app.get('/api/events', (req: Request, res: Response) => {
  const ticket = req.query.ticket as string;
  if (!ticket || !sseTickets.has(ticket)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired event stream ticket' });
  }

  const session = sseTickets.get(ticket)!;
  if (Date.now() > session.expiresAt) {
    sseTickets.delete(ticket);
    return res.status(401).json({ error: 'Unauthorized: Ticket expired' });
  }
  // Single use ticket
  sseTickets.delete(ticket);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Initial connection heartbeat
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  // Event listener
  const listener = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  eventBus.on('ALL', listener);

  req.on('close', () => {
    eventBus.off('ALL', listener);
    res.end();
  });
});

// ==================== ADMIN ENTITY MANAGEMENT ====================
app.get('/api/services', authenticate, async (_req, res) => res.json(await serviceRepo.findAll()));
app.post(
  '/api/services',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(ServiceSchema),
  async (req: Request, res: Response) => {
    const serviceToSave = {
      ...req.body,
      id: req.body.id || `SRV-${Date.now().toString().slice(-6)}`,
    };
    const saved = await serviceRepo.save(serviceToSave);
    res.status(201).json(saved);
  }
);
app.put(
  '/api/services/:id',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(ServiceSchema),
  async (req: Request, res: Response) => {
    const serviceToSave = { ...req.body, id: req.params.id };
    const saved = await serviceRepo.save(serviceToSave);
    res.json(saved);
  }
);
app.delete('/api/services/:id', authenticate, requireRole(['ROLE_ADMIN']), async (req, res) => {
  await serviceRepo.deleteById(req.params.id);
  res.json({ success: true });
});

app.get('/api/categories', authenticate, async (_req, res) => res.json(await categoryRepo.findAll()));
app.post(
  '/api/categories',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(CategorySchema),
  async (req: Request, res: Response) => {
    const catToSave = {
      ...req.body,
      id: req.body.id || `CAT-${Date.now().toString().slice(-6)}`,
      keywords: req.body.keywords || [],
    };
    const saved = await categoryRepo.save(catToSave);
    res.status(201).json(saved);
  }
);
app.put(
  '/api/categories/:id',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(CategorySchema),
  async (req: Request, res: Response) => {
    const catToSave = { ...req.body, id: req.params.id, keywords: req.body.keywords || [] };
    const saved = await categoryRepo.save(catToSave);
    res.json(saved);
  }
);
app.delete('/api/categories/:id', authenticate, requireRole(['ROLE_ADMIN']), async (req, res) => {
  await categoryRepo.deleteById(req.params.id);
  res.json({ success: true });
});

app.get('/api/sla-policies', authenticate, async (_req, res) => res.json(await slaPolicyRepo.findAll()));
app.post(
  '/api/sla-policies',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(SLAPolicySchema),
  async (req: Request, res: Response) => {
    const policyToSave = {
      ...req.body,
      id: req.body.id || `SLA-${req.body.priority}`,
    };
    const saved = await slaPolicyRepo.save(policyToSave);
    res.status(201).json(saved);
  }
);
app.put(
  '/api/sla-policies/:id',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(SLAPolicySchema),
  async (req: Request, res: Response) => {
    const policyToSave = { ...req.body, id: req.params.id };
    const saved = await slaPolicyRepo.save(policyToSave);
    res.json(saved);
  }
);
app.delete('/api/sla-policies/:id', authenticate, requireRole(['ROLE_ADMIN']), async (req, res) => {
  await slaPolicyRepo.deleteById(req.params.id);
  res.json({ success: true });
});

app.get('/api/technicians', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const all = await userRepo.findAll();
  const techs = all.filter((u): u is any => u.role === 'ROLE_TECHNICIAN');

  if (user.role === 'ROLE_EMPLOYEE') {
    // Least privilege: Employees get id and name of technicians only
    return res.json(techs.map((t) => ({ id: t.id, fullName: t.fullName })));
  }

  return res.json(techs.map(({ passwordHash, ...safe }) => safe));
});

app.get('/api/users', authenticate, async (req: Request, res: Response) => {
  const user = req.user!;
  const users = await userRepo.findAll();

  if (user.role === 'ROLE_EMPLOYEE') {
    // Least privilege: Employees get id and name only
    return res.json(users.map((u) => ({ id: u.id, fullName: u.fullName })));
  }

  return res.json(users.map(({ passwordHash, ...safe }) => safe));
});

app.post(
  '/api/users',
  authenticate,
  requireRole(['ROLE_ADMIN']),
  validateBody(CreateUserSchema),
  async (req: Request, res: Response) => {
    const raw = req.body;
    // Server-enforced ID generation and password hashing; ignores client id or passwordHash
    const idPrefix = raw.role === 'ROLE_TECHNICIAN' ? 'T' : raw.role === 'ROLE_EMPLOYEE' ? 'EMP' : 'ADMIN';
    const id = `${idPrefix}-${Date.now().toString().slice(-6)}`;
    const passwordHash = bcrypt.hashSync(raw.password, 10);

    const userToSave: any = {
      id,
      username: raw.username,
      passwordHash,
      fullName: raw.fullName,
      email: raw.email,
      role: raw.role,
      department: raw.department || null,
      skills: raw.skills || [],
      experienceYears: raw.experienceYears ?? 0,
      maxWorkload: raw.maxWorkload ?? 5,
      available: raw.available ?? true,
      activeIncidentCount: 0,
      specialization: raw.specialization || null,
      managedDivision: raw.managedDivision || null,
    };

    const saved = await userRepo.save(userToSave);
    const { passwordHash: _ph, ...safe } = saved;
    return res.status(201).json(safe);
  }
);

app.delete('/api/users/:id', authenticate, requireRole(['ROLE_ADMIN']), async (req, res) => {
  await userRepo.deleteById(req.params.id);
  res.json({ success: true });
});

// ==================== AI CAPABILITIES API (Gemini with Fallback) ====================
app.post(
  '/api/ai/suggest-category',
  authenticate,
  validateBody(SuggestCategorySchema),
  async (req: Request, res: Response) => {
    const user = req.user!;
    if (!checkAiRateLimit(user.userId)) {
      return res.status(429).json({ error: 'AI rate limit exceeded (maximum 20 calls per minute)' });
    }
    const categories = await categoryRepo.findAll();
    const result = await aiService.suggestCategory(req.body.description, categories);
    return res.json(result);
  }
);

app.post(
  '/api/ai/suggest-resolution',
  authenticate,
  requireRole(['ROLE_TECHNICIAN', 'ROLE_ADMIN']),
  validateBody(SuggestResolutionSchema),
  async (req: Request, res: Response) => {
    const user = req.user!;
    if (!checkAiRateLimit(user.userId)) {
      return res.status(429).json({ error: 'AI rate limit exceeded (maximum 20 calls per minute)' });
    }
    const allIncidents = await incidentRepo.findAll();
    const resolvedIncidents = allIncidents.filter(
      (i) => (i.status === 'RESOLVED' || i.status === 'VERIFIED' || i.status === 'CLOSED') && Boolean(i.resolutionSummary)
    );
    const result = await aiService.suggestResolution(req.body.description, resolvedIncidents);
    return res.json(result);
  }
);

app.get('/api/audit-logs', authenticate, requireRole(['ROLE_ADMIN']), async (_req, res) => {
  res.json(await auditRepo.findAll());
});

// Database reset endpoint for evaluators and testing
app.post('/api/admin/reset-database', authenticate, requireRole(['ROLE_ADMIN']), async (_req, res) => {
  resetDatabase();
  res.json({ message: 'Database reset to canonical seed state successfully.' });
});

// ==================== SLA WATCHDOG BACKGROUND DAEMON (Phase 3) ====================
export async function runSlaWatchdogPass(): Promise<void> {
  try {
    const incidents = await incidentRepo.findAll();
    const now = Date.now();

    for (const inc of incidents) {
      if (['RESOLVED', 'VERIFIED', 'CLOSED'].includes(inc.status)) {
        continue;
      }

      let modified = false;
      const respDeadline = new Date(inc.responseDeadline).getTime();
      const resDeadline = new Date(inc.resolutionDeadline).getTime();

      // Check Response SLA breach (if not acknowledged yet)
      if (!inc.acknowledgedAt && now > respDeadline && !inc.slaBreachedResponse) {
        inc.slaBreachedResponse = true;
        modified = true;

        // Escalate level
        if (inc.escalationLevel === 'TECHNICIAN') inc.escalationLevel = 'TEAM_LEAD';
        else if (inc.escalationLevel === 'TEAM_LEAD') inc.escalationLevel = 'SYSTEM_ADMIN';
        else if (inc.escalationLevel === 'SYSTEM_ADMIN') inc.escalationLevel = 'IT_MANAGER';

        eventBus.notify({
          eventName: 'SLA_BREACHED',
          incidentId: inc.id,
          incidentTitle: inc.title,
          priority: inc.priority,
          recipientId: inc.assignedTechnicianId,
          recipientName: inc.assignedTechnicianName,
          details: `Response SLA target breached. Auto-escalated to ${inc.escalationLevel}.`,
          timestamp: new Date().toISOString(),
        });
      }

      // Check Resolution SLA breach
      if (now > resDeadline && !inc.slaBreachedResolution) {
        inc.slaBreachedResolution = true;
        modified = true;

        if (inc.escalationLevel !== 'IT_MANAGER') {
          inc.escalationLevel = 'IT_MANAGER';
        }

        eventBus.notify({
          eventName: 'SLA_BREACHED',
          incidentId: inc.id,
          incidentTitle: inc.title,
          priority: inc.priority,
          recipientId: inc.assignedTechnicianId,
          recipientName: inc.assignedTechnicianName,
          details: `Resolution SLA target breached! Critical escalation to IT_MANAGER.`,
          timestamp: new Date().toISOString(),
        });
      }

      if (modified) {
        await incidentRepo.save(inc);
      }
    }
  } catch (err) {
    console.warn('[SLA Watchdog Daemon] Pass error:', err);
  }
}

// Start 30s SLA Watchdog timer in background
const watchdogInterval = setInterval(runSlaWatchdogPass, 30000);
if (watchdogInterval.unref) {
  watchdogInterval.unref();
}

// ==================== DEVELOPMENT VITE MIDDLEWARE & STATIC PRODUCTION ====================
const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(currentDir, '..', 'dist');

async function setupServer() {
  await getSqliteDb();

  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(distDir, 'index.html'));

  if (!isProd && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    // Dynamic Vite middleware mount for instant development HMR/bundle handling
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('[I-ITSM Platform] Mounted Vite in development middleware mode');
    } catch (err) {
      console.warn('[I-ITSM Platform] Vite middleware note:', err);
    }
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
}

// Only listen if not imported by tests
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  setupServer().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[I-ITSM Core Engine] Server active on http://0.0.0.0:${PORT}`);
    });
  });
}

export default app;
