import initSqlJs, { Database, SqlValue } from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  SEED_ADMIN,
  SEED_EMPLOYEES,
  SEED_TECHNICIANS,
  SEED_SERVICES,
  SEED_CATEGORIES,
  SEED_SLA_POLICIES,
  SEED_INCIDENTS,
} from '../data/seedData';
import {
  User,
  Technician,
  Employee,
  Administrator,
  ITService,
  Category,
  SLAPolicy,
  Incident,
  Feedback,
  AuditRecord,
} from '../types/itsm';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'iitsm.db');

let dbInstance: Database | null = null;
let initPromise: Promise<Database> | null = null;

export async function getSqliteDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const SQL = await initSqlJs();
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    let db: Database;
    if (fs.existsSync(DB_FILE)) {
      try {
        const fileBuffer = fs.readFileSync(DB_FILE);
        db = new SQL.Database(fileBuffer);
      } catch (err) {
        console.warn('[SQLite] Corrupted DB file, re-creating:', err);
        db = new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    dbInstance = db;
    initTables(db);
    seedIfEmpty(db);
    migrateDemoTechnicianRoster(db);
    migrateFourPersonAdminRoster(db);
    flushDatabaseToDisk();
    return db;
  })();

  return initPromise;
}

let debounceTimer: NodeJS.Timeout | null = null;
let isDirty = false;

/**
 * Flush in-memory SQLite state directly to disk (data/iitsm.db)
 */
export function flushDatabaseToDisk(): void {
  if (!dbInstance) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
    isDirty = false;
  } catch (err) {
    console.error('[SQLite] Error writing to data/iitsm.db:', err);
  }
}

/**
 * Debounced database persistence (max 1 write per 500ms)
 */
export function persistDatabase(): void {
  if (!dbInstance) return;
  isDirty = true;

  if (!debounceTimer) {
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (isDirty) {
        flushDatabaseToDisk();
      }
    }, 500);
    // Unref so the timer does not prevent process exit if idle
    if (debounceTimer.unref) {
      debounceTimer.unref();
    }
  }
}

// Ensure flush on process termination / shutdown signals
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    if (isDirty) flushDatabaseToDisk();
  });
  process.on('SIGINT', () => {
    if (isDirty) flushDatabaseToDisk();
  });
  process.on('SIGTERM', () => {
    if (isDirty) flushDatabaseToDisk();
  });
}

function initTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      skills_json TEXT DEFAULT '[]',
      experience_years INTEGER DEFAULT 0,
      max_workload INTEGER DEFAULT 5,
      available INTEGER DEFAULT 1,
      active_incident_count INTEGER DEFAULT 0,
      specialization TEXT,
      managed_division TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      business_criticality TEXT NOT NULL,
      owner_team TEXT NOT NULL,
      health_status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sla_policies (
      id TEXT PRIMARY KEY,
      priority TEXT NOT NULL,
      response_target_minutes INTEGER NOT NULL,
      resolution_target_minutes INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reporter_name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      impact TEXT NOT NULL,
      urgency TEXT NOT NULL,
      business_criticality TEXT NOT NULL,
      affected_users_count INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      assigned_technician_id TEXT,
      assigned_technician_name TEXT,
      acknowledged_at TEXT,
      resolved_at TEXT,
      closed_at TEXT,
      response_deadline TEXT NOT NULL,
      resolution_deadline TEXT NOT NULL,
      sla_breached_response INTEGER NOT NULL DEFAULT 0,
      sla_breached_resolution INTEGER NOT NULL DEFAULT 0,
      escalation_level TEXT NOT NULL DEFAULT 'TECHNICIAN',
      investigation_notes_json TEXT NOT NULL DEFAULT '[]',
      resolution_summary TEXT,
      closure_reason TEXT,
      audit_trail_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comments TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      description TEXT NOT NULL
    );
  `);
}

/**
 * Upgrade the four demo technician identities without deleting incidents or other
 * user-created records. The original sample roster had a fifth technician T105;
 * move that technician's ticket references to T104 before deleting the demo row.
 * Only touch the canonical sample IDs; do not reset the existing database.
 */
function migrateDemoTechnicianRoster(db: Database): void {
  const v = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
  if (v >= 2) return;
  db.run('BEGIN TRANSACTION');
  try {
    const updates: Array<[string,string,string,string]> = [
      ['T102','Shambhavi Chaturvedi','shambhavi','shambhavi@iitsm.corp'],
      ['T103','Tulika Devale','tulika','tulika@iitsm.corp'],
      ['T104','Simran Misra','simran','simran@iitsm.corp'],
    ];
    // Only rewrite the demo users; not users created by an administrator.
    for (const [id,name,username,email] of updates) {
      db.run("UPDATE users SET full_name=?, username=?, email=? WHERE id=? AND role='ROLE_TECHNICIAN'", [name, username, email, id]);
      db.run('UPDATE incidents SET assigned_technician_name=? WHERE assigned_technician_id=?', [name,id]);
    }
    const oldDemo = db.exec("SELECT username FROM users WHERE id='T105'")[0]?.values[0]?.[0];
    if (oldDemo === 'lmiller') {
      db.run("UPDATE incidents SET assigned_technician_id='T104', assigned_technician_name='Simran Misra' WHERE assigned_technician_id='T105'");
      db.run("UPDATE users SET active_incident_count = active_incident_count + COALESCE((SELECT active_incident_count FROM users WHERE id='T105'),0), max_workload=MAX(max_workload,7), available=1 WHERE id='T104'");
      db.run("DELETE FROM users WHERE id='T105'");
    }
    db.run('PRAGMA user_version=2');
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

/**
 * Version 4: repair the legacy Mauli technician / Alexander admin identity split.
 * The v3 archive updated seed data but accidentally omitted the database migration.
 * Preserve tickets, feedback, and custom-created users; change only canonical demo IDs.
 * This runs once at startup and never resets the whole database.
 */
function migrateFourPersonAdminRoster(db: Database): void {
  const v = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
  if (v >= 4) return;

  const demoPasswordHash = bcrypt.hashSync('admin123', 10);
  db.run('BEGIN TRANSACTION');
  try {
    const hasUser = (id: string) =>
      Boolean(db.exec(`SELECT id FROM users WHERE id='${id}'`)[0]?.values.length);

    // Mauli was accidentally left as technician T101 in pre-v4 databases.
    // Transfer ticket ownership before retiring that duplicate demo account.
    if (hasUser('T101')) {
      db.run("UPDATE incidents SET assigned_technician_id='T104', assigned_technician_name='Simran Misra' WHERE assigned_technician_id='T101'");
      db.run("UPDATE incidents SET reporter_id='ADM001', reporter_name='Mauli Jain' WHERE reporter_id='T101'");
      db.run("UPDATE feedback SET employee_id='ADM001' WHERE employee_id='T101'");
      db.run("DELETE FROM users WHERE id='T101'");
    }

    // Canonical administrator remains ADM001, so old incident references stay valid.
    // Fix both old 'admin' accounts and v3 databases that kept Alexander's identity.
    if (hasUser('ADM001')) {
      db.run(`UPDATE users SET username='mauli', full_name='Mauli Jain',
        email='mauli@iitsm.corp', role='ROLE_ADMIN',
        managed_division='Global IT Operations', password_hash=? WHERE id='ADM001'`,
        [demoPasswordHash]);
    } else {
      db.run(`INSERT INTO users
        (id,username,password_hash,full_name,email,role,managed_division)
        VALUES ('ADM001','mauli',?,'Mauli Jain','mauli@iitsm.corp',
                'ROLE_ADMIN','Global IT Operations')`, [demoPasswordHash]);
    }

    const roster: Array<[string,string,string,string]> = [
      ['T102', 'Shambhavi Chaturvedi', 'shambhavi', 'shambhavi@iitsm.corp'],
      ['T103', 'Tulika Devale', 'tulika', 'tulika@iitsm.corp'],
      ['T104', 'Simran Misra', 'simran', 'simran@iitsm.corp'],
    ];
    for (const [id, name, username, email] of roster) {
      db.run("UPDATE users SET username=?, full_name=?, email=?, role='ROLE_TECHNICIAN' WHERE id=?", [username,name,email,id]);
      db.run('UPDATE incidents SET assigned_technician_name=? WHERE assigned_technician_id=?', [name,id]);
    }
    // Retire only the original sample entries, never administrator-created accounts.
    db.run("UPDATE incidents SET reporter_id='ADM001', reporter_name='Mauli Jain' WHERE reporter_id IN ('EMP101','EMP102')");
    db.run("UPDATE feedback SET employee_id='ADM001' WHERE employee_id IN ('EMP101','EMP102')");
    db.run("DELETE FROM users WHERE id IN ('EMP101','EMP102','T105')");
    db.run("UPDATE incidents SET reporter_name='Mauli Jain' WHERE reporter_id='ADM001'");
    db.run('PRAGMA user_version=4');
    db.run('COMMIT');
    console.log('[SQLite] Demo roster upgraded: Mauli Jain (admin) and 3 technicians.');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function seedIfEmpty(db: Database): void {
  const userCount = db.exec("SELECT count(*) as count FROM users")[0]?.values[0]?.[0] as number;
  if (userCount && userCount > 0) {
    return;
  }

  console.log('[SQLite] Database is empty. Seeding canonical records with bcrypt passwords (cost 10)...');

  // Password hashes: admin123 for admin, password for others
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('password', 10);

  // 1. Seed Admin
  db.run(
    `INSERT INTO users (id, username, password_hash, full_name, email, role, managed_division)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      SEED_ADMIN.id,
      SEED_ADMIN.username,
      adminHash,
      SEED_ADMIN.fullName,
      SEED_ADMIN.email,
      SEED_ADMIN.role,
      SEED_ADMIN.managedDivision,
    ]
  );

  // 2. Seed Employees
  for (const emp of SEED_EMPLOYEES) {
    db.run(
      `INSERT INTO users (id, username, password_hash, full_name, email, role, department)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [emp.id, emp.username, userHash, emp.fullName, emp.email, emp.role, emp.department]
    );
  }

  // 3. Seed Technicians
  for (const tech of SEED_TECHNICIANS) {
    db.run(
      `INSERT INTO users (id, username, password_hash, full_name, email, role, skills_json, experience_years, max_workload, available, active_incident_count, specialization)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tech.id,
        tech.username,
        userHash,
        tech.fullName,
        tech.email,
        tech.role,
        JSON.stringify(tech.skills),
        tech.experienceYears,
        tech.maxWorkload,
        tech.available ? 1 : 0,
        tech.activeIncidentCount,
        tech.specialization,
      ]
    );
  }

  // 4. Seed Services
  for (const srv of SEED_SERVICES) {
    db.run(
      `INSERT INTO services (id, name, business_criticality, owner_team, health_status)
       VALUES (?, ?, ?, ?, ?)`,
      [srv.id, srv.name, srv.businessCriticality, srv.ownerTeam, srv.healthStatus]
    );
  }

  // 5. Seed Categories
  for (const cat of SEED_CATEGORIES) {
    db.run(
      `INSERT INTO categories (id, name, description, keywords_json)
       VALUES (?, ?, ?, ?)`,
      [cat.id, cat.name, cat.description, JSON.stringify(cat.keywords)]
    );
  }

  // 6. Seed SLA Policies
  for (const sla of SEED_SLA_POLICIES) {
    db.run(
      `INSERT INTO sla_policies (id, priority, response_target_minutes, resolution_target_minutes, description)
       VALUES (?, ?, ?, ?, ?)`,
      [sla.id, sla.priority, sla.responseTargetMinutes, sla.resolutionTargetMinutes, sla.description]
    );
  }

  // 7. Seed Incidents
  for (const inc of SEED_INCIDENTS) {
    db.run(
      `INSERT INTO incidents (
        id, title, description, reporter_id, reporter_name, category_id, category_name,
        service_id, service_name, impact, urgency, business_criticality, affected_users_count,
        priority, status, created_at, assigned_technician_id, assigned_technician_name,
        acknowledged_at, resolved_at, closed_at, response_deadline, resolution_deadline,
        sla_breached_response, sla_breached_resolution, escalation_level,
        investigation_notes_json, resolution_summary, closure_reason, audit_trail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inc.id,
        inc.title,
        inc.description,
        inc.reporterId,
        inc.reporterName,
        inc.categoryId,
        inc.categoryName,
        inc.serviceId,
        inc.serviceName,
        inc.impact,
        inc.urgency,
        inc.businessCriticality,
        inc.affectedUsersCount,
        inc.priority,
        inc.status,
        inc.createdAt,
        inc.assignedTechnicianId || null,
        inc.assignedTechnicianName || null,
        inc.acknowledgedAt || null,
        inc.resolvedAt || null,
        inc.closedAt || null,
        inc.responseDeadline,
        inc.resolutionDeadline,
        inc.slaBreachedResponse ? 1 : 0,
        inc.slaBreachedResolution ? 1 : 0,
        inc.escalationLevel || 'TECHNICIAN',
        JSON.stringify(inc.investigationNotes || []),
        inc.resolutionSummary || null,
        inc.closureReason || null,
        JSON.stringify(inc.auditTrail || []),
      ]
    );
  }

  console.log('[SQLite] Seed data populated successfully.');
}

// Low-level query helper
export function runQuery<T = any>(sql: string, params: SqlValue[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

export function runExec(sql: string, params: SqlValue[] = []): void {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  persistDatabase();
}

export function resetDatabase(): void {
  if (!dbInstance) return;
  dbInstance.run(`
    DELETE FROM audit_logs;
    DELETE FROM feedback;
    DELETE FROM incidents;
    DELETE FROM sla_policies;
    DELETE FROM categories;
    DELETE FROM services;
    DELETE FROM users;
  `);
  seedIfEmpty(dbInstance);
  flushDatabaseToDisk();
}
