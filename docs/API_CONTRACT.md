# SwiftCare Backend — API Route Contract

**Version:** v1 · **Status:** 🔒 LOCKED

This is the single specification that all four backend lanes, the frontend, and mobile build against. The architecture is closed; the remaining work is implementation.

> **Changing this contract:** any shape change lands here first, via PR, and only then in code.

**Stack:** Node.js · Express · PostgreSQL · Sequelize
**Home:** `docs/API_CONTRACT.md`

---

## Table of contents

- [Conventions](#conventions)
- [Shared enums](#shared-enums)
- [Error code catalog](#error-code-catalog)
- [Resource ownership](#resource-ownership)
- [Queue rulebook](#queue-rulebook)
- [Duplicate patient handling](#duplicate-patient-handling)
- [Routes](#routes)
  - [1. Auth & accounts](#1-auth--accounts--lane-1-shaibu)
  - [2. Patients](#2-patients--lane-2-victor)
  - [3. Appointments & check-in](#3-appointments--check-in--lane-2-victor)
  - [4. Queue](#4-queue--lane-1-shaibu-shared)
  - [5. Vitals](#5-vitals--lane-3-emmanuel-alliu)
  - [6. Consultations & prescriptions](#6-consultations--prescriptions--lane-3-emmanuel-alliu)
  - [7. Billing & payments](#7-billing--payments--lane-4-emmanuel-dosumu)
  - [8. Dashboard & admin](#8-dashboard--admin--lane-4-emmanuel-dosumu)

---

## Conventions

### Authentication

Every route requires an `Authorization: Bearer <token>` header, except:

- `POST /auth/clinic/signup`
- `POST /auth/login`
- `POST /auth/accept-invite`

The role gate reads from the token. This is the **one shared permission check** — do not re-implement it per lane.

**JWT payload** (exact keys every middleware reads; no PII):

```json
{
  "sub": "<userId>",
  "clinicId": "<clinicId>",
  "role": "doctor",
  "iat": 0,
  "exp": 0
}
```

### Clinic scoping

Every request is auto-scoped to the token's `clinicId`. No cross-clinic access.

### Response envelope

```jsonc
// Success
{ "success": true, "data": {} }

// Error
{ "success": false, "error": { "code": "...", "message": "..." } }
```

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | OK |
| `201` | Created |
| `400` | Validation error |
| `401` | Unauthenticated |
| `403` | Role not permitted |
| `404` | Not found |
| `409` | Conflict |

### IDs

UUIDs throughout. All records from one visit share a `queueEntryId` — **the queue entry is the visit**.

The database enforces objective facts only: unique `id`, unique `queueEntryId`, valid foreign keys, required fields. There is **no uniqueness constraint on patient identity** — see [Duplicate patient handling](#duplicate-patient-handling).

### Pagination

`page=1`, `limit=20`, max `limit=100`. Every list response returns `total`.

### Search

- **Name** — partial and case-insensitive (`ILIKE`).
- **Phone** — run through the shared normalizer before comparing. It lives in `utils` and is the same for all lanes.

### One active visit per patient

Active = any status except `Completed` or `Cancelled`. `POST /queue/check-in` returns `409 QUEUE_ALREADY_CHECKED_IN` when the patient already has an active visit.

---

## Shared enums

Backed by a single `constants.js`.

| Enum | Values |
| --- | --- |
| Queue status | `Checked-In` · `Triage Ready` · `Awaiting Doctor` · `In Consultation` · `Awaiting Payment` · `Completed` |
| Role | `admin` · `receptionist` · `nurse` · `doctor` · `cashier` |
| Payment method | `cash` · `mobile_money` · `insurance` |
| Appointment status | `Scheduled` · `Cancelled` · `Completed` |
| Invoice status | `Pending` · `Paid` |
| Staff status | `invited` · `active` |

---

## Error code catalog

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Bad or missing fields |
| `UNAUTHENTICATED` | 401 | No or invalid token |
| `FORBIDDEN_ROLE` | 403 | Role not allowed |
| `INVITE_NOT_ACCEPTED` | 403 | Login attempted before the invite was accepted |
| `NOT_FOUND` | 404 | Resource missing |
| `DUPLICATE_PATIENT` | 409 | Possible phone match, awaiting confirmation |
| `QUEUE_ILLEGAL_TRANSITION` | 409 | Move is not in the rulebook |
| `QUEUE_ALREADY_CHECKED_IN` | 409 | Patient already has an active visit |
| `INVOICE_ALREADY_PAID` | 409 | Double payment blocked |
| `PAYMENT_NOT_DUE` | 409 | Patient is not at `Awaiting Payment` |

---

## Resource ownership

| Resource | Owner |
| --- | --- |
| Auth & accounts (incl. `GET /staff/doctors`) | Lane 1 — Shaibu |
| Queue + state machine (shared; called by every lane) | Lane 1 — Shaibu |
| Patients · Appointments & check-in | Lane 2 — Victor |
| Vitals · Consultations & prescriptions | Lane 3 — Emmanuel Alliu |
| Billing & payments · Dashboard & audit | Lane 4 — Emmanuel Dosumu |

---

## Queue rulebook

`POST /queue/:queueId/status` is the **only** way a status changes.

| From | To | Role |
| --- | --- | --- |
| `Checked-In` | `Triage Ready` | Nurse |
| `Triage Ready` | `Awaiting Doctor` | Nurse |
| `Awaiting Doctor` | `In Consultation` | Doctor |
| `In Consultation` | `Awaiting Payment` | Doctor (automatic on consult complete) |
| `Awaiting Payment` | `Completed` | Cashier (automatic on payment) |

No backward moves, no skipping. `admin` overrides any transition.

Violations return `409 QUEUE_ILLEGAL_TRANSITION` or `403 FORBIDDEN_ROLE`.

---

## Duplicate patient handling

> 🔒 **LOCKED.** This is an application-level workflow, not a database uniqueness rule.

No natural key uniquely identifies a person — twins, Jr./Sr., shared household phones, and spelling variants all break it. So the database enforces objective facts only, and v1 carries **no uniqueness constraint on patient identity**.

On registration, the backend searches for possible matches — primarily by normalized phone plus demographic signals — and returns them for receptionist confirmation. Confirming creates a new patient record even when the phone is shared.

Because there is no DB backstop, **normalization is load-bearing**: every lane must normalize identically via the shared utils.

Concurrent-duplicate protection (a short-lived, phone-scoped registration lock) is deferred post-MVP. Residual duplicates are handled administratively.

**Flow**

1. Receptionist submits the new patient.
2. Backend runs the phone match.
3. On a hit → `409 DUPLICATE_PATIENT` with `{ existingPatients: [...], requiresConfirmation: true }`.
4. Frontend asks the receptionist to confirm.
5. Resend with `confirmNewPatient: true` → patient created.

---

## Routes

Legend: **MUST** = ships in v1 · **DEFER** = post-MVP.

### 1. Auth & accounts — Lane 1 (Shaibu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `POST` | `/auth/clinic/signup` | MUST | Public |
| `POST` | `/auth/login` | MUST | Public |
| `POST` | `/auth/invite` | MUST | `admin` |
| `POST` | `/auth/accept-invite` | MUST | Public (invite token) |
| `GET` | `/auth/me` | MUST | Any signed-in user |
| `GET` | `/users` | MUST | `admin` |
| `GET` | `/staff/doctors` | MUST | `receptionist`, `nurse`, `admin` |

**`POST /auth/clinic/signup`**
Body `{ clinicName, address, email, password }` → `{ token, clinic, user: { role: "admin" } }`

**`POST /auth/login`**
Body `{ email, password }` → `{ token, user }`
`403 INVITE_NOT_ACCEPTED` if the staff member is still `invited`.

**`POST /auth/invite`**
Body `{ name, email, role }` → staff record with `status: "invited"` plus an `inviteLink`.

**`POST /auth/accept-invite`**
Body `{ inviteToken, password }` → `{ token, user }`. Moves the staff member `invited` → `active`.

**`GET /auth/me`** → `{ id, name, role, clinicId }`

**`GET /users`**
Query `?role=&status=&page=&limit=` → `{ users, total }`

**`GET /staff/doctors`** → `{ doctors: [{ id, name }] }`

---

### 2. Patients — Lane 2 (Victor)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/patients` | MUST | All staff |
| `GET` | `/patients/:id` | MUST | All staff |
| `POST` | `/patients` | MUST | `receptionist`, `admin` |
| `PUT` | `/patients/:id` | MUST | `receptionist`, `admin` |

**`GET /patients`**
Query `?search=&page=&limit=` → `{ patients, total }`

**`POST /patients`**
Body `{ firstName, lastName, phone, gender, dob, confirmNewPatient? }` → `201`
`409 DUPLICATE_PATIENT` with candidate matches — see [Duplicate patient handling](#duplicate-patient-handling).

---

### 3. Appointments & check-in — Lane 2 (Victor)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `POST` | `/appointments` | MUST | `receptionist`, `admin` |
| `PUT` | `/appointments/:id` | DEFER | Reschedule |
| `DELETE` | `/appointments/:id` | DEFER | Cancel (soft delete) |
| `POST` | `/queue/check-in` | MUST | `receptionist`, `admin` |

**`POST /appointments`**
Body `{ patientId, doctorId, date, time }` → appointment with `status: "Scheduled"`

**`POST /queue/check-in`**
Body `{ patientId, appointmentId?, assignedDoctorId }` → `201 { queueId, status: "Checked-In" }`
`409 QUEUE_ALREADY_CHECKED_IN` if the patient already has an active visit.

---

### 4. Queue — Lane 1 (Shaibu, shared)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/queue` | MUST | All staff |
| `POST` | `/queue/:queueId/status` | MUST | Per [queue rulebook](#queue-rulebook) |

**`GET /queue`**
Query `?status=&assignedDoctorId=` → `{ queue: [...] }`

**`POST /queue/:queueId/status`**
Body `{ status, note? }` → `{ queueId, status, lastUpdatedBy }`

- Keyed on `queueId` — the visit.
- The optional free-text field is `note`. It is a single field and it is **never** named `reason`.

---

### 5. Vitals — Lane 3 (Emmanuel Alliu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `POST` | `/vitals` | MUST | `nurse` |
| `GET` | `/vitals/:patientId` | MUST | `nurse`, `doctor`, `admin` |

**`POST /vitals`**
Body `{ queueEntryId, patientId, bpSystolic, bpDiastolic, temperature, weight }` → `201`
Response includes `recordedBy` and `recordedAt`.

**`GET /vitals/:patientId`**
Query `?queueEntryId=`

---

### 6. Consultations & prescriptions — Lane 3 (Emmanuel Alliu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `POST` | `/consultations` | MUST | `doctor` |
| `POST` | `/consultations/:id/complete` | MUST | `doctor` |
| `GET` | `/consultations/:patientId` | MUST | `doctor`, `nurse` (read), `admin` |

**`POST /consultations`**
Body `{ queueEntryId, patientId }` → consultation with `status: "in_progress"`

**`POST /consultations/:id/complete`**
Body:

```jsonc
{
  "notes": "...",
  "diagnosis": "...",
  "prescriptions": [
    { "drugName": "...", "dosage": "...", "frequency": "...", "duration": "..." }
  ]
}
```

Response `{ consultation, invoice, queueStatus }`

Runs as **one transaction**: writes notes + diagnosis, writes prescriptions, creates the invoice (flat fee), and moves the queue entry to `Awaiting Payment`.

**`GET /consultations/:patientId`**
Query `?queueEntryId=`

---

### 7. Billing & payments — Lane 4 (Emmanuel Dosumu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/invoices/:patientId` | MUST | `cashier`, `doctor` (read), `admin` |
| `POST` | `/payments` | MUST | `cashier` |
| `GET` | `/payments/history` | MUST | `cashier`, `admin` |

**`GET /invoices/:patientId`**
Query `?queueEntryId=`

**`POST /payments`**
Body `{ invoiceId, method }` — **no `amount`**; the backend reads the invoice total.
Response `{ payment, receipt, queueStatus }`

Runs as one transaction with the invoice row locked, and moves the queue entry to `Completed`. The receipt is **data, not a PDF**.

Errors: `409 INVOICE_ALREADY_PAID` · `409 PAYMENT_NOT_DUE`

**`GET /payments/history`**
Query `?date=&method=&page=&limit=`

---

### 8. Dashboard & admin — Lane 4 (Emmanuel Dosumu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | DEFER | `admin` |
| `GET` | `/audit-logs` | DEFER | `admin` |

**`GET /dashboard`** → `{ patientCount, revenue, queueBottlenecks }`
