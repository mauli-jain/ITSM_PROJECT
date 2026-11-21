# I-ITSM System Requirements & Business Rules Specification

This document details the complete requirements specification for the **Intelligent IT Service Management (I-ITSM)** enterprise application, including numbered functional and non-functional requirements, user roles, security access levels, and formal business rules.

---

## 1. Numbered Functional Requirements (FR)

| Req ID | Requirement Statement | Implementation Target | Verification Method |
| :--- | :--- | :--- | :--- |
| **FR-01** | **User Identity & Role Polymorphism:** The system must represent system users with distinct polymorphic identities (`ROLE_EMPLOYEE`, `ROLE_TECHNICIAN`, `ROLE_ADMIN`) implementing specialized capabilities. | `UserEntity.ts`, `server.ts` | Unit Test #1, API Test #18 |
| **FR-02** | **Secure Credential Storage:** User passwords must be stored using industry-standard `bcrypt` hashing with a minimum work factor (salt rounds) of 10. Raw passwords must never be stored. | `sqlite.ts`, `server.ts` | API Test #2, #3 |
| **FR-03** | **Stateless Session Issuance:** Valid login authentication must issue an HMAC-SHA256 signed JSON Web Token (JWT) with an 8-hour expiration period. | `server.ts` | API Test #3 |
| **FR-04** | **Login Brute-Force Rate Limiting:** The authentication gateway must throttle failed logins to max 5 failed attempts per username + IP within a 15-minute window, returning HTTP 429 with a generic lockout message. | `server.ts` | API Test #17 |
| **FR-05** | **Role-Based Incident Visibility:** `GET /api/incidents` must enforce server-side least privilege: employees view only self-reported tickets; technicians view only assigned tickets; administrators view all tickets. | `server.ts` | API Test #6, #7, #8 |
| **FR-06** | **Role-Based User Directory Visibility:** `GET /api/users` and `GET /api/technicians` must redact sensitive fields based on the caller's role. Employees receive only `{ id, fullName }`. `passwordHash` is never returned. | `server.ts` | API Test #18 |
| **FR-07** | **State Machine Transition Enforcement:** The system must strictly govern incident lifecycle through the GoF State Pattern. Arbitrary jumps (e.g. `NEW` to `CLOSED`) must be rejected with HTTP 409 Conflict. | `IncidentState.ts`, `server.ts` | Unit Test #4, #5, API Test #11 |
| **FR-08** | **Technician Lifecycle Progression:** An assigned technician must be able to acknowledge receipt (`ACKNOWLEDGED`), initiate work (`IN_PROGRESS`), and document resolution (`RESOLVED`) with mandatory notes. | `IncidentEntity.ts`, `server.ts` | Unit Test #3, API Test #13 |
| **FR-09** | **Reporter Verification:** The reporting employee must be permitted to confirm ticket resolution (`VERIFIED`) or reject it back to `IN_PROGRESS` if issues persist. | `IncidentEntity.ts` | Unit Test #1, #3 |
| **FR-10** | **Administrative Incident Closure:** Only system administrators may transition an incident from `VERIFIED` to the terminal `CLOSED` state with a closure reason. | `IncidentEntity.ts`, `server.ts` | Unit Test #7, API Test #10 |
| **FR-11** | **Strategy Pattern Assignment:** The system must support administrative automated dispatch across 4 distinct swappable strategies: Skill-Based, Load-Based, Round-Robin, and Experience-Based. | `AssignmentStrategy.ts`, `server.ts` | Unit Test #8-12, API Test #12, #22 |
| **FR-12** | **Workload Quota Protection:** Assignment algorithms must respect technician `maxWorkload`. Overloaded or unavailable technicians must be excluded from candidate selection. | `AssignmentStrategy.ts` | Unit Test #2, #13 |
| **FR-13** | **Multi-Channel Observer Dispatch:** The system must publish incident events to an event bus notifying In-App, Email, SMS, and Audit Log adapters. | `IncidentObserver.ts` | Unit Test #14, #18 |
| **FR-14** | **SMS Priority Gating:** High-cost SMS notifications must be suppressed for low-priority tickets (P3/P4) and triggered only for critical incidents (P1/P2). | `IncidentObserver.ts` | Unit Test #18 |
| **FR-15** | **SLA Policy-Driven Deadlines:** Incidents must have response and resolution deadlines computed dynamically based on the priority SLA policy at creation time. | `server.ts`, `SqliteRepositories.ts` | Unit Test #15, API Test #19 |
| **FR-16** | **Background SLA Watchdog Daemon:** An automated daemon must inspect open tickets periodically, mark SLA breaches, and trigger multi-level escalation. | `server.ts` | API Test #20 |
| **FR-17** | **Intelligent Duplicate Detection:** The platform must calculate token similarity (Jaccard index) across incidents sharing the same service to detect correlated issues. | `intelligentEngines.ts`, `server.ts` | API Test #21 |
| **FR-18** | **Full Audit Trail:** All state changes, assignments, notes, and escalations must record an immutable, timestamped audit log. | `IncidentEntity.ts`, `SqliteRepositories.ts` | Unit Test #16, API Test #14 |
| **FR-19** | **Single-Use SSE Live Streaming:** Real-time event streaming (`/api/events`) must require a single-use authenticated ticket to establish persistent HTTP connections. | `server.ts` | API Test #16 |
| **FR-20** | **Input Payload Validation:** All mutation endpoints must reject malformed, out-of-range, or incomplete request payloads using Zod schemas returning HTTP 422. | `server.ts` | API Test #1, #15 |
| **FR-21** | **Disk Persistence:** All relational tables must persist across process restarts in `data/iitsm.db` via debounced file synchronization. | `sqlite.ts` | API Test #23 |

