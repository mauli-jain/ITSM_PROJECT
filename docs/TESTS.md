# I-ITSM Test Suite Documentation

**Total Tests:** 51 Passing (100%)  
**Domain OOP Tests:** 21 (`test/itsm.test.ts`)  
**API Integration & Security Tests:** 30 (`test/api.test.ts`)  
**Status:** All 51 Passed  
**Framework:** Vitest v5 + Supertest + v8 Coverage Engine  

### Test Categories Defined
Every test in the test suite is classified into one of the following canonical categories:
- **Normal:** Standard, expected workflows operating within normal parameters.
- **Boundary:** Threshold testing at limits (e.g. maximum workload saturation, large numeric boundaries, rate limit edges).
- **Invalid Input:** Malformed requests, empty fields, bad schema formats rejected by validation layers.
- **Exception:** System and domain errors triggered by illegal states, invalid operations, or missing credentials.
- **Authorization:** Role-Based Access Control (RBAC), least privilege filtering, permission gates, and token verification.
- **Business Rule:** Core domain logic including SLA calculations, watchdog escalation, duplicate matching algorithms, and assignment strategy heuristics.

---

## 1. Domain & OOP Test Suite (`test/itsm.test.ts` — 21 Tests)

| # | Test Name | Category | Target Class / Component | Precondition | Test Input | Expected Behavior / Assertions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | User polymorphism & permissions | `Authorization` | `UserEntity` hierarchy (`EmployeeUser`, `TechnicianUser`, `AdministratorUser`) | Clean instance creation | Calling role query methods (`canAssignTechnicians`, `canCloseIncident`, `canVerifyIncident`) | Admin can assign and close; employee can verify; technician cannot assign |
| **2** | Workload capacity tracking | `Boundary` | `TechnicianUser` | Initial capacity: max 5 | Increment workload 6 times, then decrement | Returns `hasCapacity() === false` at 6; returns `true` after decrementing back to 5 |
| **3** | Incident full lifecycle | `Normal` | `IncidentEntity`, `IncidentState` | Incident initialized in `NEW` | Sequential transitions: `ASSIGNED` → `ACKNOWLEDGED` → `IN_PROGRESS` → `RESOLVED` → `VERIFIED` → `CLOSED` | State pattern advances successfully; records timestamps and audit entries |
| **4** | Illegal direct transition guard | `Exception` | `IncidentState` | Incident in `NEW` state | Calling `inc.closeIncident()` | Throws `InvalidStateTransitionException` |
| **5** | Terminal state immutability | `Exception` | `ClosedState` | Incident in `CLOSED` state | Calling `inc.startProgress()` | Throws `InvalidStateTransitionException` |
| **6** | Employee assignment prohibition | `Authorization` | `IncidentEntity` | Incident in `NEW` state | Calling `inc.assignByAdmin(employee, ...)` | Throws `UnauthorizedOperationException` |
| **7** | Employee closure prohibition | `Authorization` | `IncidentEntity` | Incident in `VERIFIED` state | Calling `inc.closeIncident(employee, ...)` | Throws `UnauthorizedOperationException` |
| **8** | Skill-Based dispatch strategy | `Business Rule` | `SkillBasedAssignmentStrategy` | 3 sample technicians (DBA, Network, Lead) | Incident with category "Database" & description "PostgreSQL" | Selects Technician `T1` (Alice Database) with highest skill overlap |
| **9** | Load-Based dispatch strategy | `Business Rule` | `LoadBasedAssignmentStrategy` | `T1` (20% load), `T2` (60% load) | General Network incident | Selects Technician `T1` having lower active incident load ratio |
| **10** | Experience-Based strategy | `Business Rule` | `ExperienceBasedAssignmentStrategy` | `T1` (8 yrs), `T2` (3 yrs), `T3` (10 yrs, unavailable) | Cloud latency incident | Selects Technician `T1` (longest tenured available operator) |
| **11** | Round-Robin rotation strategy | `Normal` | `RoundRobinAssignmentStrategy` | Available techs `T1`, `T2` | Two sequential incident assignments | Assigns consecutive calls to distinct technicians in rotating order |
| **12** | Strategy Context dynamic swap | `Normal` | `AssignmentStrategyContext` | Initial strategy: `SkillBasedAssignmentStrategy` | `context.setStrategy(new LoadBasedAssignmentStrategy())` | Swaps algorithm at runtime; updates strategy code reflection |
| **13** | Workload capacity boundary | `Boundary` | `AssignmentStrategyContext` | All candidate technicians at maximum workload or unavailable | Dispatch attempt | Returns `null` without throwing unhandled exceptions |
| **14** | Observer multi-channel broadcast | `Normal` | `IncidentEventBus`, `InAppNotificationObserver`, `EmailNotificationAdapter`, `SmsNotificationAdapter`, `AuditObserver` | All 4 adapters registered on bus | Dispatch event `SLA_BREACHED` (priority P1) | Email sent to technician email; SMS sent for P1; Audit log recorded; in-app notification recorded |
| **15** | Dynamic SLA Policy repository | `Business Rule` | `SLAPolicyRepository` | Seed SLA policies loaded | `slaRepo.findByPriority('P1')` and `('P2')` | Returns 5m response / 30m resolution for P1; 15m response / 120m resolution for P2 |
| **16** | Audit trail immutability | `Business Rule` | `IncidentEntity` | Initial incident instance | Calling `addInvestigationNote()` | Audit trail length increments; action stamped as `ADD_INVESTIGATION_NOTE` |
| **17** | Boundary affected user count | `Boundary` | `IncidentEntity` | Incident creation | `affectedUsersCount: 50000` | Stored correctly with priority `P1` |
| **18** | Multi-channel SMS suppression | `Business Rule` | `SmsNotificationAdapter` | SMS adapter listening | P4 event vs P1 event | P4 SMS is suppressed; P1 SMS is dispatched |
| **19** | Strategy algorithmic comparison | `Business Rule` | `LoadBasedAssignmentStrategy` vs `ExperienceBasedAssignmentStrategy` | Junior (0% load, 1 yr exp) vs Senior (50% load, 15 yrs exp) | Same incident input | Load-based selects Junior; Experience-based selects Senior |
| **20** | Custom SLA Policy repository CRUD | `Normal` | `SLAPolicyRepository` | Fresh repository | Saving custom VIP policy with 2m response target | Query returns custom policy with response target <= 5m |
| **21** | User identity validation | `Invalid Input` | `UserEntity` | Constructor call | Empty string passed for ID | Throws error rejecting empty constructor attributes |

