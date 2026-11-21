# I-ITSM Deliverables & Project Brief Mapping Matrix

This document maps every required deliverable and architectural component from the project brief to the corresponding implementation file, test specification, or documentation artifact in the codebase.

---

## 1. Project Deliverables Mapping Matrix

| Brief Deliverable / Component | Primary Implementation File(s) | Documentation & Verification Artifact |
| :--- | :--- | :--- |
| **Problem Analysis & Scope** | N/A (Analytical Foundation) | `docs/problem-analysis.md` |
| **System Requirements (FR & NFR)** | N/A (Specification) | `docs/requirements.md` |
| **Technology Evaluation & Trade-offs** | `src/server.ts`, `src/db/sqlite.ts` | `docs/technology-report.md` |
| **Relational Database Schema & DDL** | `src/db/sqlite.ts` | `docs/schema.sql`, `docs/er-diagram.md` |
| **Sample Data & Canonical Seed Fixtures**| `src/data/seedData.ts` | `docs/sample-data.md` |
| **Domain Object Hierarchy (Polymorphism)**| `src/domain/UserEntity.ts`, `src/domain/IncidentEntity.ts` | `docs/class-diagram.md`, `test/itsm.test.ts` (#1, #21) |
| **GoF State Pattern (Lifecycle Machine)**| `src/domain/IncidentState.ts` | `docs/state-diagram.md`, `test/itsm.test.ts` (#3-#5), `test/api.test.ts` (#11, #13) |
| **GoF Strategy Pattern (Assignment)** | `src/domain/AssignmentStrategy.ts` | `docs/technology-report.md`, `test/itsm.test.ts` (#8-#13), `test/api.test.ts` (#12, #22) |
| **GoF Observer Pattern (Multi-Channel)**| `src/domain/IncidentObserver.ts` | `docs/architecture.md`, `test/itsm.test.ts` (#14, #18) |
| **GoF Repository Pattern (DAO Layer)** | `src/domain/Repositories.ts`, `src/domain/SqliteRepositories.ts` | `docs/architecture.md`, `docs/technology-report.md` |
| **Custom Domain Exceptions** | `src/domain/Exceptions.ts` | `test/itsm.test.ts` (#4-#7) |
| **Security, Rate Limiting & Auth** | `src/server.ts` | `docs/security.md`, `test/api.test.ts` (#1-#5, #17, #18) |
| **Least Privilege & Role Redaction** | `src/server.ts` (`/api/users`, `/api/technicians`) | `docs/security.md`, `test/api.test.ts` (#6-#8, #18) |
| **SLA Watchdog Background Daemon** | `src/server.ts` (`runSlaWatchdogPass`) | `docs/requirements.md`, `test/api.test.ts` (#19, #20) |
| **Duplicate Detection Engine** | `src/utils/intelligentEngines.ts` | `docs/requirements.md`, `test/api.test.ts` (#21) |
| **Debounced Disk Persistence** | `src/db/sqlite.ts` (`data/iitsm.db`) | `docs/technology-report.md`, `test/api.test.ts` (#23) |
| **Real-time Server-Sent Events (SSE)** | `src/server.ts` (`/api/events`, `/api/events/ticket`) | `docs/architecture.md`, `test/api.test.ts` (#16) |
| **Comprehensive Test Suite (44 Tests)** | `test/itsm.test.ts`, `test/api.test.ts` | `docs/TESTS.md`, `docs/coverage.md` |
| **Interactive Demonstration Script** | N/A (Evaluator Walkthrough) | `docs/demo-script.md` |
| **Use Case Specifications** | N/A (Functional Workflows) | `docs/use-case.md` |

---

## 2. Directory Structure of Documentation Suite (`/docs`)

```
/docs
├── TESTS.md              # Complete catalog of all 44 tests with category annotations
├── architecture.md       # High-level system architecture and component interactions
├── class-diagram.md      # Mermaid class diagram illustrating entity inheritance and patterns
├── coverage.md           # Vitest v8 code coverage summary and file breakdown
├── demo-script.md        # Step-by-step evaluator testing and demonstration script
├── er-diagram.md         # Entity-Relationship diagram of SQLite database schema
├── problem-analysis.md   # Problem statement, stakeholders, challenges, solution, assumptions
├── report-outline.md     # Deliverable-to-file mapping matrix
├── requirements.md       # Numbered FRs, NFRs, user roles, and formal business rules
├── sample-data.md        # Representative database table rows and canonical fixtures
├── schema.sql            # Raw SQL DDL schema statements
├── security.md           # Threat model, authentication, encryption, and rate limiting details
├── state-diagram.md      # Mermaid state diagram of the incident lifecycle
├── technology-report.md  # Detailed answers to the 9 core technical questions and scaling path
└── use-case.md           # Formal use case specifications (Actor, Preconditions, Flows)
```