---

## 2. Numbered Non-Functional Requirements (NFR)

| Req ID | Requirement Statement | Target Metric | Verification Method |
| :--- | :--- | :--- | :--- |
| **NFR-01** | **Type Safety & Zero Lint Errors:** The codebase must compile with zero TypeScript diagnostics (`"strict": true`). | 0 errors | `npm run lint` (`tsc --noEmit`) |
| **NFR-02** | **Test Suite Coverage:** The automated test suite must exceed 40 comprehensive unit and integration tests across all GoF patterns and API endpoints. | >= 40 tests | `npm test` (44 passed) |
| **NFR-03** | **Sub-Second Storage Latency:** Embedded database queries via WebAssembly SQLite must execute in sub-millisecond time. | < 5ms query time | `sql.js` in-memory execution |
| **NFR-04** | **Disk I/O Throttling:** Background file synchronization to `data/iitsm.db` must be debounced to avoid disk thrashing during high-volume API mutations. | Max 1 write / 500ms | `debounceTimer` in `sqlite.ts` |
| **NFR-05** | **Graceful Shutdown Flush:** Process termination (`SIGINT`, `SIGTERM`, `beforeExit`) must guarantee in-memory database flush to disk. | 100% data retention | Process event hooks in `sqlite.ts` |
| **NFR-06** | **Security Headers:** Express server must output defensive HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`). | Standard compliance | Middleware verification |
| **NFR-07** | **Zero UI Regression:** All frontend design guidelines, dark/light themes, monospace code fonts, and responsive layouts must remain untouched. | 100% UI preservation | Layout inspection |
| **NFR-08** | **Stateless API Architecture:** Server nodes must not maintain in-memory HTTP session state, allowing horizontal scaling behind load balancers. | Zero session affinity | JWT authentication |

---

## 3. User Roles & Permissions Matrix

| Permission / Capability | `ROLE_EMPLOYEE` | `ROLE_TECHNICIAN` | `ROLE_ADMIN` |
| :--- | :---: | :---: | :---: |
| Report New Incident (`POST /api/incidents`) | **YES** | NO | **YES** |
| View Own Reported Incidents | **YES** | N/A | **YES** |
| View Assigned Incidents | N/A | **YES** | **YES** |
| View All Organization Incidents | NO | NO | **YES** |
| Acknowledge Assigned Incident | NO | **YES** (Assigned only) | **YES** |
| Investigate & Add Notes | NO | **YES** (Assigned only) | **YES** |
| Mark Incident Resolved | NO | **YES** (Assigned only) | **YES** |
| Verify Resolution Quality | **YES** (Reporter only) | NO | **YES** |
| Close Incident Permanently | NO | NO | **YES** |
| Run Automated Assignment Dispatch | NO | NO | **YES** |
| Manage Services & Categories | NO | NO | **YES** |
| Manage SLA Policies | NO | NO | **YES** |
| View Full User Directory (Emails, Roles) | NO (Names/IDs only) | **YES** | **YES** |
| Reset System Database | NO | NO | **YES** |

---

## 4. Formal Business Rules

### 4.1 Priority Determination Formula
The priority of an incident is computed using a weighted multi-factor calculation combining Impact, Urgency, Business Criticality of the affected service, and the number of affected users:

$$\text{Impact Factor } (I): \text{LOW} = 1, \text{MEDIUM} = 2, \text{HIGH} = 3, \text{CRITICAL} = 4$$
$$\text{Urgency Factor } (U): \text{LOW} = 1, \text{MEDIUM} = 2, \text{HIGH} = 3, \text{CRITICAL} = 4$$
$$\text{Criticality Factor } (C): \text{LOW} = 1, \text{MEDIUM} = 2, \text{HIGH} = 3, \text{CRITICAL} = 4$$

$$\text{Composite Score} = (I \times 0.35) + (U \times 0.35) + (C \times 0.20) + \min\left(1.0, \frac{\text{affectedUsers}}{100}\right) \times 0.10$$

#### Priority Tier Mapping:
- **P1 (Critical):** Composite Score $\ge 3.4$ OR ($I = \text{CRITICAL}$ AND $U = \text{CRITICAL}$) OR affected users $> 500$ on Critical service.
- **P2 (High):** Composite Score $\ge 2.6$ and $< 3.4$.
- **P3 (Medium):** Composite Score $\ge 1.8$ and $< 2.6$.
- **P4 (Low):** Composite Score $< 1.8$.

---

### 4.2 SLA Target Deadlines

| Priority Tier | Target Response Time | Target Resolution Time | Operational Description |
| :---: | :---: | :---: | :--- |
| **P1** | **5 minutes** | **30 minutes** | Total service outage affecting core business revenue or regulatory compliance. |
| **P2** | **15 minutes** | **120 minutes (2 hours)** | Severe service degradation with workarounds available or high user impact. |
| **P3** | **60 minutes (1 hour)** | **480 minutes (8 hours)** | Moderate degradation affecting non-critical workflow or subset of team. |
| **P4** | **240 minutes (4 hours)** | **1440 minutes (24 hours)** | Minor inquiry, cosmetic defect, or standard user administrative request. |

- **Response Deadline:** $T_{\text{created}} + \text{responseTargetMinutes}$ (satisfied when technician transitions ticket to `ACKNOWLEDGED`).
- **Resolution Deadline:** $T_{\text{created}} + \text{resolutionTargetMinutes}$ (satisfied when technician transitions ticket to `RESOLVED`).

---

### 4.3 Incident Lifecycle State Transition Rules
The incident lifecycle follows strict finite state machine rules:

```
[ NEW ] ─────────────────────────► [ ASSIGNED ]
                                        │
                                        ▼
                                 [ ACKNOWLEDGED ]
                                        │
                                        ▼
                                 [ IN_PROGRESS ] ◄── (Reopened if verification fails)
                                        │
                                        ▼
                                  [ RESOLVED ]
                                        │
                                        ▼
                                  [ VERIFIED ]
                                        │
                                        ▼
                                   [ CLOSED ]  (Terminal State)
