# I-ITSM Security Architecture & Hardening Report

## 1. Threat Model & Security Boundaries

```
[ Untrusted Client ]
       |
       |  HTTPS (Bearer JWT / One-Time Ticket)
       v
+-------------------------------------------------------+
| Express Security Perimeter                            |
|  - X-Content-Type-Options: nosniff                    |
|  - X-Frame-Options: SAMEORIGIN                        |
|  - X-XSS-Protection: 1; mode=block                    |
|  - Origin-Restricted CORS                             |
+-------------------------------------------------------+
       |
       +---> [ Zod Schema Validation Guard ] (422)
       |
       +---> [ JWT Authenticate Middleware ] (401)
       |
       +---> [ Server Role Authorization Guard ] (403)
       |
       v
+-------------------------------------------------------+
| Domain & Persistence Core                             |
|  - Bcrypt Cost 10 Password Hashes                     |
|  - Parameterized SQLite Prepared Statements (SQLi-safe)|
|  - Zero plaintexts or hashes returned in API payloads |
+-------------------------------------------------------+
```

---

## 2. Authentication & Credential Storage

1. **Password Hashing:**
   - Hashed using `bcryptjs` with salt rounds = 10.
   - Salt is uniquely generated per user record upon database seeding and user provisioning.
   - Verification occurs via constant-time comparison `bcrypt.compareSync(plain, hash)` preventing timing attacks.
2. **Safe Payloads:**
   - Passwords and `passwordHash` are stripped before returning any JSON response (`const { passwordHash, ...safeUser } = user;`).
3. **Session Tokens:**
   - JSON Web Tokens (JWT) signed using HMAC-SHA256 (`HS256`).
   - Secret key loaded from environment variable `JWT_SECRET` (minimum 32 characters).
   - Strict 8-hour token expiration (`{ expiresIn: '8h' }`).
   - Token payload encapsulates `{ userId, username, role, fullName }`.

---

## 3. Server-Side Role-Based Access Control (RBAC)

The server enforces role boundaries on all endpoints; client UI claims are never trusted:

- **`GET /api/incidents`**:
  - `ROLE_EMPLOYEE`: Server filters SQL query results strictly to `reporter_id = req.user.userId`.
  - `ROLE_TECHNICIAN`: Server filters SQL query results strictly to `assigned_technician_id = req.user.userId`.
  - `ROLE_ADMIN`: Allowed to inspect all records.
- **`POST /api/incidents/:id/assign`**:
  - Guarded strictly by `requireRole(['ROLE_ADMIN'])`. Attempted invocation by employees or technicians returns HTTP 403 Forbidden.
  - The acting admin is resolved from the cryptographically verified JWT payload, not from client request inputs.
- **`POST /api/incidents/:id/transition`**:
  - `CLOSED`: Enforced admin-only (403 if called by non-admin).
  - `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED`: Enforced technician-only (403 if called by employees or unrelated technicians).
  - `VERIFIED`: Enforced reporter or admin (403 if technician attempts self-verification).

---

## 4. Input Validation & Injection Prevention

- **Zod Schemas**: Every POST/PUT route validates incoming JSON against strict schemas. Unexpected fields are stripped, non-numeric values for counts are rejected, and invalid enums are blocked with 422 Unprocessable Entity.
- **SQL Injection Prevention**: All queries to `data/iitsm.db` utilize parameterized queries (`?` placeholders) and prepared statements, completely preventing SQL injection.

---

## 5. Real-Time SSE Stream Security

- The Server-Sent Events endpoint `GET /api/events` cannot accept standard `Authorization: Bearer` headers due to browser `EventSource` API limitations.
- Instead, clients must first authenticate against `POST /api/events/ticket` with their valid JWT to acquire a short-lived (60-second), single-use cryptographic UUID ticket.
- Once connected, the ticket is instantly invalidated from server memory to prevent replay attacks.

---

## 6. AI Data Privacy & Gemini Integration

Incident descriptions are sent to the Gemini API only when a `GEMINI_API_KEY` is configured in the server environment. No passwords, emails, names, user IDs, or user records are ever included in the prompt payloads or transmitted externally. When no key is configured or when upstream API errors or rate limits occur, the server automatically and transparently falls back to an internal, deterministic rule-based provider, ensuring zero data egress and continuous service availability.