---

## 2. API Integration & Security Test Suite (`test/api.test.ts` — 23 Tests)

| # | Test Name | Category | HTTP Method & Route | Precondition / Headers | Request Body | Expected HTTP Status & Assertions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Rejection of empty credentials | `Invalid Input` | `POST /api/auth/login` | None | `{ username: '', password: '' }` | `422 Unprocessable Entity`; validation error details returned |
| **2** | Rejection of invalid password | `Exception` | `POST /api/auth/login` | None | `{ username: 'admin', password: 'wrong_password_999' }` | `401 Unauthorized`; generic error message `"Invalid credentials"`; no token issued |
| **3** | Valid credential login | `Normal` | `POST /api/auth/login` | None | `{ username: 'admin', password: 'admin123' }` | `200 OK`; signed JWT issued; user object returned; `passwordHash` strictly omitted |
| **4** | Unauthenticated route guard | `Authorization` | `GET /api/incidents` | No `Authorization` header | None | `401 Unauthorized`; message indicates missing token |
| **5** | Tampered token rejection | `Authorization` | `GET /api/incidents` | `Authorization: Bearer invalid.forged.token` | None | `401 Unauthorized`; token verification fails |
| **6** | Employee RBAC incident filter | `Authorization` | `GET /api/incidents` | `Authorization: Bearer <employeeToken>` | None | `200 OK`; every returned incident has `reporterId === 'EMP101'` |
| **7** | Technician RBAC incident filter | `Authorization` | `GET /api/incidents` | `Authorization: Bearer <technicianToken>` | None | `200 OK`; every returned incident has `assignedTechnicianId === 'T101'` |
| **8** | Administrator unrestricted access | `Authorization` | `GET /api/incidents` | `Authorization: Bearer <adminToken>` | None | `200 OK`; returns all incidents across the organization |
| **9** | Employee assignment prohibition | `Authorization` | `POST /api/incidents/INC1001/assign` | `Authorization: Bearer <employeeToken>` | `{ strategyCode: 'SKILL_BASED' }` | `403 Forbidden`; error indicates administrator role required |
| **10** | Employee closure prohibition | `Authorization` | `POST /api/incidents/INC1001/transition` | `Authorization: Bearer <employeeToken>` | `{ targetState: 'CLOSED', note: 'Attempt close' }` | `403 Forbidden`; only administrators can close incidents |
| **11** | Server State Machine illegal jump rejection | `Exception` | `POST /api/incidents/:id/transition` | `Authorization: Bearer <adminToken>` | `{ targetState: 'CLOSED' }` on incident in `NEW` state | `409 Conflict`; `name === 'InvalidStateTransitionException'` |
| **12** | Admin Strategy Pattern dispatch | `Business Rule` | `POST /api/incidents/:id/assign` | `Authorization: Bearer <adminToken>` | `{ strategyCode: 'SKILL_BASED' }` | `200 OK`; incident status moves to `ASSIGNED`; assigned technician and rationale returned |
| **13** | Technician full lifecycle progression | `Normal` | `POST /api/incidents/:id/transition` | `Authorization: Bearer <technicianToken>` | Sequential calls: `ACKNOWLEDGED` → `IN_PROGRESS` → `RESOLVED` | `200 OK` on each call; status accurately transitions through state pattern |
| **14** | Diagnostic investigation note audit entry | `Normal` | `POST /api/incidents/INC1001/notes` | `Authorization: Bearer <technicianToken>` | `{ note: 'Inspected port flaps on switch core-01' }` | `200 OK`; note appended; audit trail contains timestamped entry |
| **15** | Zod payload schema validation | `Invalid Input` | `POST /api/incidents` | `Authorization: Bearer <adminToken>` | Malformed: title < 3 chars, negative users | `422 Unprocessable Entity`; field-level validation errors returned |
| **16** | Real-time SSE ticket generation | `Normal` | `POST /api/events/ticket` | `Authorization: Bearer <adminToken>` | None | `200 OK`; single-use UUID ticket returned for EventSource connection |
| **17** | Rate Limiter lockout (max 5 failed attempts) | `Boundary` | `POST /api/auth/login` | None | 5 consecutive bad login requests | `429 Too Many Requests`; returns generic message without disclosing username existence |
| **18** | Least privilege field redaction & password privacy | `Authorization` | `GET /api/users` & `GET /api/technicians` | `Authorization: Bearer <employeeToken>` vs `<adminToken>` | None | Employees receive only `{ id, fullName }`; admins receive full details; `passwordHash` stripped for all |
| **19** | Dynamic SLA deadline calculations for P1-P4 | `Business Rule` | `POST /api/incidents` | `Authorization: Bearer <adminToken>` | Tickets for priorities P1, P2, P3, P4 | `201 Created`; verifies response and resolution deadlines computed according to policy |
| **20** | SLA watchdog overdue detection and auto-escalation | `Business Rule` | `runSlaWatchdogPass()` via server core | Overdue ticket in database (`responseDeadline` in past) | Trigger watchdog daemon | `slaBreachedResponse === true`; escalationLevel promoted from `TECHNICIAN` to `TEAM_LEAD` |
| **21** | Duplicate incident detection (Jaccard similarity) | `Business Rule` | `POST /api/incidents/detect-duplicates` | `Authorization: Bearer <adminToken>` | Correlated problem statement sharing affected service | `200 OK`; returns matching incident with similarity score > 20% and shared keywords |
| **22** | Strategy dispatch across all 4 algorithms | `Business Rule` | `POST /api/incidents/:id/assign` | `Authorization: Bearer <adminToken>` | `strategyCode`: `SKILL_BASED`, `LOAD_BASED`, `ROUND_ROBIN`, `EXPERIENCE_BASED` | `200 OK` across all four strategies; returns valid assigned technician and rationale |
| **23** | Storage persistence across database re-instantiation | `Normal` | `initSqlJs()` re-read from `data/iitsm.db` | Incident saved and flushed to disk | Load fresh `SQL.Database` from file buffer | Querying new instance returns the newly inserted incident record intact |
| **24** | Rejection of invalid user role | `Invalid Input` | `POST /api/users` | `Authorization: Bearer <adminToken>` | `{ role: 'SUPER_ADMIN', ... }` | `422 Unprocessable Entity`; Zod validation error on `role` field |
| **25** | Rejection of password < 8 characters | `Invalid Input` | `POST /api/users` | `Authorization: Bearer <adminToken>` | `{ password: 'short', ... }` | `422 Unprocessable Entity`; Zod validation error on `password` field |
| **26** | Mass-assignment protection for passwordHash & id | `Authorization` | `POST /api/users` | `Authorization: Bearer <adminToken>` | `{ passwordHash: 'evil', id: 'FORGED', ... }` | `201 Created`; server ignores forged id/hash and sets genuine bcrypt hash |
| **27** | Admin entity schema validation | `Invalid Input` | `POST /api/services`, `POST /api/sla-policies` | `Authorization: Bearer <adminToken>` | Malformed enums / negative integers | `422 Unprocessable Entity`; field-level Zod errors returned |
| **28** | AI category suggestion with fallback provider | `Business Rule` | `POST /api/ai/suggest-category` | `Authorization: Bearer <employeeToken>` | Problem description payload | `200 OK`; returns suggested category, confidence, and rationale via fallback |
| **29** | AI resolution suggestion using resolved context | `Business Rule` | `POST /api/ai/suggest-resolution` | `Authorization: Bearer <technicianToken>` | Problem description payload | `200 OK`; returns actionable resolution guidance and confidence |
| **30** | AI per-user rate limit (max 20 calls/min) | `Boundary` | `POST /api/ai/suggest-category` | `Authorization: Bearer <technicianToken>` | 21 consecutive requests | 20 requests return 200; 21st request returns `429 Too Many Requests` |
| **31** | AI resolution suggestion role restriction | `Authorization` | `POST /api/ai/suggest-resolution` | `Authorization: Bearer <employeeToken>` vs `<adminToken>` | Problem description payload | `403 Forbidden` for employee role; `200 OK` for technician and admin roles |

