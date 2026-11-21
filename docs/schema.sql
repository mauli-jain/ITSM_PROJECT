-- Intelligent IT Service Management (I-ITSM)
-- Canonical SQLite Database Schema
-- Location: data/iitsm.db

PRAGMA foreign_keys = ON;

-- 1. Users & Identities (Polymorphic: Employee, Technician, Administrator)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ROLE_EMPLOYEE', 'ROLE_TECHNICIAN', 'ROLE_ADMIN')),
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

-- 2. IT Services (CMDB & Topology)
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_criticality TEXT NOT NULL CHECK(business_criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  owner_team TEXT NOT NULL,
  health_status TEXT NOT NULL CHECK(health_status IN ('HEALTHY', 'DEGRADED', 'OUTAGE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Incident Categories (Classification & Keywords)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Service Level Agreement (SLA) Policies
CREATE TABLE IF NOT EXISTS sla_policies (
  id TEXT PRIMARY KEY,
  priority TEXT NOT NULL CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
  response_target_minutes INTEGER NOT NULL,
  resolution_target_minutes INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Incidents (State Machine Managed)
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
  impact TEXT NOT NULL CHECK(impact IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  urgency TEXT NOT NULL CHECK(urgency IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  business_criticality TEXT NOT NULL CHECK(business_criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  affected_users_count INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
  status TEXT NOT NULL CHECK(status IN ('NEW', 'CLASSIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'NEEDS_INFO', 'RESOLVED', 'VERIFIED', 'CLOSED')),
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
  escalation_level TEXT NOT NULL DEFAULT 'TECHNICIAN' CHECK(escalation_level IN ('TECHNICIAN', 'TEAM_LEAD', 'SYSTEM_ADMIN', 'IT_MANAGER')),
  investigation_notes_json TEXT NOT NULL DEFAULT '[]',
  resolution_summary TEXT,
  closure_reason TEXT,
  audit_trail_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (reporter_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- 6. Resolution Feedback
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comments TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id),
  FOREIGN KEY (employee_id) REFERENCES users(id)
);

-- 7. Audit Log (Append-Only Event Stream)
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

-- Indices for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_technician ON incidents(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_audit_incident ON audit_logs(incident_id);
