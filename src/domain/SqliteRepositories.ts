import {
  Category,
  Employee,
  Technician,
  Administrator,
  Feedback,
  Incident,
  ITService,
  SLAPolicy,
  User,
  AuditRecord,
} from '../types/itsm';
import { Repository } from './Repositories';
import { getSqliteDb, runQuery, runExec } from '../db/sqlite';

function rowToUser(row: any): User {
  const base = {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
  };

  if (row.role === 'ROLE_ADMIN') {
    return {
      ...base,
      role: 'ROLE_ADMIN',
      managedDivision: row.managed_division || 'Global IT Operations',
    };
  }

  if (row.role === 'ROLE_EMPLOYEE') {
    return {
      ...base,
      role: 'ROLE_EMPLOYEE',
      department: row.department || 'Corporate Operations',
    };
  }

  // ROLE_TECHNICIAN
  let skills: string[] = [];
  try {
    skills = JSON.parse(row.skills_json || '[]');
  } catch {}

  return {
    ...base,
    role: 'ROLE_TECHNICIAN',
    skills,
    experienceYears: row.experience_years ?? 0,
    maxWorkload: row.max_workload ?? 5,
    available: Boolean(row.available),
    activeIncidentCount: row.active_incident_count ?? 0,
    specialization: row.specialization || 'Technical Support',
  };
}

function rowToIncident(row: any): Incident {
  let notes: string[] = [];
  let audit: AuditRecord[] = [];
  try {
    notes = JSON.parse(row.investigation_notes_json || '[]');
  } catch {}
  try {
    audit = JSON.parse(row.audit_trail_json || '[]');
  } catch {}

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    serviceId: row.service_id,
    serviceName: row.service_name,
    impact: row.impact,
    urgency: row.urgency,
    businessCriticality: row.business_criticality,
    affectedUsersCount: row.affected_users_count ?? 1,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    assignedTechnicianId: row.assigned_technician_id || undefined,
    assignedTechnicianName: row.assigned_technician_name || undefined,
    acknowledgedAt: row.acknowledged_at || undefined,
    resolvedAt: row.resolved_at || undefined,
    closedAt: row.closed_at || undefined,
    responseDeadline: row.response_deadline,
    resolutionDeadline: row.resolution_deadline,
    slaBreachedResponse: Boolean(row.sla_breached_response),
    slaBreachedResolution: Boolean(row.sla_breached_resolution),
    escalationLevel: row.escalation_level || 'TECHNICIAN',
    investigationNotes: notes,
    resolutionSummary: row.resolution_summary || undefined,
    closureReason: row.closure_reason || undefined,
    auditTrail: audit,
  };
}

export class SqliteUserRepository implements Repository<User, string> {
  public async findAll(): Promise<User[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM users ORDER BY id ASC');
    return rows.map(rowToUser);
  }

