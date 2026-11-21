# I-ITSM Sample Data & Canonical Fixtures

This document provides representative sample rows for every relational table in the `data/iitsm.db` SQLite database schema.

---

## 1. Table: `users`
Stores user credentials, polymorphic role identities, skills, workload parameters, and organizational metadata.

| id | username | password_hash (bcrypt) | full_name | email | role | department | skills_json | experience_years | max_workload | available | active_incident_count | specialization | managed_division |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| `ADMIN01` | `admin` | `$2a$10$X1...` (admin123) | Alexander Vance | `a.vance@iitsm.corp` | `ROLE_ADMIN` | *NULL* | `[]` | 14 | 0 | 1 | 0 | *NULL* | Global IT Operations |
| `EMP101` | `sjenkins` | `$2a$10$Y2...` (password) | Sarah Jenkins | `s.jenkins@iitsm.corp` | `ROLE_EMPLOYEE` | Billing & Accounting | `[]` | 0 | 0 | 1 | 0 | *NULL* | *NULL* |
| `EMP102` | `mpatel` | `$2a$10$Y2...` (password) | Michael Patel | `m.patel@iitsm.corp` | `ROLE_EMPLOYEE` | Customer Experience | `[]` | 0 | 0 | 1 | 0 | *NULL* | *NULL* |
| `EMP103` | `elena` | `$2a$10$Y2...` (password) | Elena Rostova | `e.rostova@iitsm.corp` | `ROLE_EMPLOYEE` | Corporate Legal | `[]` | 0 | 0 | 1 | 0 | *NULL* | *NULL* |
| `T101` | `dross` | `$2a$10$Y2...` (password) | Mauli Jain | `d.ross@iitsm.corp` | `ROLE_TECHNICIAN` | *NULL* | `["PostgreSQL", "Database", "Linux", "Storage", "Backup"]` | 8 | 6 | 1 | 2 | Principal Database Administrator | *NULL* |
| `T102` | `msato` | `$2a$10$Y2...` (password) | Maya Sato | `m.sato@iitsm.corp` | `ROLE_TECHNICIAN` | *NULL* | `["VPN", "Network", "Firewall", "DNS", "Cisco", "Routing"]` | 5 | 5 | 1 | 1 | Senior Network Engineer | *NULL* |
| `T103` | `jwilliams`| `$2a$10$Y2...` (password) | Jamal Williams | `j.williams@iitsm.corp`| `ROLE_TECHNICIAN` | *NULL* | `["Payment Gateway", "Stripe", "API", "Application", "Java"]`| 6 | 6 | 1 | 2 | Enterprise Application Specialist| *NULL* |
| `T104` | `rchen` | `$2a$10$Y2...` (password) | Rachel Chen | `r.chen@iitsm.corp` | `ROLE_TECHNICIAN` | *NULL* | `["Active Directory", "SSO", "LDAP", "IAM", "Security"]` | 4 | 5 | 1 | 1 | Identity & Access Specialist | *NULL* |

---

## 2. Table: `services`
Stores business IT service assets with owner team assignments and operational health status.

