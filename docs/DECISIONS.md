# Decision Log

Why the repo looks the way it does. One entry per decision that wasn't obvious, with the trade-off taken and what would justify revisiting it.

The locked API surface lives in [API_CONTRACT.md](API_CONTRACT.md). This file records **implementation** decisions, not contract ones. A change here is a PR. A change to the contract is a PR _there_, first.

**Started:** 2026-07-21 · **Phase:** lane work in progress — Auth and Queue live, Patients/Appointments/Check-in live, documentation live

---

## Contents

- [Repository](#repository)
- [Module system](#module-system)
- [Data layer](#data-layer)
- [Shared code](#shared-code)
- [Workflow](#workflow)
- [Verification record](#verification-record)
- [Open questions](#open-questions)
- [Deliberately deferred](#deliberately-deferred)

---

## Repository

### R1 · Backend-only repo, not a monorepo

The contract names frontend and mobile as consumers, which made a monorepo tempting.

**Chose:** a standalone `swiftcare-backend` repo.

**Trade-off:** cross-cutting changes (a contract change plus its frontend consumer) now span two repos and can't land atomically. Accepted because a monorepo adds workspace tooling that four people learning the stack in parallel would pay for daily, against a cost we pay only when the contract shifts, and the contract is locked.

### R2 · Lives at `C:\Users\User\dev\swiftcare-backend`, not under OneDrive

The planning docs sit in a OneDrive-synced Desktop folder, so that was the obvious home.

**Chose:** an unsynced path.

**Rationale:** OneDrive sync plus `node_modules` and `.git` internals is a known source of file locks, partial syncs, and corrupted git objects. The sync client fights the package manager over thousands of small files. No upside for a repo that already has remote backup via GitHub.

### R3 · Public repo under a personal account

**Trade-off:** everything is world-readable, so secret hygiene stops being a nicety. Mitigated by `.env` in `.gitignore` and an explicit post-push audit of the remote file tree (see [Verification record](#verification-record)) rather than trusting the ignore file. `.env.example` ships placeholder values only.

Cost to keep in mind: a leaked credential in a public repo is scraped within minutes. Any real secret must be rotated, never just deleted in a follow-up commit. Git history keeps it.

---

## Module system

### M1 · ESM everywhere, with deliberate CommonJS islands

`"type": "module"` in `package.json`. The exceptions are the files `sequelize-cli` loads with `require()`: `.sequelizerc`, `src/config/config.cjs`, and everything in `migrations/` and `seeders/`.

**Trade-off:** two module systems in one repo is a genuine cost, because contributors must know which rules apply where. The alternative (all CommonJS) would drop the split entirely, but ESM is where Node is going and the team should learn it. Contained by making the boundary mechanical: **if `sequelize-cli` loads it, it ends in `.cjs`.** No judgement call at the call site.

Both rules are the first thing in the README, in bold, because getting them wrong produces confusing errors rather than obvious ones.

### M2 · `.sequelizerc` must be CommonJS _(fixed a real defect)_

The original scaffold wrote `.sequelizerc` with `import path from 'path'` and `export default`.

**Failure mode, reproduced:** `sequelize-cli` never runs the command. It prints its generic help text and exits, with **no error, no stack trace, and no mention of the config file**. Anyone hitting this reasonably concludes they mistyped the command. Rewritten as `require` / `module.exports`, after which the CLI reports `Loaded configuration file "src\config\config.cjs"` and runs.

Rule 1 is bold in the README because of this: getting it wrong fails silently instead of crashing.

### M3 · Migrations are `.cjs`, renamed after generation

`sequelize-cli migration:generate` emits a `.js` file containing `module.exports`, which conflicts with `"type": "module"`.

**Tested:** on Node 22 this _silently works_. Node's automatic syntax detection sees CJS syntax and loads it as CommonJS despite the package type. On older Node it throws `ReferenceError: module is not defined`.

**Chose:** rename every generated migration to `.cjs`. The CLI's own discovery pattern is `/^(?!.*\.d\.ts$).*\.(cjs|js|cts|ts)$/`, so `.cjs` is found natively. Verified by reading the CLI source, not assumed.

**Rationale:** a scaffold that works on the machine that built it and breaks on a teammate's is worse than one that fails everywhere. `engines: node >=20` sets a floor, but the floor doesn't include syntax detection.

### M4 · Relative imports always carry the `.js` extension

Not a choice so much as a constraint ESM imposes, but recorded because it's the most common porting bug and it fails at _runtime_, so a missing extension on a rarely used route survives review and breaks in a demo.

---

## Data layer

### D1 · Explicit model registry, not the `sequelize-cli` auto-loader

The conventional `models/index.js` reads the models directory with `fs.readdirSync` + `require()`. That doesn't translate to ESM (no synchronous dynamic import).

**Chose:** import and register each model by hand in `src/models/index.js`.

**Trade-off:** every new model must be added in two places, and forgetting one produces a confusing "model not registered" failure at association time. Accepted because the alternatives (top-level `await import()` in a loop, or a build step) are more machinery than a ten-model project needs. The file has a comment marking both insertion points.

### D2 · `Patient.associate` commented out _(fixed a real defect)_

The scaffold's `Patient.associate` called `Patient.belongsTo(db.Clinic, ...)`, but no `Clinic` model exists yet and `models/index.js` runs every `associate` at import time.

**Failure mode:** the server crashes on `npm run dev`, before anyone writes a line of lane code. First-run experience for three teammates would have been an unexplained boot failure in code they didn't write.

**Chose:** comment the association with a TODO naming the exact unblocking condition (`clinic.js` exists _and_ is registered). The `associate` hook itself stays, so the pattern to copy is still visible.

### D3 · No uniqueness constraint on patient identity

Inherited from the locked contract; restated because it looks like an oversight and someone will "fix" it.

No natural key identifies a person. Twins share surname and DOB, Jr./Sr. share names, households share phones, and names have spelling variants. A unique index on `(clinicId, phone)` would block legitimate registrations at the worst possible moment: a real patient standing at the desk.

**Chose:** a **non-unique** index on `(clinicId, phone)`: fast candidate lookup, with no claim that the pair identifies one person. Duplicate detection is an application workflow returning `409 DUPLICATE_PATIENT` with candidates for receptionist confirmation.

**Trade-off:** the database will no longer stop duplicates. That responsibility moves entirely into application code, which is why [S1](#s1--one-phone-normalizer-and-why-it-matters) matters so much. It is not just a convenience helper.

### D4 · `501 NOT_IMPLEMENTED` stubs on every route

Routes are wired with real `auth` and `authorize` middleware but stub handlers.

**Rationale:** the auth and role layer is exercised from day one, and each lane's starting point is "replace the stub", not "invent the file layout". A lane owner can confirm their role gate works before writing any logic.

**Trade-off:** `501` on a mounted route is indistinguishable from a genuinely broken deployment if someone forgets what phase the project is in. The README lists what's stubbed.

### D5 · Queue transition table is data; the guard is a stub

`TRANSITIONS` is a filled-in array; `assertCanTransition()` throws `501` with a TODO enumerating the three checks (admin override → legal move → role ownership).

**Rationale:** the table is contract data and belongs in the scaffold; the guard is Lane 1's work and shouldn't be pre-empted. The TODO also places the **concurrency guard in the calling service, not in the guard function**. The caller must re-read the queue row inside a transaction and compare status immediately before writing. A pure function can't protect against two nurses advancing the same visit simultaneously, and putting the note here is cheaper than discovering it in testing.

### D6 · `Staff.email` is globally unique, not per-clinic

The intuitive schema is a unique index on `(clinicId, email)`: one clinic can't invite the same address twice, but two different clinics can each invite the same person. That models the real world correctly: a locum doctor working two clinics has one email.

**Chose:** a **global** unique index on `email`, matching `Clinic.email`.

**Why the intuitive version is wrong here:** `POST /auth/login` takes `{ email, password }` and nothing else. There is no `clinicId`, and no way to supply one, since the clinic scope is read *out of* the token the login call is trying to issue. So the lookup is `findOne({ where: { email } })`. If two clinics hold the same address, that query matches two rows and Sequelize gives no guarantee which comes back, so the user lands in an arbitrary clinic. `Clinic.email` is globally unique for exactly this reason; staff email is under the same constraint and needs the same answer.

**Trade-off:** one human with one email address cannot hold accounts at two clinics in v1. That is a real limitation. Revisit when login gains a way to tell the accounts apart: a clinic selector in the request, a clinic-qualified login URL, or an account-picker step after a multi-hit email lookup. Any of those makes per-clinic uniqueness safe; none of them exist today.

The `(clinicId, email)` index is still present, **non-unique**, to serve clinic-scoped reads (`GET /users`, `GET /staff/doctors`).

### D7 · One password hasher, shared by both credential tables

`clinics` and `staff` both store password hashes, so the `beforeCreate`/`beforeUpdate` hooks and `comparePassword` existed as byte-for-byte copies in two models.

**Chose:** `utils/password.js` exporting `hashPassword` and `comparePassword`. `SALT_ROUNDS` lives there and nowhere else; no model imports `bcrypt` directly.

**Rationale:** same category as [S1](#s1--one-phone-normalizer-and-why-it-matters) and [S2](#s2--one-role-gate). If there were two copies, changing the number of hashing rounds or fixing a bug in one would leave the other untouched, and the one left behind would be whichever nobody thought to test. Added to the README's shared-code table so it's covered by the same "do not fork" rule.

### D8 · Queue cancellation: a terminal status, note-required, admin-included

Adds `Checked-In → Cancelled` (role `receptionist`) to `TRANSITIONS`, makes `Cancelled` a real `QueueStatus`, and requires a note on the move. Resolves [Q1](#q1--is-cancelled-a-queue-status).

**`Cancelled` is a terminal queue status, not only an appointment status.** Q1 flagged the ambiguity: the contract calls an active visit "any status except `Completed`/`Cancelled`", yet `Cancelled` wasn't in the queue enum. We read it as: a visit can be abandoned partway through, so `Cancelled` joins the queue list and stays **out** of `ACTIVE_QUEUE_STATUSES`. That is what makes `409 QUEUE_ALREADY_CHECKED_IN` work properly, because a cancelled visit counts as closed and the patient can check in again. The alternative (no cancel path) would strand a patient who abandoned a visit, unable to ever re-register.

**The note is a validation requirement, not a permission one, and it is table-driven.** The rule lives on the row (`requiresNote: true`), not as an `if (nextStatus === CANCELLED)` in the function, so a second note-requiring transition would change only the table. A missing note is `400 VALIDATION_ERROR`: the move is legal and the role is right, so it's neither `409` nor `403`; it's a missing field. Order matters: legality → role → note, so a caller is never told their note is missing for a move that wasn't theirs to make.

**The note requirement survives the admin override; the permission checks don't.** Admin's override is about *who may act*, so it skips the legality and role checks. A note is about *whether the reason gets recorded*, a different question entirely, so it is **not** skipped. The guard splits accordingly: the `isAdmin` bypass wraps only the two permission checks. This matters because the system handles money (BR-006). If an admin quietly cancels a visit that already has vitals or a consultation on it, the record of why needs to survive.

**The note check is keyed on the destination, not the matched row.** First cut asked "does the matched transition require a note", which left a hole: an admin cancelling from a state no row declares (`Awaiting Payment → Cancelled`) bypassed the table lookup entirely and so escaped the note. That undefined path is the one cancellation route with *no other guardrail*, so it is where the note matters most. The first cut had it backwards, guarding the ordinary path and freeing the powerful one. Fixed by asking "does any row into `nextStatus` require a note" (`TRANSITIONS.some(t => t.to === nextStatus && t.requiresNote)`), still with no status literal in the logic, just a different slice of the same data. Because every cancel-row carries `requiresNote`, it reads as "moving to Cancelled always needs a note, regardless of which row matched or whether one matched at all."

**Note validation rejects blanks.** Empty string and whitespace-only count as missing (`note.trim().length > 0`). A blank reason is no reason.

### D9 · CORS: env-driven allow-list, rejection routed through `ApiError`

The frontend now calls the API from a browser, which is the trigger the deferred CORS item named. Added the `cors` middleware in `app.js` with an origin allow-list read from `CORS_ORIGIN` (comma-separated, in `.env.example`), and `FORBIDDEN_ORIGIN` to the error catalog.

**Allow-list is configuration, not code.** Origins live in `CORS_ORIGIN` and are parsed at boot (`split(',')`, trimmed, empties dropped), so dev, staging, and production differ by environment alone, with no code change needed to add a frontend host. Empty/unset `CORS_ORIGIN` means no browser origin is allowed, which fails closed.

**Requests with no `Origin` header pass.** Server-to-server calls, curl, and health checks send no `Origin`, so they are allowed through. CORS is a *browser* protection, not an authentication layer, and must never stand in for the `Authorization` header. The role gate ([S2](#s2--one-role-gate)) and `auth` middleware remain the actual access control.

**Rejection is an `ApiError(403, FORBIDDEN_ORIGIN)`, not a bare `Error`.** The reason this matters: a plain `Error` from the origin callback falls through `errorHandler` to the generic `500 INTERNAL_ERROR` branch ([S3](#s3--errors-go-through-apierror--one-handler)). That is the wrong status (a `403` access decision, not a server fault) and inconsistent with every other rejection in the API. Routing through `ApiError` renders the contract's error envelope with the right code. Verified end-to-end (allowed → 200, disallowed → 403 `FORBIDDEN_ORIGIN`, no-Origin → 200), and covered in `tests/cors.test.js`.

**Now documented in the contract.** Per the deferred note, CORS earns a line in the contract's Conventions and `FORBIDDEN_ORIGIN` joins the error catalog, done here and not before.

### D10 · Queue routes go live: transition history, unpaginated reads, admin attribution

Wires `GET /queue` and `POST /queue/:queueId/status` to the real model, which turns the rulebook (D5, D8) into a callable endpoint. Several decisions came out of it, plus one defect each in the schema and the actor-attribution model.

**The `patients` table had never existed** _(fixed a real defect)_. The `Patient` model shipped in the first scaffold as the reference every other model copied, but no migration was ever generated for it. Confirmed twice: `migrate:status` listed no such migration, `pg_tables` showed only `clinics`/`staff`. Nothing had noticed because nothing calls `Patient.create()`: the receptionist-route check hit a `501` stub that never reaches the DB. Same class as the `clinics.updateAt` typo: invisible until something writes. Found by checking the premise behind `queue_entries.patientId`'s FK deferral rather than trusting it. Created now, with the non-unique `(clinicId, phone)` index D3 requires; the deferred FK (`RESTRICT`, matching `assignedDoctorId`) follows in its own migration.

**Transition history is its own table, not a column.** `queue_status_events` (queueEntryId, fromStatus, toStatus, changedBy, note, createdAt) is written by the queue service in the *same transaction* as the status change, so a move can never exist without its reason nor a reason without its move. A `lastNote` column on `queue_entries` was the cheaper option and is wrong: the next transition overwrites it, so a cancelled visit's reason vanishes the moment it is re-checked-in, which is exactly backwards for something audit-sensitive. It's also the data source the deferred queue-bottleneck dashboard metric will need (time-in-status, from consecutive event timestamps), so it's forward-compatible with a named requirement rather than speculative.

**`changedBy` is a soft reference with no FK** _(fixed a real defect, caught by the route tests)_. The first cut FK-constrained it to `staff`, which passed every test until the admin-override case: **admin is the clinic account**, so its token subject is a *clinic* id, and writing that into a staff-constrained column raised `23503`, so a documented feature returned `500`.

**This is a different reason from [D3](#d3--no-uniqueness-constraint-on-patient-identity), even though the outcome looks similar.** D3 dropped a constraint because the underlying fact is genuinely unclear: no set of fields reliably identifies a person, so the database cannot know. Here the fact is perfectly clear. When the row is written, the code knows exactly which table `actor.id` came from (`actor.role === ADMIN` or not). The problem is only that Postgres cannot point one column at two different tables, so there is no way to write the rule down as a foreign key.

**There was another option, and we chose against it.** Two nullable columns (`changedByStaffId` pointing at `staff`, `changedByClinicId` pointing at `clinics`, with exactly one filled in) would let the database check both links properly. We rejected it for a two-week project: it doubles the columns on every table that records who did something, every read has to check both columns, and it needs an extra rule to stop both being filled at once. Dropping the constraint is the cheaper option, not the only one. If the audit trail ever needs to be airtight, that is the migration to write.

**A knock-on effect we accepted:** deleting a staff member no longer blanks out their id on old events. Without the database link, those events keep pointing at an id that no longer matches anyone. For a history log that is arguably right. The record of who did something should outlast their employment, and an event that forgets who did it is less useful than one naming someone who has since left.

**`queue_entries.lastUpdatedBy` is nulled on admin action, not left stale.** That column *is* FK-constrained to `staff` (from an already-merged migration), so it is written only for staff actors, but the service explicitly assigns `null` rather than skipping the write. Leaving it untouched would be actively misleading: after an admin override the row would still name whichever staff member touched it *previously*, which looks believable but is wrong. Better to show no name than the wrong one. So, when reading these fields: `lastUpdatedBy` is best-effort, staff-only, and answers "which staff member last touched this"; `queue_status_events` is the source of truth for who actually did what, admin included. Anyone computing attribution or dashboard metrics should read the event log, not the entry field. A route test asserts this specifically: a staff member stamps the row, then admin acts, and the stale value must be gone; the earlier admin test could not detect the difference, since a fresh visit is `null` either way.

Worth noting for whoever adds the next actor-stamped column: any "who did this" field has the same two-kinds-of-account problem.

**`POST /:queueId/status` mounts `auth` with no `authorize()`.** Deliberate, and commented in the route file so it isn't "fixed" by copying `patient.routes.js`. A static role list can't express "nurse owns this move, but only from `Checked-In`", because it never sees the row's current status. `assertCanTransition` is the only thing holding that context, so it *is* the gate here; a static list would either name all five roles (achieving nothing) or silently block a legitimate transition. This does not contradict [S2](#s2--one-role-gate): the guard is the single gate, not a second one.

**`GET /queue` is unpaginated, by decision not omission.** The Conventions section applies pagination to list endpoints generally, but section 4's own entry for `GET /queue` lists only `?status=&assignedDoctorId=`. A live queue is bounded by the patients physically in the building. Revisit if a clinic ever runs a queue long enough to matter.

**Consumed by other lanes as a function, not an HTTP call.** The automatic transitions (`In Consultation → Awaiting Payment`, `Awaiting Payment → Completed`) are real rows in `TRANSITIONS`, so Lane 3's consult-complete and Lane 4's payment must import `changeStatus` from `services/queue/queue.service.js` directly, per [Q2](#q2--queue-state-machine-imported-module-or-internal-http-call)'s module reading, rather than building a second write path. The concurrency lock and the event write live inside that function; a parallel path would silently skip both.

### D11 · Appointment: resolved and merged in Victor's absence

PR #5 (`Appointment` model + migration) sat blocked for over a day on a migration collision, with no response from its author after a same-day review. With Lane 2/3/4 all gated on `patients` and now `appointments` existing, this was the actual blocker for the rest of the project, so it was resolved and merged by the lead rather than left waiting indefinitely. Everything below was verified against a real Postgres instance before merging, the same bar as every other model this session; two of the decisions below were judgement calls made without Victor's input, and are flagged so he can revisit them.

**The collision, fixed by deletion and re-timestamping, not by picking a winner arbitrarily.** Victor's `20260724161530-patient-migration.cjs` and the already-merged `20260725124601-create-patients.cjs` (D10) create the identical table, verified field-for-field. Main's version was kept because it had already been exercised (a real `Patient.create()` round-trip, a same-phone duplicate proving the D3 non-unique index, `updatedAt` confirmed correct); Victor's had not been run anywhere. His duplicate migration is deleted. His `20260724181350-appointments-migration.cjs`, which FKs to `patients`, is re-timestamped to `20260725150000` so it sorts after every migration currently on `main`. Otherwise a fresh clone would try to create `appointments` before `patients` exists and fail on the FK.

**Model/migration drift, fixed while it was still safe to fix in place.** The model's index is `(clinicId, doctorId, date)`; the migration only created `(clinicId, doctorId)`, missing `date`. Since this migration has never run anywhere shared, it was corrected directly rather than shipped as a follow-up (the same rule D10 used for its own index comments: change both or neither, and do it before anyone else has the old version).

**Judgment call, made without Victor: `onDelete: RESTRICT` on `patientId` and `doctorId`, not `CASCADE`.** His original had `CASCADE` on both. Changed to match `queue_entries`' precedent for the identical shape of relationship: appointment history is a record, and deleting a patient or a staff member shouldn't silently delete the fact that an appointment happened. `clinicId` stays `CASCADE`: deleting a whole clinic reasonably takes its appointment history with it, same as every other clinic-scoped table. Verified directly: a `patient.destroy()` with an attached appointment is rejected by Postgres, not just assumed from the migration text.

**Judgment call, made without Victor: no double-booking guard.** Nothing stops two appointments for the same doctor at the same date and time. The contract does not ask for one in v1, and there is a real design question underneath it: is a unique index on `(clinicId, doctorId, date, time)` the right rule, or do appointments of different lengths need an overlap check instead? That deserves a proper answer rather than a guess. Left open on purpose. Settle it before appointments are used for real scheduling.

**Stray local config removed.** `package.json` had `"allowScripts": { "bcrypt@5.1.1": true }`, which is not a field npm reads, and no `lavamoat`/`@lavamoat/allow-scripts` dependency exists anywhere in the repo to read it either. Almost certainly a personal tool artifact from Victor's machine that did nothing for anyone else. Removed rather than left as unexplained dead config.

**The numbering collision this entry warned about is resolved here.** This entry landed as `D11` against `main`; the auth branch (PR #9) independently had its own `D11`/`D12` against an earlier base. Merging auth second (this merge), its two entries are renumbered to `D12`/`D13` below, keeping this entry's number and its inbound link from the deferred-items table stable.

### D12 · `DUPLICATE_EMAIL`, and email uniqueness across two credential tables

Adds `DUPLICATE_EMAIL` (409) to the catalog and makes email unique across `clinics` **and** `staff`, not merely within each. Found while writing `POST /auth/login`, before the lookup was built on the assumption it turned out to violate.

**Why a new code instead of reusing `VALIDATION_ERROR`.** Signup's first cut reported a taken email as `400 VALIDATION_ERROR`. A taken email is a conflict, not a malformed field, and the catalog maps each code to exactly one status. Reusing a 400-mapped code for a 409 situation corrupts a mapping the frontend and mobile clients read directly. This is the same kind of drift [S3](#s3--errors-go-through-apierror--one-handler) exists to prevent, one level up: in the list of codes rather than in a handler. Adding a code is a contract change, so it landed in `API_CONTRACT.md` first.

**One code, two writers.** `DUPLICATE_EMAIL` is raised by `POST /auth/clinic/signup` and `POST /auth/invite`, the two endpoints that *create* a login record. `POST /auth/login` never raises it: login is a read and cannot violate a uniqueness rule. The messages differ per situation even though the code is shared.

**The real finding: cross-table collisions.** `clinics.email` and `staff.email` are two separate unique indexes on two separate tables. Each guards only itself, so **nothing prevented the same address existing in both**, and login looks up by email alone. That is the same ambiguity [D6](#d6--staffemail-is-globally-unique-not-per-clinic) removed within one table (`findOne` matching a row the caller did not mean), reappearing across two. Left alone, login's "check Clinic, then Staff" would have rested on a premise the schema does not guarantee.

**Chosen:** an application-level pre-check (`assertEmailAvailable`) querying both tables before either write. Postgres cannot express a unique constraint spanning two tables, so this cannot be a database rule without moving all logins into one shared table, which is too large a change for a two-week build, and recorded here as the thing to revisit if it ever matters more.

**What is and is not covered:**
- **Same-table collisions remain race-proof.** Two concurrent signups with one email both pass the pre-check; the `clinics.email` unique index then rejects the loser, and the service maps that to the same `409 DUPLICATE_EMAIL`. The pre-check supplies the clean message, the constraint supplies the guarantee. Same two-layer pattern as the one-active-visit rule.
- **Cross-table collisions are not.** Two requests at the same instant, one reaching `Clinic.create` and the other `Staff.create` with the same email, can both pass `assertEmailAvailable` before either write lands, and **no index catches it**, because no index spans both tables. The result is one email in two tables and an ambiguous login.

So the honest guarantee is: **globally unique except under simultaneous cross-table writes.** That window is small (a clinic signing up at the same moment someone is invited with that same address) and the worst outcome is one ambiguous account, not lost data. Accepted for the MVP, in the same spirit as [D3](#d3--no-uniqueness-constraint-on-patient-identity)'s missing phone backstop and [D10](#d10--queue-routes-go-live-transition-history-unpaginated-reads-admin-attribution)'s `SET NULL` loss: a limitation we named rather than missed. If it ever needs closing, the fix is one shared logins table with a single unique index, not a bigger pre-check.

**Two orderings inside `loginUser`, and what each costs.**
- **Fall through on "not found" only, never after a wrong password.** Valid *because* of the guard above: at most one row can match, so a matched row is the account, and a mismatch ends it. Without the cross-table guard this reasoning would not hold. The two decisions depend on each other.
- **Staff status is checked before the password compare.** Not a courtesy: an `invited` row's password is `null`, so there is nothing to compare against and `comparePassword` would be meaningless. The cost is a small leak: `403 INVITE_NOT_ACCEPTED` confirms the address is registered, where a wrong password would not. The contract mandates that error for this case, so the leak is accepted; the two *other* failure modes (unknown email, wrong password) return a byte-identical `401`, asserted equal in the tests rather than assumed.

### D13 · Invite tokens: clearing on accept collapses two error cases into one

`POST /auth/invite` and `POST /auth/accept-invite`. Three decisions worth recording; one of them resolves a genuinely open question rather than filling in a blank.

**Invite-message differentiation, not a copy of signup's.** `assertEmailAvailableForInvite` gives a different message per situation rather than reusing signup's "already registered": the email belongs to a *clinic* account, the email is already staffed at *this same clinic* (a literal re-invite), or the email is staffed at a *different* clinic entirely. Same `DUPLICATE_EMAIL` code throughout (D12); only the wording changes to match what is actually true, since "already registered" reads oddly for an admin re-inviting their own already-invited receptionist.

**Role is validated against `INVITABLE_ROLES` before touching the database**, not left to the model's `isIn` validator. `INVITABLE_ROLES` is now exported from `staff.js` rather than staying module-private, so the service can produce a clean 400 with the actual list of valid roles instead of surfacing Sequelize's generic validator text. One export, still one source of truth. The service did not get its own copy of the list.

**The real design call: what happens when `accept-invite` is hit on an already-active row.** No existing code fits cleanly. The request is well-formed, and the clash of states is not quite `VALIDATION_ERROR`. Resolved by clearing `inviteToken` to `null` at the moment of successful accept, which answers both halves of the question in one move:
- **The two failure cases collapse into one.** Once a row is active, its `inviteToken` is `null`, so it can never be found by the old token again. "This token was never issued" and "this token already got used" become the identical query result: `404 NOT_FOUND`, `"This invite link is invalid or has already been used."` There is no second state to invent a code for, because the lookup itself can no longer distinguish them.
- **That collapse is also the actual security property being asked for, not just a tidy error.** Without clearing the token, an old invite link sitting unused in an inbox would remain a **permanently valid, unauthenticated password-reset mechanism** for that account, because `accept-invite` does not ask for a current password. Anyone holding a stale link could silently overwrite an active staffer's password at any time. Nulling the token is what makes the link stop *working*, not merely what makes the error message nicer. Verified directly: a replayed token after a successful accept is rejected, and the original password is confirmed unchanged, not merely "an error was returned."

**Considered and rejected: an explicit `staff.status !== 'active'` check alongside the token-clearing.** Given the token invariant (active ⇒ `inviteToken` is `null`, enforced nowhere else but this one function), a second guard would be checking something this same function already makes impossible. That is dead code standing in for a case nothing can currently produce. If a future feature ever needs to re-arm an active row with a fresh invite token (e.g. an admin-triggered password reset by re-invite), that feature has to edit this exact function to do it, and that is when this decision should be revisited.

**Concurrency: the same discipline as the queue guard (D5), applied here for the first time outside the queue.** `acceptInvite` re-reads the Staff row with `lock: t.LOCK.UPDATE` inside a transaction before writing, so two near-simultaneous accepts of the same token can't both succeed. This is not hypothetical. It was proven with a real concurrent test (`Promise.all` of two accept calls, same token, different passwords): exactly one request gets `200`, the other's re-read finds nothing (`404`, the token is already cleared by the winner) and the row ends up with only the winner's password set, never a partially-applied state.

**`FRONTEND_URL` is a new env var, not a contract change.** The contract specifies `POST /auth/invite`'s response as "a staff record ... plus an inviteLink" without naming a URL format; the base URL used to build that link is server configuration, the same category as `PORT` or `CORS_ORIGIN`, not a request or response shape, so it lives in `.env.example` and needs no contract PR. The response is the staff fields spread flat with `inviteLink` alongside them (matching the contract's own flat style, e.g. `GET /auth/me`), not nested under a `staff` key the contract never names.

### D14 · `GET /auth/me`, `/users`, `/staff/doctors`: Lane 1's last three routes

Closes out contract section 1. No new models or migrations. Everything reads `Clinic` and `Staff`, both already built.

**Handlers need `try`/`catch` + `next(err)`, same as every other handler in this file.** Express 4 does not auto-catch a rejected promise from an async route handler; only a synchronous throw is caught automatically. `getCurrentUser`'s `404 NOT_FOUND` path, or any unexpected DB error, would become an unhandled rejection, sending no response at all rather than a `500`, if written without the wrapper. Every existing handler in `auth.controller.js` already uses the pattern for exactly this reason; the three new ones follow it rather than introducing a second style.

**`utils/pagination.js` is new, and shared on day one, not added after a second caller shows up.** `GET /users` is the first endpoint that needs `page`/`limit`, but the contract's `1`/`20`/`100` convention is stated once in Conventions and applies to every list endpoint still to come (`GET /patients`, `GET /payments/history`, ...). Pulling the parser out now means the second caller imports it rather than writing a slightly different one. Same reasoning as `utils/phone.js` and `utils/password.js`, applied early because the contract already says this need is coming.

**`GET /users` and `GET /staff/doctors` are wired in `routes/index.js`, not inside `auth.routes.js`**, despite living in the contract's "Auth & Accounts" section. Their actual paths (`/users`, `/staff/doctors`) carry no `/auth` prefix, and `auth.routes.js` is mounted at `/auth`, so nesting them there would silently change their real paths to `/auth/users` and `/auth/staff/doctors`. Contract section is a grouping for readers, not a routing namespace.

**Both new list endpoints are role-gated to match the contract.** `GET /users` is `admin` only. `GET /staff/doctors` allows `receptionist`, `nurse`, and `admin`. Both use the shared `authorize()` middleware in `routes/index.js`, and both have a test proving a disallowed role gets `403 FORBIDDEN_ROLE`: a nurse against `/users`, and a cashier against `/staff/doctors`. Without the gate on `/users`, any signed-in staff member could read every colleague name, email, and role in the clinic.

**`GET /staff/doctors` filters to `status: active`, which the contract's one-line spec doesn't say explicitly.** An invited-but-not-yet-accepted doctor can't log in and will never see a queue entry assigned to them, so surfacing them here would let a receptionist check a patient in against someone who can't act on it. Verified directly, not assumed: seeded one active and one invited doctor, confirmed only the active one comes back, then proved the test actually catches the problem by temporarily dropping the status filter and confirming that one test, and only that one, failed.

**Pagination is verified the same way: proven to page, not just to accept the parameters.** Seeded five rows, requested page 1 and page 2 at `limit=2`, and asserted the returned id sets are disjoint. As with the doctors filter, the negative control matters here: dropping `offset` from the query would still return `200` with two rows on every page, silently identical. Catching that is the test's job, and it was confirmed to do so: it fails when `offset` is dropped and passes when it is not.

**`GET /auth/me`'s response is flat in `data`, unlike login's `{ token, user }`.** Easy to get backwards by pattern-matching the login handler next to it. Asserted directly: `body.data.user` must be `undefined`, and the key set is `{ id, name, role, clinicId }` at the top level. Also asserted for shape parity across account types, same approach as the login checks in D12 and D13: an admin token and a staff token must produce identical key sets from this endpoint, not just correct values.

### D15 · Patients, Appointments, and Queue check-in: built and merged in Victor's absence

Same situation as [D11](#d11--appointment-resolved-and-merged-in-victors-absence). Victor was unavailable, and the four Patients routes (only `GET /patients/:id` existed, and it had one open review comment) plus `POST /appointments` and `POST /queue/check-in` were the actual blocker for the rest of the project — nothing downstream can be tested end-to-end without a patient existing and a visit being able to start. Picked up and finished by someone else rather than left waiting.

**One rule, applied to every new lookup: look the record up, and if it's missing *or* it belongs to a different clinic, give back the exact same "not found."** This was already the rule for patients and queue entries (see D3 and D10); it's now applied identically to appointments, and to the doctor and appointment checks inside check-in. The point is the same every time: someone in one clinic must never be able to tell, from the response they get back, whether a record exists in a *different* clinic.

**Checking a patient in reuses the queue's existing concurrency rule (D5), rather than inventing a new one.** "A patient can't have two visits open at once" is enforced by the database itself — check-in tries to create the visit, and if the database's existing rule rejects it, that rejection is turned into a clean `409` for the caller. Nothing checks "is there already a visit?" first and then hopes nothing changes in between; the database is the thing that actually guarantees it.

**One shared check for "is this really an active doctor in this clinic," used by both appointments and check-in.** Both features need to confirm the same fact before going further. Written once, in the same place the existing doctor-list feature already lived, and imported by both — not typed out twice.

### D16 · A validation fix has to move into a shared file the moment a second place needs it

A patient lookup was found to crash with a server error, instead of giving a clean "not found," when it was asked for something that wasn't shaped like a real id at all (rather than a real id that just didn't match anything). Fixed by checking the shape first. That fix lived inside the one function that needed it at the time.

**The same crash came back twice, in the next two features built afterward.** Appointments and check-in both needed to look patients and doctors up by id too, and both were written the normal way — a lookup, then "if nothing came back, it's not found" — without knowing the earlier fix existed, because it wasn't anywhere they'd think to look. A reviewer caught it both times.

**Moved into one small shared file (`utils/uuid.js`) once it was clear a second caller needed it, and every affected lookup now uses it.** Same lesson as the phone normalizer and the role check: the first time a check exists in only one place is fine, but the moment a second place needs the exact same check, it has to become a shared file that gets imported, not a few lines retyped from memory. A fix that isn't shared is really only a fix for the one spot someone happened to be looking at.

### D17 · Six pieces of related work, built as stacked branches — and where that went wrong

Six pieces of work (the four Patients routes, Appointments, and Queue check-in) were built one after another. Each one was its own branch and its own pull request, and each new branch was started from the *previous* one rather than from `main`, so that reviewing any single piece only showed the change that piece actually made, not everything before it too.

**That part worked as intended.** What went wrong was the order the pull requests were approved and merged in: earliest-built first, through to latest-built last, rather than the other way around. A merge only carries across whatever its target branch contained *at that exact moment* — so merging them in build order meant later merges never flowed back down into the earlier branches, and **none of the six pieces actually reached `main`** until one final pull request pulled the whole finished chain across in a single move.

**Lesson for next time a chain of branches is built this way:** either merge starting from the newest branch and work down to the oldest, so each merge carries everything above it along too, or skip merging the middle branches into each other at all, and only ever open the one pull request that matters — the finished, final branch straight into `main` — once every piece in the chain is done.

### D18 · CORS temporarily opened to all origins, at frontend's request

`app.js` went from an env-driven allow-list ([D9](#d9--cors-env-driven-allow-list-rejection-routed-through-apierror)) to `cors({ origin: true })` — every origin is now let through, not just the ones in `CORS_ORIGIN`.

**Why:** frontend's dev/deploy URL isn't stable yet, and the allow-list was rejecting them with `403 FORBIDDEN_ORIGIN` before they had a fixed origin to add to it. This is explicitly **temporary**, not a reversal of D9's reasoning — the allow-list is still the right design once there's a real origin to put in it.

**`origin: true`, not a bare `"*"`.** Functionally identical for what the frontend needs right now — every origin gets through either way — but `"*"` and `Access-Control-Allow-Credentials: true` cannot coexist per the CORS spec, while a reflected origin can. Costs nothing today and avoids a second migration if credentialed requests (cookies, `withCredentials`) ever get introduced later. Verified directly, not just configured and assumed: `tests/cors.test.js` asserts the `Access-Control-Allow-Origin` response header equals the actual request `Origin`, not `*`.

**Low risk despite being wide open, because of what this API's auth already is.** Every route but the three public auth ones requires a Bearer token in an `Authorization` header, which a browser never attaches automatically the way it does cookies. Opening CORS doesn't hand a malicious site a signed-in user's session — it only means a browser script can *attempt* a request, which still needs a token it has no way to obtain. CORS was never the access-control layer here ([D9](#d9--cors-env-driven-allow-list-rejection-routed-through-apierror) already says this); this decision is safe largely because that was already true before it.

**What changed in the test suite, and why it was edited rather than left to fail.** `tests/cors.test.js`'s `a disallowed origin is 403 FORBIDDEN_ORIGIN` test asserted exactly the behavior this decision removes on purpose. Deleting the assertion silently would have left the pass count meaning less than it says; instead the test was rewritten to assert the new contract — any origin gets through, and the allow-origin header reflects the real origin rather than `*` — so a future regression back to the old restrictive behavior would fail a test, the same way a regression forward would have before this change. Full suite: `72/72` passing. `ApiError`/`ErrorCode` imports in `app.js` were dropped since `origin: true` has no rejection path left to use them on; `ErrorCode.FORBIDDEN_ORIGIN` itself stays in the catalog rather than being deleted, since the code is still contract-documented (D9) and reverting shouldn't mean re-adding it.

**Revert trigger:** once frontend has a stable origin, put it in `CORS_ORIGIN` and restore the D9 allow-list callback in `app.js` — the `allowedOrigins` parsing logic was removed along with the callback, not left commented out, so restoring it means pulling the D9 version back rather than un-commenting stale code.

### D19 · CORS: revert trigger fired, back to the D9 allow-list

Frontend's deploy URL is now stable (`https://swiftcare-eight.vercel.app`), so the [D18](#d18--cors-temporarily-opened-to-all-origins-at-frontends-request) revert trigger fired. `app.js` goes back to the [D9](#d9--cors-env-driven-allow-list-rejection-routed-through-apierror) `allowedOrigins` callback (`ApiError`/`ErrorCode.FORBIDDEN_ORIGIN` imports restored, `origin: true` removed), and `CORS_ORIGIN` in `.env` / `.env.example` is set to `http://localhost:5173,https://swiftcare-eight.vercel.app`.

**`tests/cors.test.js` goes back to the D9 version too**, asserting the allow-list contract (allowed origin → 200, disallowed → 403 `FORBIDDEN_ORIGIN`, no-Origin → 200) instead of D18's "any origin gets through" assertions — the same reasoning D18 itself used: a regression either direction should fail a test, not just change silently.

**Nothing else changes.** D18's low-risk argument (every non-public route needs a Bearer token a browser never attaches automatically) was about CORS exposure, not about which origins are let through, so it isn't affected by tightening the list back up.

---

## Shared code

Seven files are single-source. A second copy is a bug, not a convenience. Enumerated in the README so "I'll just write a small local helper" is visibly against the rules.

### S1 · One phone normalizer, and why it matters

`utils/phone.js` is the only thing standing between duplicate detection and a silently missed match, because [D3](#d3--no-uniqueness-constraint-on-patient-identity) removed the database backstop. Two lanes normalizing differently means one lane's "no match found" is another's duplicate.

**Extended the original:** added the bare 10-digit case (`8031234567`, typed without the leading zero) alongside `+234`/`234`/`0` prefixes. All four formats now collapse to one value, verified below.

**Known limitation:** the implementation assumes Nigerian numbering. An international number won't normalize meaningfully. Fine for the MVP's single-market scope; would need revisiting before any multi-country deployment.

### S2 · One role gate

`middlewares/authorize.js` is the only permission check. The contract is explicit that lanes must not re-implement it. Divergent role logic across four lanes is how a cashier ends up able to complete a consultation.

**Hardened:** it now returns `401` if `req.user` is absent, rather than throwing on `undefined.role`. Guards against being mounted without `auth` in front of it.

### S3 · Errors go through `ApiError` + one handler

Handlers `throw new ApiError(status, code, message)`; `errorHandler` renders the contract's error envelope. Nothing builds an error response inline.

**Rationale:** the envelope shape is a contract promise consumed by frontend and mobile. One rendering site means it can't drift in a corner of lane 3.

**Trade-off:** an unrecognised error becomes a generic `500 INTERNAL_ERROR` with the detail only in server logs. That's deliberate for a public API, but means debugging depends on log access.

### S4 · `ACTIVE_QUEUE_STATUSES` derived once

The "one active visit per patient" rule needs a definition of active in code, not prose. Exported from `constants/index.js` so the check can't be re-derived inconsistently. See [Q1](#q1--is-cancelled-a-queue-status): the definition has an ambiguity worth resolving.

---

## Workflow

### W1 · `main` protected, admins exempt

Applied: PR required, 1 approving review, stale approvals dismissed on new commits, force-push and deletion blocked, conversations must be resolved before merge. `enforce_admins: false`.

**The trade-off:** with admin enforcement on, the lead (who is also a lane owner) could not merge their own work without a teammate approving it. On a four-person team where people are not always around, that risks getting stuck. With it off, the rule still applies to the three lane owners, and the lead keeps a way through when nobody is available.

**The cost:** the exemption is silent. Nothing warns before a direct push to `main`, which is precisely the accident the rule exists to prevent. Mitigation is habit, not tooling: the lead should use PRs anyway. Worth flipping to enforced if the team's review latency turns out to be fine.

Added beyond the original list: required conversation resolution, so review comments can't be silently merged past. Cheap to remove if it feels heavy.

### W2 · `.gitattributes` with `eol=lf`

Committed after seeing git's CRLF warnings on a Windows machine. Mixed-OS teams otherwise produce whole-file diffs on save, which makes reviews unreadable and hides the actual change. Cheaper to set before the first branch than to normalize later.

### W3 · Empty directories tracked with `.gitkeep`

`controllers/`, `migrations/`, `seeders/` are empty. Git doesn't track directories, so without these the structure a lane owner clones wouldn't match the documented layout.

### W4 · Written documentation covers what's real, not what's planned

Added an interactive documentation page (built from short notes written directly above each route, so the notes and the code can't drift apart) once Auth, Queue, Patients, and Appointments were all live.

**Chose to describe only routes that actually work today**, and to leave Vitals, Consultations, and Billing/Payments out entirely rather than describing routes that don't exist yet, or that only return a stub response. A documentation page a reader can try for themselves is only trustworthy if everything on it genuinely works the way it says. `API_CONTRACT.md` remains the place for what's planned but not yet built; this page is for what's actually running. Add a route's notes at the same time the route itself is written — not before, and not as a separate follow-up.

---

## Verification record

Nothing below is inferred from reading the code. Each was executed against the running app on 2026-07-21, Node 22.22.0.

| Check                             | Result                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm install`                     | 269 packages, clean; `bcrypt` native build succeeded                                                          |
| `GET /api/health`                 | `200 {"success":true,"data":{"status":"ok"}}`                                                                 |
| No token                          | `401 UNAUTHENTICATED`                                                                                         |
| Malformed token                   | `401 UNAUTHENTICATED`                                                                                         |
| Nurse → `POST /patients`          | `403 FORBIDDEN_ROLE`                                                                                          |
| Receptionist → `POST /patients`   | `501 NOT_IMPLEMENTED` (stub reached; the gate passes the right role)                                             |
| `normalizePhone` × 4 formats      | `+234 803…`, `234803…`, `0803…`, `803…` → all `08031234567`                                                   |
| `assertCanTransition`             | throws `501 NOT_IMPLEMENTED` as intended                                                                      |
| `sequelize-cli` + `.sequelizerc`  | loads `config.cjs`, writes to `src/migrations/`                                                               |
| ESM `.sequelizerc` (control test) | CLI silently prints help, runs nothing; confirms [M2](#m2--sequelizerc-must-be-commonjs-fixed-a-real-defect) |
| Remote file tree after push       | 27 files; **no `.env`, no `node_modules`**                                                                    |
| Branch protection                 | read back from the API, all seven settings as intended                                                        |
| Live database verification        | `sequelize.authenticate()` successfully connects and the application boots as expected                        |

The database connection has been verified: `sequelize.authenticate()` successfully connects to the local PostgreSQL database, and the application boots on the configured port.

---

## Open questions

Unresolved. Each needs an owner before the work it blocks starts.

### Q1 · Is `Cancelled` a queue status?

> **Resolved.** See [D8](#d8--queue-cancellation-a-terminal-status-note-required-admin-included).

The contract defines an active visit as "any status except `Completed`/`Cancelled`", but `Cancelled` is not in the Queue Status enum. It only appears in Appointment Status. So either a queue entry can be cancelled and the enum is incomplete, or visits are never cancelled and the definition should say `Completed` only.

`ACTIVE_QUEUE_STATUSES` currently assumes the latter. **This affects the `409 QUEUE_ALREADY_CHECKED_IN` check**: if a visit can be abandoned mid-flow with no cancel path, that patient can never check in again. Worth resolving before Lane 2 builds check-in.

**Resolved:** `Cancelled` *is* a queue status. `Checked-In → Cancelled` is a real, note-required transition, and `Cancelled` is terminal (excluded from `ACTIVE_QUEUE_STATUSES`), so a cancelled visit frees the patient to check in again. See D8 for the full reasoning.

### Q2 · Queue state machine: imported module or internal HTTP call?

The contract says the queue is "shared; called by every lane" without specifying the mechanism. The scaffold assumes a directly imported module (`services/queue/transitions.js`), which is the simpler reading, but this was never explicitly confirmed, and it changes how every other lane calls into the queue. Raised during setup; still unanswered.

### Q3 · Where does the flat consultation fee come from?

`POST /consultations/:id/complete` creates an invoice at a "flat fee". Not specified whether that's a constant, a per-clinic setting, or a config value. Lane 3 and Lane 4 both need the answer, and it likely implies a column on the clinic record, which means it belongs in the schema work.

### Q4 · Shared-utils module layout

Flagged during setup as worth settling before the first commit; the current single-file-per-concern layout under `utils/` is a default, not a decision. Fine as-is, but if it's going to change, cheaper now than after four lanes import from it.

### Q5 · Should registering two patients with the same new phone number, at the same moment, be locked?

Raised in review on the patient-registration work, not yet answered. Two people registering a brand-new patient with the same phone number, at the exact same moment, could both pass the "does this phone already exist" check before either one finishes saving — so both go through, and the clinic ends up with two records that should have been flagged as possible duplicates and shown to a receptionist to confirm. The same kind of gap already exists for matching staff email addresses (see D12) and was written down there as an accepted limitation rather than closed. Not yet decided whether to accept this one the same way, or close it with a database-level lock.

---

## Deliberately deferred

Each of these is a deliberate "not yet". The last column says what would make us pick it up.

| Deferred                                 | Why                                                                                       | Revisit when                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Vitals, Consultation, Prescription, Invoice, Payment models (5 remaining) | Schema is the critical path for Lanes 3 and 4 | Lane 3 / Lane 4 start |
| Appointment double-booking guard         | Real design question (unique index vs. overlap check) the contract doesn't mandate for v1 | Before appointments carries real scheduling weight; see [D11](#d11--appointment-resolved-and-merged-in-victors-absence) |
| `assertCanTransition` implementation     | ~~Lane 1's work, not the scaffold's~~ **Done, see [D8](#d8--queue-cancellation-a-terminal-status-note-required-admin-included).** | Nothing left |
| Concurrent-duplicate lock, phone (patients) and email (staff) | Post-MVP for phone per the contract; accepted the same way for email in D12; see [Q5](#q5--should-registering-two-patients-with-the-same-new-phone-number-at-the-same-moment-be-locked) | Real concurrent load |
| Automated tests for Patients / Appointments / Queue check-in | Built under time pressure to unblock the rest of the project; no matching tests written alongside it | Before this code is trusted for real traffic — same style as `tests/queue-routes.test.js` |
| Linting                                  | An `eslint-disable` comment already exists with no ESLint; mild inconsistency, accepted  | Team agrees on a style                                                                                             |
| CI                                       | ~~Nothing to run without tests~~ **Tests now exist — 64 of them.** Nothing runs them automatically yet | Now — this is the next natural step, not blocked on anything |
| `CONTRIBUTING.md` + PR template          | Branch naming and PR expectations currently live only in the README                       | Before lanes branch                                                                                                |