  public async findById(id: string): Promise<User | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM users WHERE id = ?', [id]);
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  public async findByUsername(username: string): Promise<User | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
    return rows.length > 0 ? rowToUser(rows[0]) : null;
  }

  public async save(user: User): Promise<User> {
    await getSqliteDb();
    const existing = await this.findById(user.id);
    const uAny = user as any;

    if (existing) {
      runExec(
        `UPDATE users SET
          username = ?, full_name = ?, email = ?, role = ?, department = ?,
          skills_json = ?, experience_years = ?, max_workload = ?, available = ?,
          active_incident_count = ?, specialization = ?, managed_division = ?,
          password_hash = COALESCE(?, password_hash)
        WHERE id = ?`,
        [
          user.username,
          user.fullName,
          user.email,
          user.role,
          (user as Employee).department || null,
          (user as Technician).skills ? JSON.stringify((user as Technician).skills) : '[]',
          (user as Technician).experienceYears ?? 0,
          (user as Technician).maxWorkload ?? 5,
          (user as Technician).available ? 1 : 0,
          (user as Technician).activeIncidentCount ?? 0,
          (user as Technician).specialization || null,
          (user as Administrator).managedDivision || null,
          uAny.passwordHash || null,
          user.id,
        ]
      );
    } else {
      runExec(
        `INSERT INTO users (
          id, username, password_hash, full_name, email, role, department,
          skills_json, experience_years, max_workload, available, active_incident_count,
          specialization, managed_division
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.username,
          uAny.passwordHash || 'demo_hash',
          user.fullName,
          user.email,
          user.role,
          (user as Employee).department || null,
          (user as Technician).skills ? JSON.stringify((user as Technician).skills) : '[]',
          (user as Technician).experienceYears ?? 0,
          (user as Technician).maxWorkload ?? 5,
          (user as Technician).available ? 1 : 0,
          (user as Technician).activeIncidentCount ?? 0,
          (user as Technician).specialization || null,
          (user as Administrator).managedDivision || null,
        ]
      );
    }
    return (await this.findById(user.id))!;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM users WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteIncidentRepository implements Repository<Incident, string> {
  public async findAll(): Promise<Incident[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM incidents ORDER BY created_at DESC');
    return rows.map(rowToIncident);
  }

  public async findById(id: string): Promise<Incident | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM incidents WHERE id = ?', [id]);
    return rows.length > 0 ? rowToIncident(rows[0]) : null;
  }

  public async save(inc: Incident): Promise<Incident> {
    await getSqliteDb();
    const existing = await this.findById(inc.id);

    if (existing) {
      runExec(
        `UPDATE incidents SET
          title = ?, description = ?, reporter_id = ?, reporter_name = ?,
          category_id = ?, category_name = ?, service_id = ?, service_name = ?,
          impact = ?, urgency = ?, business_criticality = ?, affected_users_count = ?,
          priority = ?, status = ?, assigned_technician_id = ?, assigned_technician_name = ?,
          acknowledged_at = ?, resolved_at = ?, closed_at = ?, response_deadline = ?,
          resolution_deadline = ?, sla_breached_response = ?, sla_breached_resolution = ?,
          escalation_level = ?, investigation_notes_json = ?, resolution_summary = ?,
          closure_reason = ?, audit_trail_json = ?
        WHERE id = ?`,
        [
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
          inc.id,
        ]
      );
    } else {
      runExec(
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
          inc.createdAt || new Date().toISOString(),
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
    return (await this.findById(inc.id))!;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM incidents WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteServiceRepository implements Repository<ITService, string> {
  public async findAll(): Promise<ITService[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM services ORDER BY name ASC');
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      businessCriticality: r.business_criticality,
      ownerTeam: r.owner_team,
      healthStatus: r.health_status,
    }));
  }

  public async findById(id: string): Promise<ITService | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM services WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      businessCriticality: r.business_criticality,
      ownerTeam: r.owner_team,
      healthStatus: r.health_status,
    };
  }

  public async save(srv: ITService): Promise<ITService> {
    await getSqliteDb();
    const existing = await this.findById(srv.id);
    if (existing) {
      runExec(
        'UPDATE services SET name = ?, business_criticality = ?, owner_team = ?, health_status = ? WHERE id = ?',
        [srv.name, srv.businessCriticality, srv.ownerTeam, srv.healthStatus, srv.id]
      );
    } else {
      runExec(
        'INSERT INTO services (id, name, business_criticality, owner_team, health_status) VALUES (?, ?, ?, ?, ?)',
        [srv.id, srv.name, srv.businessCriticality, srv.ownerTeam, srv.healthStatus]
      );
    }
    return (await this.findById(srv.id))!;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM services WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteCategoryRepository implements Repository<Category, string> {
  public async findAll(): Promise<Category[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM categories ORDER BY name ASC');
    return rows.map((r: any) => {
      let keywords: string[] = [];
      try {
        keywords = JSON.parse(r.keywords_json || '[]');
      } catch {}
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        keywords,
      };
    });
  }

  public async findById(id: string): Promise<Category | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM categories WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    let keywords: string[] = [];
    try {
      keywords = JSON.parse(r.keywords_json || '[]');
    } catch {}
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      keywords,
    };
  }

  public async save(cat: Category): Promise<Category> {
    await getSqliteDb();
    const existing = await this.findById(cat.id);
    if (existing) {
      runExec(
        'UPDATE categories SET name = ?, description = ?, keywords_json = ? WHERE id = ?',
        [cat.name, cat.description, JSON.stringify(cat.keywords || []), cat.id]
      );
    } else {
      runExec(
        'INSERT INTO categories (id, name, description, keywords_json) VALUES (?, ?, ?, ?)',
        [cat.id, cat.name, cat.description, JSON.stringify(cat.keywords || [])]
      );
    }
    return (await this.findById(cat.id))!;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM categories WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteSLAPolicyRepository implements Repository<SLAPolicy, string> {
  public async findAll(): Promise<SLAPolicy[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM sla_policies ORDER BY priority ASC');
    return rows.map((r: any) => ({
      id: r.id,
      priority: r.priority,
      responseTargetMinutes: r.response_target_minutes,
      resolutionTargetMinutes: r.resolution_target_minutes,
      description: r.description,
    }));
  }

  public async findById(id: string): Promise<SLAPolicy | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM sla_policies WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      priority: r.priority,
      responseTargetMinutes: r.response_target_minutes,
      resolutionTargetMinutes: r.resolution_target_minutes,
      description: r.description,
    };
  }

  public async findByPriority(priority: string): Promise<SLAPolicy | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM sla_policies WHERE priority = ?', [priority]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      priority: r.priority,
      responseTargetMinutes: r.response_target_minutes,
      resolutionTargetMinutes: r.resolution_target_minutes,
      description: r.description,
    };
  }

  public async save(sla: SLAPolicy): Promise<SLAPolicy> {
    await getSqliteDb();
    const existing = await this.findById(sla.id);
    if (existing) {
      runExec(
        'UPDATE sla_policies SET priority = ?, response_target_minutes = ?, resolution_target_minutes = ?, description = ? WHERE id = ?',
        [sla.priority, sla.responseTargetMinutes, sla.resolutionTargetMinutes, sla.description, sla.id]
      );
    } else {
      runExec(
        'INSERT INTO sla_policies (id, priority, response_target_minutes, resolution_target_minutes, description) VALUES (?, ?, ?, ?, ?)',
        [sla.id, sla.priority, sla.responseTargetMinutes, sla.resolutionTargetMinutes, sla.description]
      );
    }
    return (await this.findById(sla.id))!;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM sla_policies WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteFeedbackRepository implements Repository<Feedback, string> {
  public async findAll(): Promise<Feedback[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM feedback ORDER BY created_at DESC');
    return rows.map((r: any) => ({
      id: r.id,
      incidentId: r.incident_id,
      employeeId: r.employee_id,
      rating: r.rating,
      comments: r.comments,
      createdAt: r.created_at,
    }));
  }

  public async findById(id: string): Promise<Feedback | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM feedback WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      incidentId: r.incident_id,
      employeeId: r.employee_id,
      rating: r.rating,
      comments: r.comments,
      createdAt: r.created_at,
    };
  }

  public async save(fb: Feedback): Promise<Feedback> {
    await getSqliteDb();
    runExec(
      'INSERT INTO feedback (id, incident_id, employee_id, rating, comments, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [fb.id, fb.incidentId, fb.employeeId, fb.rating, fb.comments || '', fb.createdAt || new Date().toISOString()]
    );
    return fb;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM feedback WHERE id = ?', [id]);
    return true;
  }
}

export class SqliteAuditRepository implements Repository<AuditRecord, string> {
  public async findAll(): Promise<AuditRecord[]> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM audit_logs ORDER BY timestamp DESC');
    return rows.map((r: any) => ({
      id: r.id,
      incidentId: r.incident_id,
      timestamp: r.timestamp,
      performedBy: r.performed_by,
      action: r.action,
      previousState: r.previous_state as any,
      newState: r.new_state as any,
      description: r.description,
    }));
  }

  public async findById(id: string): Promise<AuditRecord | null> {
    await getSqliteDb();
    const rows = runQuery('SELECT * FROM audit_logs WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      incidentId: r.incident_id,
      timestamp: r.timestamp,
      performedBy: r.performed_by,
      action: r.action,
      previousState: r.previous_state as any,
      newState: r.new_state as any,
      description: r.description,
    };
  }

  public async save(record: AuditRecord): Promise<AuditRecord> {
    await getSqliteDb();
    runExec(
      'INSERT INTO audit_logs (id, incident_id, timestamp, performed_by, action, previous_state, new_state, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        record.id,
        record.incidentId,
        record.timestamp,
        record.performedBy,
        record.action,
        record.previousState || null,
        record.newState || null,
        record.description,
      ]
    );
    return record;
  }

  public async deleteById(id: string): Promise<boolean> {
    await getSqliteDb();
    runExec('DELETE FROM audit_logs WHERE id = ?', [id]);
    return true;
  }
}