| id | name | business_criticality | owner_team | health_status | created_at |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SRV-PAY` | Payment Processing Gateway | `CRITICAL` | Financial Systems Engineering | `DEGRADED` | 2026-10-01 08:00:00 |
| `SRV-DB` | Core Database Cluster (PostgreSQL) | `HIGH` | Database Administration | `HEALTHY` | 2026-10-01 08:00:00 |
| `SRV-NET` | Corporate VPN & Backbone Network | `CRITICAL` | Network Operations Center (NOC) | `HEALTHY` | 2026-10-01 08:00:00 |
| `SRV-AUTH`| Single Sign-On (SSO) & LDAP Service | `CRITICAL` | Identity & Access Management | `HEALTHY` | 2026-10-01 08:00:00 |
| `SRV-CLOUD`| Object & File Cloud Storage | `MEDIUM` | Cloud Infrastructure Engineering | `HEALTHY` | 2026-10-01 08:00:00 |

---

## 3. Table: `categories`
Defines standard ticket categorization hierarchies and keyword token banks for Jaccard classification.

| id | name | description | keywords_json | created_at |
| :--- | :--- | :--- | :--- | :--- |
| `CAT-DB` | Database | PostgreSQL, connection pooling, queries, and lock contention | `["postgresql", "deadlock", "postgres", "query timeout", "replication", "slow query"]` | 2026-10-01 08:00:00 |
| `CAT-NET` | Network | VPN tunnels, DNS resolution, gateways, and switches | `["vpn", "tunnel", "dns", "wifi", "latency", "packet loss", "routing"]` | 2026-10-01 08:00:00 |
| `CAT-AUTH`| Authentication | Login failures, MFA sync, password reset, and session expiry | `["login", "sso", "mfa", "password", "jwt", "unauthorized", "session expired"]` | 2026-10-01 08:00:00 |
| `CAT-APP` | Application | Payment processing, ERP workflows, and API integrations | `["checkout", "payment failed", "api 500", "stripe", "invoice", "gateway"]` | 2026-10-01 08:00:00 |
| `CAT-STR` | Storage | Disk full warnings, backup retention, and volume mounts | `["disk full", "quota", "nfs", "volume", "iops", "storage"]` | 2026-10-01 08:00:00 |

---

## 4. Table: `sla_policies`
Defines operational service level targets mapped to priority classifications.

| id | priority | response_target_minutes | resolution_target_minutes | description | created_at |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `SLA-P1` | `P1` | 5 | 30 | Critical incident: 5 min response, 30 min resolution | 2026-10-01 08:00:00 |
| `SLA-P2` | `P2` | 15 | 120 | High priority incident: 15 min response, 2 hours resolution | 2026-10-01 08:00:00 |
| `SLA-P3` | `P3` | 60 | 480 | Medium priority incident: 1 hour response, 8 hours resolution | 2026-10-01 08:00:00 |
| `SLA-P4` | `P4` | 240 | 1440 | Low priority incident: 4 hours response, 24 hours resolution | 2026-10-01 08:00:00 |

---

## 5. Table: `incidents`
Stores core incident records, lifecycle state, priority assessment, timestamps, and audit history.

| Field | Example Row 1 (`INC1001`) | Example Row 2 (`INC1002`) |
| :--- | :--- | :--- |
| `id` | `INC1001` | `INC1002` |
| `title` | Payment Gateway recurring 504 timeouts on customer checkout | Customer billing portal checkout failing with transaction aborted |
| `description` | The organization payment application is intermittently returning 504 Gateway Timeout during checkout. Customers cannot complete card authorizations. | Unable to make payment via credit card; customers see payment failed and transaction aborted message. |
| `reporter_id` | `EMP101` (Sarah Jenkins) | `EMP101` (Sarah Jenkins) |
| `reporter_name` | Sarah Jenkins | Sarah Jenkins |
| `category_id` | `CAT-APP` | `CAT-APP` |
| `category_name` | Application | Application |
| `service_id` | `SRV-PAY` | `SRV-PAY` |
| `service_name` | Payment Processing Gateway | Payment Processing Gateway |
| `impact` | `CRITICAL` | `HIGH` |
| `urgency` | `CRITICAL` | `HIGH` |
| `business_criticality` | `CRITICAL` | `CRITICAL` |
| `affected_users_count` | 1400 | 320 |
| `priority` | `P1` | `P1` |
| `status` | `IN_PROGRESS` | `NEW` |
| `created_at` | `2026-10-19T02:04:00.000Z` | `2026-10-19T02:22:00.000Z` |
| `assigned_technician_id`| `T103` (Jamal Williams) | *NULL* |
| `assigned_technician_name`| Jamal Williams | *NULL* |
| `acknowledged_at` | `2026-10-19T02:08:00.000Z` | *NULL* |
| `resolved_at` | *NULL* | *NULL* |
| `closed_at` | *NULL* | *NULL* |
| `response_deadline` | `2026-10-19T02:09:00.000Z` | `2026-10-19T02:27:00.000Z` |
| `resolution_deadline` | `2026-10-19T02:34:00.000Z` | `2026-10-19T02:52:00.000Z` |
| `sla_breached_response`| 0 (false) | 0 (false) |
| `sla_breached_resolution`| 0 (false) | 0 (false) |
| `escalation_level` | `TECHNICIAN` | `TECHNICIAN` |
| `investigation_notes_json` | `["Investigated outbound proxy connections to third-party merchant processor.", "Identified socket connection exhaustion under spike in recurring billing batch."]` | `[]` |
| `resolution_summary` | *NULL* | *NULL* |
| `closure_reason` | *NULL* | *NULL* |
| `audit_trail_json` | `[{"id":"AUD-01","incidentId":"INC1001","timestamp":"2026-10-19T02:04:00.000Z","performedBy":"Sarah Jenkins","action":"CREATE","previousState":null,"newState":"NEW","description":"Incident reported via Self-Service Portal"}]` | `[{"id":"AUD-10","incidentId":"INC1002","timestamp":"2026-10-19T02:22:00.000Z","performedBy":"Sarah Jenkins","action":"CREATE","previousState":null,"newState":"NEW","description":"Incident reported via Self-Service Portal"}]` |

---

## 6. Table: `feedback`
Captures employee satisfaction ratings and qualitative feedback upon ticket verification.

| id | incident_id | employee_id | rating | comments | created_at |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `FB-90001` | `INC1005` | `EMP103` | 5 | Outstanding response time. Elena restored the volume mount before court filing deadlines. | 2026-10-18 16:45:00 |
| `FB-90002` | `INC1006` | `EMP102` | 4 | Resolved cleanly. Would appreciate proactive email notifications when token sync completes. | 2026-10-19 01:15:00 |

---

## 7. Table: `audit_logs`
Global immutable operational event journal recording all system actions across incidents.

| id | incident_id | timestamp | performed_by | action | previous_state | new_state | description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-01` | `INC1001` | 2026-10-19 02:04:00 | Sarah Jenkins | `CREATE` | *NULL* | `NEW` | Incident reported via Self-Service Portal |
| `AUD-02` | `INC1001` | 2026-10-19 02:05:00 | System Prioritizer | `PRIORITIZE` | `NEW` | `NEW` | Calculated priority as P1 based on Critical service and 1400 affected users |
| `AUD-03` | `INC1001` | 2026-10-19 02:07:00 | Alexander Vance | `ASSIGN` | `NEW` | `ASSIGNED` | Assigned to Jamal Williams via Skill-Based Strategy |
| `AUD-04` | `INC1001` | 2026-10-19 02:08:00 | Jamal Williams | `ACKNOWLEDGE` | `ASSIGNED` | `ACKNOWLEDGED` | Technician formally acknowledged response target |
| `AUD-05` | `INC1001` | 2026-10-19 02:11:00 | Jamal Williams | `INVESTIGATE` | `ACKNOWLEDGED` | `IN_PROGRESS` | Root cause isolated: socket exhaustion on payment proxy |