```

1. **`NEW`:** Incident is created by Employee or Admin. Unassigned.
2. **`ASSIGNED`:** Assigned to a specific technician via manual or Strategy dispatch.
3. **`ACKNOWLEDGED`:** Assigned technician formally acknowledges receipt before response deadline.
4. **`IN_PROGRESS`:** Technician is actively diagnosing and mitigating the root cause.
5. **`RESOLVED`:** Technician has implemented remediation and provided a resolution summary.
6. **`VERIFIED`:** Reporting employee verifies that service functionality is completely restored.
7. **`CLOSED`:** Administrator performs final review, confirms audit completeness, and archives ticket.

**Terminal State Constraint:** Once an incident enters `CLOSED`, its state cannot be modified, re-opened, or deleted.

---

### 4.4 Automated Assignment Strategy Rules
When an administrator triggers automated assignment, the selected strategy determines candidate ranking:

1. **Skill-Based Strategy (`SKILL_BASED`):**
   - Calculates the Jaccard keyword overlap between the incident's category, service, and description vs. technician `skills` array.
   - Filters out technicians where `available == false` or `activeIncidentCount >= maxWorkload`.
   - Selects the technician with the highest skill match score.
2. **Load-Based Strategy (`LOAD_BASED`):**
   - Evaluates current capacity utilization ratio: $\text{Ratio} = \frac{\text{activeIncidentCount}}{\text{maxWorkload}}$.
   - Selects the eligible technician with the lowest workload utilization ratio.
3. **Round-Robin Strategy (`ROUND_ROBIN`):**
   - Maintains an in-memory rotating index across the available technician directory.
   - Rotates sequentially $(i + 1) \pmod N$, skipping unavailable or maxed-out technicians.
4. **Experience-Based Strategy (`EXPERIENCE_BASED`):**
   - Ranks available technicians by years of professional tenure (`experienceYears` descending).
   - Ideal for complex P1/P2 database or network infrastructure incidents.

---

### 4.5 SLA Escalation Chain & Watchdog Rules
The SLA Watchdog daemon evaluates open tickets at regular intervals:

1. **Response SLA Breach:**
   - Condition: Current time exceeds `responseDeadline` while `acknowledgedAt` is null.
   - Action: `slaBreachedResponse` set to `true`.
   - Escalation Progression:
     - `TECHNICIAN` $\rightarrow$ `TEAM_LEAD`
     - `TEAM_LEAD` $\rightarrow$ `SYSTEM_ADMIN`
     - `SYSTEM_ADMIN` $\rightarrow$ `IT_MANAGER`
2. **Resolution SLA Breach:**
   - Condition: Current time exceeds `resolutionDeadline` while status is not `RESOLVED`, `VERIFIED`, or `CLOSED`.
   - Action: `slaBreachedResolution` set to `true`. Immediate escalation directly to `IT_MANAGER`.
3. **Notification Broadcast:** An `SLA_BREACHED` event is broadcast via the `IncidentEventBus`, notifying the technician, team lead, and operations dashboard via real-time SSE stream.
