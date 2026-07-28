# SwiftCare Backend: API Route Contract

**Version:** v1.0.0

SwiftCare is a clinic management system. This document describes the API that its web app and mobile app both call.

The API covers a patient's whole visit. A clinic signs up and gets an admin account, then invites its staff: receptionists, nurses, doctors, and cashiers. What each person can do depends on their role, and the server checks that on every request.

A visit moves through a queue in a fixed order. A receptionist registers the patient and checks them in. A nurse records vitals and marks the patient ready. A doctor runs the consultation and prescribes medication, which creates an invoice. A cashier takes payment, which closes the visit. The server refuses to skip steps, and refuses to let the wrong role move a visit forward.

Everything is scoped to one clinic. A request can only ever see and change data belonging to the clinic of the person making it.

This document is the single specification that all four backend lanes, the frontend, and mobile build against. The design is settled; what remains is writing the code.

> **Changing this contract:** any change to a URL, field name, or response shape goes here first, in its own pull request, and only then into the code.

**Stack:** Node.js · Express · PostgreSQL · Sequelize
**Home:** `docs/API_CONTRACT.md`

---

## Table of contents

- [Getting started](#getting-started)
  - [Base URL](#base-url)
  - [Authentication flow](#authentication-flow)
  - [Worked example: a full patient journey](#worked-example-a-full-patient-journey)
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

## Getting started

New to this API? Read this section top to bottom, then use the route sections below as reference. Everything here is traceable to a file in the repo or a section further down.

### Base URL

Local development server:

```
http://localhost:4000/api
```

- **Port `4000`** comes from `PORT` in `.env.example`. If you override `PORT` in your own `.env`, substitute it.
- **Prefix `/api`** comes from `app.use('/api', routes)` in `src/app.js`. Every route in this contract is mounted under it.

**The rule:** take any `METHOD /path` from the route sections below and prepend the base URL.

> `POST /auth/login` (section 1)  →  `POST http://localhost:4000/api/auth/login`

### Authentication flow

Every route needs a token except the three public ones ([Authentication](#authentication)). If you've never used a JWT, follow these four steps and you'll be able to call a protected endpoint.

1. **Get a token.** Pick one of three, depending on who you are:
   - `POST /auth/clinic/signup`: you're setting up a brand-new clinic; this creates the first `admin`. (Section 1)
   - `POST /auth/login`: you already have an account. (Section 1)
   - `POST /auth/accept-invite`: you were invited and are setting your password for the first time. (Section 1)

   Each returns a response whose `data` contains a `token`, a long string of characters.

2. **Store the token.** Keep the `data.token` string on the client.
   You don't decode it or read anything out of it. The server does that.

3. **Attach it to every subsequent request** as a header, exactly this shape (from [Conventions → Authentication](#authentication)):

   ```
   Authorization: Bearer <token>
   ```

4. **When it's missing, malformed, or expired**, the server replies `401 UNAUTHENTICATED` (from the [error catalog](#error-code-catalog)). There's no refresh endpoint in v1. Get a fresh token by calling `POST /auth/login` again.

### Worked example: a full patient journey

One happy path, front to back: **register a patient → check them in → record vitals → advance the queue → run and complete a consultation → take payment.**

Every field name below is copied exactly from the route sections (2, 3, 4, 5, 6, 7). If an example and a route section ever disagree, the route section is correct and the example needs fixing. IDs chain forward: each response hands you the ID the next request needs. Every call below can be pasted in order and run. Nothing is skipped or only described afterward.

All calls need `Authorization: Bearer <token>` (see above). The header is shown once, then omitted for brevity.

**Step 1. Register the patient** · `POST /patients` (section 2) · role: `receptionist`

```http
POST http://localhost:4000/api/patients
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Ada",
  "lastName": "Okafor",
  "phone": "08031234567",
  "gender": "female",
  "dob": "1990-04-12"
}
```

```json
// 201 Created
{
  "success": true,
  "data": {
    "id": "pat_3f2a…",   // this is the patientId used everywhere below
    "firstName": "Ada",
    "lastName": "Okafor",
    "phone": "08031234567",
    "gender": "female",
    "dob": "1990-04-12"
  }
}
```

**Step 2. Check the patient in** · `POST /queue/check-in` (section 3) · role: `receptionist`

`assignedDoctorId` is a doctor's `id` from `GET /staff/doctors` (section 1). `appointmentId` is optional and omitted here.

```json
{
  "patientId": "pat_3f2a…",        // from step 1
  "assignedDoctorId": "usr_doc_77…"
}
```

```json
// 201 Created
{
  "success": true,
  "data": {
    "queueId": "q_9b8c…",   // the visit, same value as queueEntryId below
    "status": "Checked-In"
  }
}
```

**Step 3. Record vitals** · `POST /vitals` (section 5) · role: `nurse`

```jsonc
{
  "queueEntryId": "q_9b8c…",   // the queueId from step 2
  "patientId": "pat_3f2a…",    // from step 1
  "bpSystolic": 120,
  "bpDiastolic": 80,
  "temperature": 36.8,
  "weight": 72
}
```

```jsonc
// 201 Created
{
  "success": true,
  "data": {
    "queueEntryId": "q_9b8c…",
    "patientId": "pat_3f2a…",
    "bpSystolic": 120,
    "bpDiastolic": 80,
    "temperature": 36.8,
    "weight": 72,
    "recordedBy": "usr_nurse_12…",
    "recordedAt": "2026-07-22T09:15:00Z"
  }
}
```

**Step 4. Nurse advances the queue: `Checked-In` → `Triage Ready`** · `POST /queue/:queueId/status` (section 4) · role: `nurse`

```json
// POST http://localhost:4000/api/queue/q_9b8c…/status
{ "status": "Triage Ready" }
```

```json
// 200 OK
{
  "success": true,
  "data": { "queueId": "q_9b8c…", "status": "Triage Ready", "lastUpdatedBy": "usr_nurse_12…" }
}
```

**Step 5. Nurse advances the queue: `Triage Ready` → `Awaiting Doctor`** · same endpoint · role: `nurse`

```json
{ "status": "Awaiting Doctor", "note": "Vitals recorded, ready for doctor" }
```

```json
// 200 OK
{
  "success": true,
  "data": { "queueId": "q_9b8c…", "status": "Awaiting Doctor", "lastUpdatedBy": "usr_nurse_12…" }
}
```

**Step 6. Doctor advances the queue: `Awaiting Doctor` → `In Consultation`** · same endpoint · role: `doctor`

```json
{ "status": "In Consultation" }
```

```json
// 200 OK
{
  "success": true,
  "data": { "queueId": "q_9b8c…", "status": "In Consultation", "lastUpdatedBy": "usr_doc_77…" }
}
```

This is the move that puts the visit in front of the doctor per the [queue rulebook](#queue-rulebook). It's what `Awaiting Doctor` in step 6's *name* refers to, and it must happen before the consultation is started below.

**Step 7. Run the consultation** · `POST /consultations` then `POST /consultations/:id/complete` (section 6) · role: `doctor`

Completing needs a consultation `id`, so start one first:

```json
// POST http://localhost:4000/api/consultations
{
  "queueEntryId": "q_9b8c…",   // same visit
  "patientId": "pat_3f2a…"
}
```

```json
// 201 Created
{
  "success": true,
  "data": {
    "id": "cons_5d4e…",   // the :id for the complete call
    "queueEntryId": "q_9b8c…",
    "patientId": "pat_3f2a…",
    "status": "in_progress"
  }
}
```

Then complete it. This one call writes notes + diagnosis + prescriptions, creates the invoice, and advances the queue to `Awaiting Payment`, all in one transaction:

```json
// POST http://localhost:4000/api/consultations/cons_5d4e…/complete
{
  "notes": "Mild fever, advised rest and fluids.",
  "diagnosis": "Viral upper respiratory infection",
  "prescriptions": [
    { "drugName": "Paracetamol", "dosage": "500mg", "frequency": "twice daily", "duration": "5 days" }
  ]
}
```

```json
// 200 OK
{
  "success": true,
  "data": {
    "consultation": { "id": "cons_5d4e…", "status": "Completed" },
    "invoice": { "id": "inv_1a2b…", "status": "Pending" },   // invoiceId for step 8
    "queueStatus": "Awaiting Payment"
  }
}
```

**Step 8. Take payment** · `POST /payments` (section 7) · role: `cashier`

```json
{
  "invoiceId": "inv_1a2b…",   // from step 7's complete response
  "method": "cash"
}
```

```json
// 200 OK
{
  "success": true,
  "data": {
    "payment": { "id": "pay_8c7d…" },
    "receipt": { },            // data, not a PDF
    "queueStatus": "Completed"
  }
}
```

**Recap.** Steps 4–6 are what the [queue rulebook](#queue-rulebook) requires before a doctor can act on a visit. Skip them and step 7 happens out of order. The last two transitions, `Awaiting Payment` and `Completed`, are automatic side effects of steps 7 and 8. There is no separate status call for either.

---

## Conventions

### Authentication

Every route requires an `Authorization: Bearer <token>` header, except:

- `POST /auth/clinic/signup`
- `POST /auth/login`
- `POST /auth/accept-invite`

The role check reads from the token. This is the **one shared permission check**. Do not re-implement it per lane.

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

Every request is automatically limited to the clinic named in the caller's token (the `clinicId` claim above). Nobody can read or change another clinic's data.

### CORS

Browser clients must call from an allowed origin. The server reads a comma-separated allow-list from `CORS_ORIGIN` (see `.env.example`); a browser request from any other origin is rejected with `403 FORBIDDEN_ORIGIN`. Requests with no `Origin` header (server-to-server, curl, health checks) are not blocked. This only restricts browsers. It is not a login check, and it never replaces the `Authorization` header.

### Response envelope

```json
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

UUIDs throughout. All records from one visit share a `queueEntryId`. **The queue entry is the visit.**.

The database enforces objective facts only: unique `id`, unique `queueEntryId`, valid foreign keys, required fields. There is **no uniqueness constraint on patient identity**. See [Duplicate patient handling](#duplicate-patient-handling).

### Pagination

`page=1`, `limit=20`, max `limit=100`. Every list response returns `total`.

### Search

- **Name**: partial and case-insensitive.
- **Phone**: run through the shared normalizer before comparing. It lives in `utils` and is the same for all lanes.

### One active visit per patient

Active = any status except `Completed` or `Cancelled`. `POST /queue/check-in` returns `409 QUEUE_ALREADY_CHECKED_IN` when the patient already has an active visit.

---

## Shared enums

Backed by a single `constants.js`.

| Enum | Values |
| --- | --- |
| Queue status | `Checked-In` · `Triage Ready` · `Awaiting Doctor` · `In Consultation` · `Awaiting Payment` · `Completed` · `Cancelled` |
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
| `FORBIDDEN_ORIGIN` | 403 | Browser origin not in the CORS allow-list |
| `INVITE_NOT_ACCEPTED` | 403 | Login attempted before the invite was accepted |
| `NOT_FOUND` | 404 | Resource missing |
| `DUPLICATE_EMAIL` | 409 | Email already registered to a clinic or staff account |
| `DUPLICATE_PATIENT` | 409 | Possible phone match, awaiting confirmation |
| `QUEUE_ILLEGAL_TRANSITION` | 409 | Move is not in the rulebook |
| `QUEUE_ALREADY_CHECKED_IN` | 409 | Patient already has an active visit |
| `INVOICE_ALREADY_PAID` | 409 | Double payment blocked |
| `PAYMENT_NOT_DUE` | 409 | Patient is not at `Awaiting Payment` |

---

## Resource ownership

Questions about a specific area of the API? Contact the person listed. This is a directory of who to ask, not a work-assignment chart.

| Resource | Contact |
| --- | --- |
| Auth & accounts (incl. `GET /staff/doctors`) | Shaibu (Lane 1) |
| Queue and its rules (shared; called by every lane) | Shaibu (Lane 1) |
| Patients · Appointments & check-in | Victor (Lane 2) |
| Vitals · Consultations & prescriptions | Emmanuel Alliu (Lane 3) |
| Billing & payments · Dashboard & audit | Emmanuel Dosumu (Lane 4) |

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
| `Checked-In` | `Cancelled` | Receptionist (**`note` required**) |

No backward moves, no skipping. `admin` overrides any transition, except the `note` requirement. That is about record-keeping, not permission.

Violations return `409 QUEUE_ILLEGAL_TRANSITION` or `403 FORBIDDEN_ROLE`.

---

## Duplicate patient handling

> **Settled.** The app handles this in code. The database does not enforce it.

There is no single detail that reliably identifies a person. Twins share a surname and date of birth, a father and son share a name, a household shares a phone, and names get spelled differently. So the database only enforces things that are definitely true, and v1 has **no rule stopping two patient records that look alike**.

When a patient is registered, the server looks for possible matches, mainly by comparing the reformatted phone number along with details like name and date of birth, and sends them back for the receptionist to check. If the receptionist confirms it is a different person, a new record is created even though the phone number is shared.

Because the database will not catch duplicates, this formatting step carries the whole check. Every lane must format phone numbers the same way, using the shared helper.

Concurrent-duplicate protection (a short-lived, phone-scoped registration lock) is deferred post-MVP. Residual duplicates are handled administratively.

**Flow**

1. Receptionist submits the new patient.
2. Backend runs the phone match.
3. On a hit → `409 DUPLICATE_PATIENT` with `{ existingPatients: [...], requiresConfirmation: true }`.
4. Frontend asks the receptionist to confirm.
5. Resend with `confirmNewPatient: true` → patient created.

---

## Routes

In the tables below, **MUST** means it ships in v1 and **DEFER** means it comes later.

### 1. Auth & accounts · Lane 1 (Shaibu)

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

### 2. Patients · Lane 2 (Victor)

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
`409 DUPLICATE_PATIENT` with candidate matches. See [Duplicate patient handling](#duplicate-patient-handling).

---

### 3. Appointments & check-in · Lane 2 (Victor)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `POST` | `/appointments` | MUST | `receptionist`, `admin` |
| `PUT` | `/appointments/:id` | DEFER | `receptionist`, `admin` |
| `DELETE` | `/appointments/:id` | DEFER | `receptionist`, `admin` |
| `POST` | `/queue/check-in` | MUST | `receptionist`, `admin` |

**`POST /appointments`**
Body `{ patientId, doctorId, date, time }` → appointment with `status: "Scheduled"`

**`POST /queue/check-in`**
Body `{ patientId, appointmentId?, assignedDoctorId }` → `201 { queueId, status: "Checked-In" }`
`409 QUEUE_ALREADY_CHECKED_IN` if the patient already has an active visit.

---

### 4. Queue · Lane 1 (Shaibu, shared)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/queue` | MUST | All staff |
| `POST` | `/queue/:queueId/status` | MUST | Per [queue rulebook](#queue-rulebook) |

**`GET /queue`**
Query `?status=&assignedDoctorId=` → `{ queue: [...] }`

**`POST /queue/:queueId/status`**
Body `{ status, note? }` → `{ queueId, status, lastUpdatedBy }`

- Keyed on `queueId`, the visit.
- The optional free-text field is `note`. It is a single field and it is **never** named `reason`.
- `note` is **required** when moving to `Cancelled`. Omitted or blank returns `400 VALIDATION_ERROR`. Every transition is recorded with its note; `lastUpdatedBy` is `null` for an admin override, since admin is the clinic account rather than a staff member.
- `GET /queue` is not paginated. A live queue is bounded by the patients present.

---

### 5. Vitals · Lane 3 (Emmanuel Alliu)

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

### 6. Consultations & prescriptions · Lane 3 (Emmanuel Alliu)

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

### 7. Billing & payments · Lane 4 (Emmanuel Dosumu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/invoices/:patientId` | MUST | `cashier`, `doctor` (read), `admin` |
| `POST` | `/payments` | MUST | `cashier` |
| `GET` | `/payments/history` | MUST | `cashier`, `admin` |

**`GET /invoices/:patientId`**
Query `?queueEntryId=`

**`POST /payments`**
Body `{ invoiceId, method }`. **No `amount`**: the backend reads the invoice total.
Response `{ payment, receipt, queueStatus }`

Runs as one transaction with the invoice row locked, and moves the queue entry to `Completed`. The receipt is **data, not a PDF**.

Errors: `409 INVOICE_ALREADY_PAID` · `409 PAYMENT_NOT_DUE`

**`GET /payments/history`**
Query `?date=&method=&page=&limit=`

---

### 8. Dashboard & admin · Lane 4 (Emmanuel Dosumu)

| Method | Path | Priority | Access |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | DEFER | `admin` |
| `GET` | `/audit-logs` | DEFER | `admin` |

**`GET /dashboard`** → `{ patientCount, revenue, queueBottlenecks }`
