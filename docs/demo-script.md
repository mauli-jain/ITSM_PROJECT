# I-ITSM Evaluator Demonstration & Verification Script

This step-by-step guide is designed for course evaluators and technical reviewers to test all features, role boundaries, design patterns, and persistence capabilities.

---

## Step 1: Verification of Clean State & Persistence
1. Open the application at `http://localhost:3000`.
2. Notice the tactical mission-control dashboard displaying active incidents, service health topology, technician workload heatmaps, and streaming terminal logs.
3. Observe that incidents and operational data are loaded directly from the persistent SQLite database (`data/iitsm.db`).
4. Refresh the browser page (`F5` or `Ctrl+R`). Confirm that all incidents, counters, and states remain completely intact (no data loss).

---

## Step 2: Role-Based Authentication & Authorization (RBAC)

### A. Testing Empty / Invalid Login
1. Click the lock icon in the top right navbar to open the **ITSM Authentication Modal**.
2. Leave the fields blank and click **Verify Credentials**. Notice the form blocks submission with validation feedback.
3. Enter `admin` and an incorrect password like `wrongpass`. Click submit:
   - Notice the system responds with a generic `401 Unauthorized` (`"Invalid credentials"`).

### B. Employee Role (`sjenkins / password`)
1. Click the **Employee** preset button (`sjenkins / password`) or type credentials.
2. Click **Verify Credentials & Establish Session**.
3. Notice:
   - Active user updates to **Sarah Jenkins (Corporate Finance & Billing)**.
   - The incident table automatically filters to show **only** incidents reported by Sarah.
   - Navigate to the **Admin Console** in the sidebar: Notice the role guard displays **Access Denied (Role Guard: Admin Only)**.

---

## Step 3: Reporting an Incident & Intelligent Engines
1. As employee Sarah Jenkins, click **+ REPORT INCIDENT** in the top navigation bar.
2. In the Title field, type: `Database connection pool exhaustion and deadlocks`.
3. In the Description field, type: `PostgreSQL connection pool is exhausted, queries timing out on primary replica node`.
4. Observe the Intelligent Engines firing in real time:
   - **Category Suggestion:** Auto-detects `Database` category based on keywords (`database`, `postgresql`, `deadlock`).
   - **Priority Calculator:** Calculates Priority `P2` or `P1` based on service criticality and affected user count.
   - **Duplicate Detection (Jaccard similarity):** Scans open tickets for overlapping n-grams.
5. Click **Submit Incident Report**.
6. The incident is saved into SQLite and appears immediately in the incident list.

---

## Step 4: Administrator Dispatch (GoF Strategy Pattern)
1. Switch user to **Alexander Vance (Admin)** via the user selector or login (`admin / admin123`).
2. Open the newly reported ticket to view the **Incident Details Modal**.
3. Scroll to the **Strategy Pattern Dispatch Engine** section.
4. Click between the 4 available strategies:
   - `1. Skill-Based`: Evaluates technician skill keywords against incident category.
   - `2. Load-Based`: Selects the operator with lowest active workload percentage.
   - `3. Round-Robin`: Deterministically rotates across available engineers.
   - `4. Tenure-Based`: Selects the most senior available engineer.
5. Click **[ ⌖ Execute Skill-Based Dispatch ]**:
   - The engine automatically selects the optimal technician (e.g. `Mauli Jain` or `Alex Database`).
   - Incident status transitions to `ASSIGNED`.
   - The technician assignment and rationale are recorded in the immutable audit trail.

---

## Step 5: State Machine Lifecycle Progression
1. In the Incident Details modal, observe the **Permitted State Transitions from ASSIGNED**:
2. Click **Try Illegal Transition (NEW → CLOSED)** if in initial state or attempt forbidden jump:
   - The system intercepts the transition with `InvalidStateTransitionException` (409 Conflict).
3. Switch session to the assigned technician (`dross / password`).
4. Click **Advance to ACKNOWLEDGED**: status moves to `ACKNOWLEDGED`.
5. Click **Advance to IN_PROGRESS**: status moves to `IN_PROGRESS`.
6. Add a diagnostic note in the **Technician Investigation Notes** box:
   - Type: `Re-indexed pg_stat_activity and doubled pool capacity`.
   - Click **Add Diagnostic Note**: note appears with operator name and timestamp.
7. Click **Advance to RESOLVED**: provide resolution summary.
8. Switch session back to reporter **Sarah Jenkins (`sjenkins`)**:
   - Sarah now sees the **Advance to VERIFIED** button enabled.
   - Click **Advance to VERIFIED**: resolution confirmed by reporter.
9. Switch session to **Administrator (`admin`)**:
   - Administrator now has the authority to click **Advance to CLOSED**.
   - Incident transitions to immutable `CLOSED` terminal state.

---

## Step 6: Multi-Channel Observer & SLA Watchdog Daemon
1. Click the notification bell in the navbar to open the **Observer Notifications** popover.
2. Observe entries from:
   - `IN_APP`: Real-time lifecycle state updates.
   - `EMAIL`: Formatted email notifications dispatched to technician and reporter addresses.
   - `SMS`: High-priority SMS pager alerts for P1/P2 incidents.
3. Every 30 seconds, the server SLA daemon checks active deadlines and logs warnings/escalations if deadlines elapse.
