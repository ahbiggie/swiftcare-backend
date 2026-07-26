# Decision Log

Why the repo looks the way it does. One entry per decision that wasn't obvious, with the trade-off taken and what would justify revisiting it.

The locked API surface lives in [API_CONTRACT.md](API_CONTRACT.md) — this file records **implementation** decisions, not contract ones. A change here is a PR. A change to the contract is a PR _there_, first.

**Started:** 2026-07-21 · **Phase:** foundation, pre-lane-work

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

### R1 — Backend-only repo, not a monorepo

The contract names frontend and mobile as consumers, which made a monorepo tempting.

**Chose:** a standalone `swiftcare-backend` repo.

**Trade-off:** cross-cutting changes (a contract change plus its frontend consumer) now span two repos and can't land atomically. Accepted because a monorepo adds workspace tooling that four people learning the stack in parallel would pay for daily, against a cost we pay only when the contract shifts — and the contract is locked.

### R2 — Lives at `C:\Users\User\dev\swiftcare-backend`, not under OneDrive

The planning docs sit in a OneDrive-synced Desktop folder, so that was the obvious home.

**Chose:** an unsynced path.

**Rationale:** OneDrive sync plus `node_modules` and `.git` internals is a known source of file locks, partial syncs, and corrupted git objects. The sync client fights the package manager over thousands of small files. No upside for a repo that already has remote backup via GitHub.

### R3 — Public repo under a personal account

**Trade-off:** everything is world-readable, so secret hygiene stops being a nicety. Mitigated by `.env` in `.gitignore` and an explicit post-push audit of the remote file tree (see [Verification record](#verification-record)) rather than trusting the ignore file. `.env.example` ships placeholder values only.

Cost to keep in mind: a leaked credential in a public repo is scraped within minutes. Any real secret must be rotated, never just deleted in a follow-up commit — git history keeps it.

---

## Module system

### M1 — ESM everywhere, with deliberate CommonJS islands

`"type": "module"` in `package.json`. The exceptions are the files `sequelize-cli` loads with `require()`: `.sequelizerc`, `src/config/config.cjs`, and everything in `migrations/` and `seeders/`.

**Trade-off:** two module systems in one repo is a genuine cost — contributors must know which rules apply where. The alternative (all CommonJS) would drop the split entirely, but ESM is where Node is going and the team should learn it. Contained by making the boundary mechanical: **if `sequelize-cli` loads it, it ends in `.cjs`.** No judgement call at the call site.

Both rules are the first thing in the README, in bold, because they fail confusingly rather than loudly.

### M2 — `.sequelizerc` must be CommonJS _(fixed a real defect)_

The original scaffold wrote `.sequelizerc` with `import path from 'path'` and `export default`.

**Failure mode, reproduced:** `sequelize-cli` never runs the command. It prints its generic help text and exits — **no error, no stack trace, no mention of the config file**. Anyone hitting this reasonably concludes they mistyped the command. Rewritten as `require` / `module.exports`, after which the CLI reports `Loaded configuration file "src\config\config.cjs"` and runs.

This is the single best argument for rule 1 being bold in the README: the cost of getting it wrong is a silent failure, not a crash.

### M3 — Migrations are `.cjs`, renamed after generation

`sequelize-cli migration:generate` emits a `.js` file containing `module.exports`, which conflicts with `"type": "module"`.

**Measured, not assumed:** on Node 22 this _silently works_ — Node's automatic syntax detection sees CJS syntax and loads it as CommonJS despite the package type. On older Node it throws `ReferenceError: module is not defined`.

**Chose:** rename every generated migration to `.cjs`. The CLI's own discovery pattern is `/^(?!.*\.d\.ts$).*\.(cjs|js|cts|ts)$/`, so `.cjs` is found natively — verified by reading the CLI source, not inferred.

**Rationale:** a scaffold that works on the machine that built it and breaks on a teammate's is worse than one that fails everywhere. `engines: node >=20` sets a floor, but the floor doesn't include syntax detection.

### M4 — Relative imports always carry the `.js` extension

Not a choice so much as a constraint ESM imposes, but recorded because it's the most common porting bug and it fails at _runtime_ — meaning a missing extension on a rarely-hit route survives review and breaks in demo.

---

## Data layer

### D1 — Explicit model registry, not the `sequelize-cli` auto-loader

The conventional `models/index.js` reads the models directory with `fs.readdirSync` + `require()`. That doesn't translate to ESM (no synchronous dynamic import).

**Chose:** import and register each model by hand in `src/models/index.js`.

**Trade-off:** every new model must be added in two places, and forgetting one produces a confusing "model not registered" failure at association time. Accepted because the alternatives — top-level `await import()` in a loop, or a build step — are more machinery than a ten-model project needs. The file has a comment marking both insertion points.

### D2 — `Patient.associate` commented out _(fixed a real defect)_

The scaffold's `Patient.associate` called `Patient.belongsTo(db.Clinic, ...)`, but no `Clinic` model exists yet and `models/index.js` runs every `associate` at import time.

**Failure mode:** the server crashes on `npm run dev` — before anyone writes a line of lane code. First-run experience for three teammates would have been an unexplained boot failure in code they didn't write.

**Chose:** comment the association with a TODO naming the exact unblocking condition (`clinic.js` exists _and_ is registered). The `associate` hook itself stays, so the pattern to copy is still visible.

### D3 — No uniqueness constraint on patient identity

Inherited from the locked contract; restated because it looks like an oversight and someone will "fix" it.

No natural key identifies a person — twins share surname and DOB, Jr./Sr. share names, households share phones, and names have spelling variants. A unique index on `(clinicId, phone)` would block legitimate registrations at the worst possible moment: a real patient standing at the desk.

**Chose:** a **non-unique** index on `(clinicId, phone)` — fast candidate lookup, no assertion that the pair identifies one person. Duplicate detection is an application workflow returning `409 DUPLICATE_PATIENT` with candidates for receptionist confirmation.

**Trade-off, stated plainly:** the database will no longer stop duplicates. That responsibility moves entirely into application code, which is why [S1](#s1--one-phone-normalizer-load-bearing) is load-bearing rather than a convenience helper.

### D4 — `501 NOT_IMPLEMENTED` stubs on every route

Routes are wired with real `auth` and `authorize` middleware but stub handlers.

**Rationale:** the auth and role layer is exercised from day one, and each lane's starting point is "replace the stub", not "invent the file layout". A lane owner can confirm their role gate works before writing any logic.

**Trade-off:** `501` on a mounted route is indistinguishable from a genuinely broken deployment if someone forgets what phase the project is in. The README lists what's stubbed.

### D5 — Queue transition table is data; the guard is a stub

`TRANSITIONS` is a filled-in array; `assertCanTransition()` throws `501` with a TODO enumerating the three checks (admin override → legal move → role ownership).

**Rationale:** the table is contract data and belongs in the scaffold; the guard is Lane 1's work and shouldn't be pre-empted. The TODO also places the **concurrency guard in the calling service, not in the guard function** — the caller must re-read the queue row inside a transaction and compare status immediately before writing. A pure function can't protect against two nurses advancing the same visit simultaneously, and putting the note here is cheaper than discovering it in testing.

### D6 — `Staff.email` is globally unique, not per-clinic

The intuitive schema is a unique index on `(clinicId, email)` — one clinic can't invite the same address twice, but two different clinics can each invite the same person. That models the real world correctly: a locum doctor working two clinics has one email.

**Chose:** a **global** unique index on `email`, matching `Clinic.email`.

**Why the intuitive version is wrong here:** `POST /auth/login` takes `{ email, password }` and nothing else — no `clinicId`, and no way to supply one, since the clinic scope is read *out of* the token the login call is trying to issue. So the lookup is `findOne({ where: { email } })`. If two clinics hold the same address, that query matches two rows and Sequelize gives no guarantee which comes back — the user lands in an arbitrary clinic. `Clinic.email` is globally unique for exactly this reason; staff email is under the same constraint and needs the same answer.

**Trade-off, stated plainly:** one human with one email address cannot hold accounts at two clinics in v1. That is a real limitation, not an oversight. Revisit when login gains a disambiguator — a clinic selector in the request, a clinic-qualified login URL, or an account-picker step after a multi-hit email lookup. Any of those makes per-clinic uniqueness safe; none of them exist today.

The `(clinicId, email)` index is still present, **non-unique**, to serve clinic-scoped reads (`GET /users`, `GET /staff/doctors`).

### D7 — One password hasher, shared by both credential tables

`clinics` and `staff` both store password hashes, so the `beforeCreate`/`beforeUpdate` hooks and `comparePassword` existed as byte-for-byte copies in two models.

**Chose:** `utils/password.js` exporting `hashPassword` and `comparePassword`. `SALT_ROUNDS` lives there and nowhere else; no model imports `bcrypt` directly.

**Rationale:** same category as [S1](#s1--one-phone-normalizer-load-bearing) and [S2](#s2--one-role-gate). A second copy means raising the cost factor, or fixing a bug in the hook guards, silently applies to only one kind of account — and the account it misses is the one nobody tested. Added to the README's shared-code table so it's covered by the same "do not fork" rule.

### D8 — Queue cancellation: a terminal status, note-required, admin-included

Adds `Checked-In → Cancelled` (role `receptionist`) to `TRANSITIONS`, makes `Cancelled` a real `QueueStatus`, and requires a note on the move. Resolves [Q1](#q1--is-cancelled-a-queue-status).

**`Cancelled` is a terminal queue status, not only an appointment status.** Q1 flagged the ambiguity: the contract calls an active visit "any status except `Completed`/`Cancelled`", yet `Cancelled` wasn't in the queue enum. Chosen reading: a visit *can* be abandoned mid-flow, so `Cancelled` joins the queue enum and stays **out** of `ACTIVE_QUEUE_STATUSES`. This is load-bearing for `409 QUEUE_ALREADY_CHECKED_IN` — a cancelled visit is closed, so the patient can check in again. The alternative (no cancel path) would strand a patient who abandoned a visit, unable to ever re-register.

**The note is a validation requirement, not a permission one — and it's table-driven.** The rule lives on the row (`requiresNote: true`), not as an `if (nextStatus === CANCELLED)` in the function, so a second note-requiring transition would change only the table. A missing note is `400 VALIDATION_ERROR` — the move is legal and the role is right, so it's neither `409` nor `403`; it's a missing field. Order matters: legality → role → note, so a caller is never told their note is missing for a move that wasn't theirs to make.

**The note requirement survives the admin override; the permission checks don't.** Admin's override is about *who may act*, so it skips the legality and role checks. A note is about *whether the reason gets recorded* — a different axis — so it is **not** skipped. The guard splits accordingly: the `isAdmin` bypass wraps only the two permission checks. This matters because the system is billing-adjacent (BR-006): an admin silently cancelling a visit that already has vitals or a consultation is exactly what an audit trail exists to catch.

**The note check is keyed on the destination, not the matched row.** First cut asked "does the matched transition require a note", which left a hole: an admin cancelling from a state no row declares (`Awaiting Payment → Cancelled`) bypassed the table lookup entirely and so escaped the note. That undefined path is the one cancellation route with *no other guardrail*, so it's where the note matters most — the first cut had it backwards, guarding the ordinary path and freeing the powerful one. Fixed by asking "does any row into `nextStatus` require a note" (`TRANSITIONS.some(t => t.to === nextStatus && t.requiresNote)`) — still no status literal in the logic, just a different slice of the same data. Because every cancel-row carries `requiresNote`, it reads as "moving to Cancelled always needs a note, regardless of which row matched or whether one matched at all."

**Note validation rejects blanks.** Empty string and whitespace-only count as missing (`note.trim().length > 0`) — a blank reason is no reason.

### D9 — CORS: env-driven allow-list, rejection routed through `ApiError`

The frontend now calls the API from a browser, which is the trigger the deferred CORS item named. Added the `cors` middleware in `app.js` with an origin allow-list read from `CORS_ORIGIN` (comma-separated, in `.env.example`), and `FORBIDDEN_ORIGIN` to the error catalog.

**Allow-list is configuration, not code.** Origins live in `CORS_ORIGIN` and are parsed at boot (`split(',')`, trimmed, empties dropped), so dev/staging/prod differ by env alone — no code change to add a frontend host. Empty/unset `CORS_ORIGIN` means no browser origin is allowed, which fails closed.

**Requests with no `Origin` header pass.** Server-to-server calls, curl, and health checks send no `Origin`, so they're allowed through — CORS is a *browser* enforcement, not an authentication layer, and must never stand in for the `Authorization` header. The role gate ([S2](#s2--one-role-gate)) and `auth` middleware remain the actual access control.

**Rejection is an `ApiError(403, FORBIDDEN_ORIGIN)`, not a bare `Error`.** This is the whole reason the code exists: a plain `Error` from the origin callback falls through `errorHandler` to the generic `500 INTERNAL_ERROR` branch ([S3](#s3--errors-go-through-apierror--one-handler)) — the wrong status (a `403` access decision, not a server fault) and inconsistent with every other rejection in the API. Routing through `ApiError` renders the contract's error envelope with the right code. Verified end-to-end (allowed → 200, disallowed → 403 `FORBIDDEN_ORIGIN`, no-Origin → 200), and covered in `tests/cors.test.js`.

**Now documented in the contract.** Per the deferred note, CORS earns a line in the contract's Conventions and `FORBIDDEN_ORIGIN` joins the error catalog — done here, not before.

### D10 — Queue routes go live: transition history, unpaginated reads, admin attribution

Wires `GET /queue` and `POST /queue/:queueId/status` to the real model, which turns the rulebook (D5, D8) into a callable endpoint. Several decisions came out of it, plus one defect each in the schema and the actor-attribution model.

**The `patients` table had never existed** _(fixed a real defect)_. The `Patient` model shipped in the first scaffold as the reference every other model copied, but no migration was ever generated for it. Confirmed twice — `migrate:status` listed no such migration, `pg_tables` showed only `clinics`/`staff`. Nothing had noticed because nothing calls `Patient.create()`: the receptionist-route check hit a `501` stub that never reaches the DB. Same class as the `clinics.updateAt` typo — invisible until something writes. Found by checking the premise behind `queue_entries.patientId`'s FK deferral rather than trusting it. Created now, with the non-unique `(clinicId, phone)` index D3 requires; the deferred FK (`RESTRICT`, matching `assignedDoctorId`) follows in its own migration.

**Transition history is its own table, not a column.** `queue_status_events` (queueEntryId, fromStatus, toStatus, changedBy, note, createdAt) is written by the queue service in the *same transaction* as the status change, so a move can never exist without its reason nor a reason without its move. A `lastNote` column on `queue_entries` was the cheaper option and is wrong: the next transition overwrites it, so a cancelled visit's reason vanishes the moment it's re-checked-in — exactly backwards for something audit-sensitive. It's also the data source the deferred queue-bottleneck dashboard metric will need (time-in-status, from consecutive event timestamps), so it's forward-compatible with a named requirement rather than speculative.

**`changedBy` is a soft reference with no FK** _(fixed a real defect, caught by the route tests)_. The first cut FK-constrained it to `staff`, which passed every test until the admin-override case: **admin is the clinic account**, so its token subject is a *clinic* id, and writing that into a staff-constrained column raised `23503` — a documented feature returning `500`.

**This is not [D3](#d3--no-uniqueness-constraint-on-patient-identity)'s argument, and shouldn't be read as it.** D3 dropped a constraint because the underlying fact was *ambiguous* — no combination of fields reliably identifies a person, so the database genuinely cannot know. Here nothing is ambiguous: at write time the code knows exactly which table `actor.id` belongs to (`actor.role === ADMIN` or not). The fact is perfectly determinate and merely **unrepresentable** as one hard FK, because Postgres cannot point a single column at two tables. Different problem, different justification, same shape of outcome.

**The alternative was considered and traded off.** Two nullable columns — `changedByStaffId` FK→`staff`, `changedByClinicId` FK→`clinics`, exactly one populated — would keep full referential integrity and remain expressible in the schema. It was rejected for a 14-day project: it doubles the column count on every actor-stamped table, pushes a two-column `COALESCE` into every read, and needs a `CHECK` to enforce the exactly-one rule. The soft reference is the cheaper trade, not the only option. If audit rigor later outweighs simplicity, that's the migration to write.

**Consequence, accepted deliberately: `changedBy` loses `SET NULL` on staff deletion.** The original plan had it; without an FK, deleting a staff row leaves old events pointing at an id that no longer resolves. For an append-only audit log that is arguably the *correct* behavior — the true actor id should outlive the actor's employment record, and an event that silently forgets who did it is worse than one naming a departed staffer. Weighed, not overlooked.

**`queue_entries.lastUpdatedBy` is nulled on admin action, not left stale.** That column *is* FK-constrained to `staff` (from an already-merged migration), so it's written only for staff actors — but the service explicitly assigns `null` rather than skipping the write. Leaving it untouched would be worse than useless: after an admin override the row would still name whichever staff member touched it *previously*, a plausible-looking attribution for a move that person did not make. **No name beats a wrong name.** The read rule that follows: `lastUpdatedBy` is best-effort, staff-only, and answers "which staff member last touched this"; `queue_status_events` is the source of truth for who actually did what, admin included. Anyone computing attribution or dashboard metrics should read the event log, not the entry field. A route test asserts this specifically — a staff member stamps the row, then admin acts, and the stale value must be gone; the earlier admin test could not detect the difference, since a fresh visit is `null` either way.

Worth noting for whoever adds the next actor-stamped column: any "who did this" field has the same two-kinds-of-account problem.

**`POST /:queueId/status` mounts `auth` with no `authorize()`.** Deliberate, and commented in the route file so it isn't "fixed" by copying `patient.routes.js`. A static role list can't express "nurse owns this move, but only from `Checked-In`" — it never sees the row's current status. `assertCanTransition` is the only thing holding that context, so it *is* the gate here; a static list would either name all five roles (achieving nothing) or silently block a legitimate transition. This does not contradict [S2](#s2--one-role-gate): the guard is the single gate, not a second one.

**`GET /queue` is unpaginated, by decision not omission.** The Conventions section applies pagination to list endpoints generally, but section 4's own entry for `GET /queue` lists only `?status=&assignedDoctorId=`. A live queue is bounded by the patients physically in the building. Revisit if a clinic ever runs a queue long enough to matter.

**Consumed by other lanes as a function, not an HTTP call.** The automatic transitions (`In Consultation → Awaiting Payment`, `Awaiting Payment → Completed`) are real rows in `TRANSITIONS`, so Lane 3's consult-complete and Lane 4's payment must import `changeStatus` from `services/queue/queue.service.js` directly — per [Q2](#q2--queue-state-machine-imported-module-or-internal-http-call)'s module reading — rather than building a second write path. The concurrency lock and the event write live inside that function; a parallel path would silently skip both.

### D11 — Appointment: resolved and merged in Victor's absence

PR #5 (`Appointment` model + migration) sat blocked for over a day on a migration collision, with no response from its author after a same-day review. With Lane 2/3/4 all gated on `patients` and now `appointments` existing, this was the actual blocker for the rest of the project — resolved and merged by the lead rather than left waiting indefinitely. Everything below was verified against a real Postgres instance before merging, the same bar as every other model this session; two of the calls are genuine judgment calls made without Victor's input, flagged here so he can revisit them.

**The collision, fixed by deletion and re-timestamping, not by picking a winner arbitrarily.** Victor's `20260724161530-patient-migration.cjs` and the already-merged `20260725124601-create-patients.cjs` (D10) create the identical table — verified field-for-field identical. Main's version was kept because it had already been exercised (a real `Patient.create()` round-trip, a same-phone duplicate proving the D3 non-unique index, `updatedAt` confirmed correct); Victor's had not been run anywhere. His duplicate migration is deleted. His `20260724181350-appointments-migration.cjs`, which FKs to `patients`, is re-timestamped to `20260725150000` so it sorts after every migration currently on `main` — otherwise a fresh clone would try to create `appointments` before `patients` exists and fail on the FK.

**Model/migration drift, fixed while it was still safe to fix in place.** The model's index is `(clinicId, doctorId, date)`; the migration only created `(clinicId, doctorId)` — missing `date`. Since this migration has never run anywhere shared, it was corrected directly rather than shipped as a follow-up (the same rule D10 used for its own index comments: change both or neither, and do it before anyone else has the old version).

**Judgment call, made without Victor: `onDelete: RESTRICT` on `patientId` and `doctorId`, not `CASCADE`.** His original had `CASCADE` on both. Changed to match `queue_entries`' precedent for the identical shape of relationship: appointment history is a record, and deleting a patient or a staff member shouldn't silently delete the fact that an appointment happened. `clinicId` stays `CASCADE` — deleting a whole tenant reasonably takes its appointment history with it, same as every other clinic-scoped table. Verified directly: a `patient.destroy()` with an attached appointment is rejected by Postgres, not just assumed from the migration text.

**Judgment call, made without Victor: no double-booking guard.** Nothing stops two appointments for the same doctor at the same date and time. The contract doesn't require one for v1, and this is exactly the kind of thing not to invent unasked — a guard has a real design question behind it (is a `(clinicId, doctorId, date, time)` unique index right, or should distinct time slots of different lengths need an overlap check instead?) that deserves an actual decision, not a placeholder. Deliberately deferred, not silently missing: revisit before appointments carries real scheduling weight, and treat this as open rather than settled.

**Stray local config removed.** `package.json` had `"allowScripts": { "bcrypt@5.1.1": true }` — not a field npm reads, and no `lavamoat`/`@lavamoat/allow-scripts` dependency exists anywhere in the repo to read it either. Almost certainly a personal tool artifact from Victor's machine that did nothing for anyone else. Removed rather than left as unexplained dead config.

**The numbering collision this entry warned about is resolved here.** This entry landed as `D11` against `main`; the auth branch (PR #9) independently had its own `D11`/`D12` against an earlier base. Merging auth second (this merge), its two entries are renumbered to `D12`/`D13` below, keeping this entry's number and its inbound link from the deferred-items table stable.

### D12 — `DUPLICATE_EMAIL`, and email uniqueness across two credential tables

Adds `DUPLICATE_EMAIL` (409) to the catalog and makes email unique across `clinics` **and** `staff`, not merely within each. Found while writing `POST /auth/login`, before the lookup was built on the assumption it turned out to violate.

**Why a new code instead of reusing `VALIDATION_ERROR`.** Signup's first cut reported a taken email as `400 VALIDATION_ERROR`. A taken email is a conflict, not a malformed field, and the catalog maps each code to exactly one status — reusing a 400-mapped code for a 409 situation corrupts a mapping the frontend and mobile clients read directly. Same category of drift [S3](#s3--errors-go-through-apierror--one-handler) exists to prevent, one level up: at the enum rather than the handler. Adding a code is a contract change, so it landed in `API_CONTRACT.md` first.

**One code, two writers.** `DUPLICATE_EMAIL` is raised by `POST /auth/clinic/signup` and `POST /auth/invite` — the two endpoints that *create* a credential row. `POST /auth/login` never raises it: login is a read and cannot violate a uniqueness rule. The messages differ per situation even though the code is shared.

**The real finding: cross-table collisions.** `clinics.email` and `staff.email` are two separate unique indexes on two separate tables. Each guards only itself, so **nothing prevented the same address existing in both** — and login looks up by email alone. That is [D6](#d6--staffemail-is-globally-unique-not-per-clinic)'s exact ambiguity (`findOne` matching a row the caller didn't mean) reappearing across tables after being eliminated within one. Left alone, login's "check Clinic, then Staff" would have rested on a premise the schema does not guarantee.

**Chosen:** an application-level pre-check (`assertEmailAvailable`) querying both tables before either write. Postgres cannot express a unique constraint spanning two tables, so this cannot be a database rule without restructuring credentials into a shared table — too large a change for a 14-day build, and recorded here as the thing to revisit if it ever matters more.

**Exactly what is and isn't covered — read this part before trusting it.**
- **Same-table collisions remain race-proof.** Two concurrent signups with one email both pass the pre-check; the `clinics.email` unique index then rejects the loser, and the service maps that to the same `409 DUPLICATE_EMAIL`. The pre-check supplies the clean message, the constraint supplies the guarantee — the same two-layer pattern as the one-active-visit rule.
- **Cross-table collisions are not.** Two concurrent requests — one reaching `Clinic.create`, the other `Staff.create`, with the same email, in the same instant — can both pass `assertEmailAvailable` before either write lands, and **no index catches it**, because no index spans both tables. The result is one email in two tables and an ambiguous login.

So the honest guarantee is: **globally unique except under simultaneous cross-table writes.** That window is small (a clinic signing up at the same moment someone is invited with that same address) and the blast radius is one ambiguous account, not data loss. Accepted for the MVP, in the same spirit as [D3](#d3--no-uniqueness-constraint-on-patient-identity)'s missing phone backstop and [D10](#d10--queue-routes-go-live-transition-history-unpaginated-reads-admin-attribution)'s `SET NULL` loss: a named limitation, not an oversight. If it ever needs closing, the fix is a shared credentials table with one unique index — not a bigger pre-check.

**Two orderings inside `loginUser`, and what each costs.**
- **Fall through on "not found" only, never after a wrong password.** Valid *because* of the guard above: at most one row can match, so a matched row is definitionally the account, and a mismatch is terminal. Without the cross-table guard this reasoning would be unsound — the two decisions are load-bearing on each other, not independent.
- **Staff status is checked before the password compare.** Not a courtesy: an `invited` row's password is `null`, so there is nothing to compare against and `comparePassword` would be meaningless. The cost is a mild account-enumeration signal — `403 INVITE_NOT_ACCEPTED` confirms the address is registered, where a wrong password would not. The contract mandates that error for this case, so the leak is accepted; the two *other* failure modes (unknown email, wrong password) return a byte-identical `401`, asserted equal in the tests rather than assumed.

### D13 — Invite tokens: clearing on accept collapses two error cases into one

`POST /auth/invite` and `POST /auth/accept-invite`. Three decisions worth recording; one of them resolves a genuinely open question rather than filling in a blank.

**Invite-message differentiation, not a copy of signup's.** `assertEmailAvailableForInvite` gives a different message per situation rather than reusing signup's "already registered": the email belongs to a *clinic* account, the email is already staffed at *this same clinic* (a literal re-invite), or the email is staffed at a *different* clinic entirely. Same `DUPLICATE_EMAIL` code throughout (D12) — only the message adapts to what's actually true, since "already registered" reads oddly for an admin re-inviting their own already-invited receptionist.

**Role is validated against `INVITABLE_ROLES` before touching the database**, not left to the model's `isIn` validator. `INVITABLE_ROLES` is now exported from `staff.js` rather than staying module-private, so the service can produce a clean 400 with the actual list of valid roles instead of surfacing Sequelize's generic validator text. One export, still one source of truth — the service didn't get its own copy of the filter.

**The real design call: what happens when `accept-invite` is hit on an already-active row.** No catalog code is a clean fit — the request is well-formed and the state conflict isn't quite `VALIDATION_ERROR`. Resolved by clearing `inviteToken` to `null` at the moment of successful accept, which answers both halves of the question in one move:
- **The two failure cases collapse into one.** Once a row is active, its `inviteToken` is `null`, so it can never be found by the old token again. "This token was never issued" and "this token already got used" become the identical query result — `404 NOT_FOUND`, `"This invite link is invalid or has already been used."` There's no second state to invent a code for, because the lookup itself can no longer distinguish them.
- **That collapse is also the actual security property being asked for, not just a tidy error.** Without clearing the token, an old invite link sitting unused in an inbox would remain a **permanently valid, unauthenticated password-reset mechanism** for that account — `accept-invite` doesn't gate on current password, so anyone holding a stale link could silently overwrite an active staffer's password at any time. Nulling the token is what makes the link stop *working*, not merely what makes the error message nicer. Verified directly: a replayed token after a successful accept is rejected, and the original password is confirmed unchanged, not merely "an error was returned."

**Considered and rejected: an explicit `staff.status !== 'active'` check alongside the token-clearing.** Given the token invariant (active ⇒ `inviteToken` is `null`, enforced nowhere else but this one function), a second guard would be checking a condition this same code makes structurally unreachable — dead code standing in for a scenario nothing today can trigger, the thing the project has generally avoided elsewhere (no defensive validation for states that can't occur). If a future feature ever needs to re-arm an active row with a fresh invite token (e.g. an admin-triggered password reset by re-invite), that feature has to edit this exact function to do so — which is exactly when this decision should be revisited, not before.

**Concurrency: the same discipline as the queue guard (D5), applied here for the first time outside the queue.** `acceptInvite` re-reads the Staff row with `lock: t.LOCK.UPDATE` inside a transaction before writing, so two near-simultaneous accepts of the same token can't both succeed. This isn't hypothetical defense — it was proven with a real concurrent test (`Promise.all` of two accept calls, same token, different passwords): exactly one request gets `200`, the other's re-read finds nothing (`404`, the token is already cleared by the winner) and the row ends up with only the winner's password set, never a partially-applied state.

**`FRONTEND_URL` is a new env var, not a contract change.** The contract specifies `POST /auth/invite`'s response as "a staff record ... plus an inviteLink" without naming a URL format; the base URL used to build that link is server configuration, the same category as `PORT` or `CORS_ORIGIN`, not a request/response shape — so it lives in `.env.example`, no contract PR needed. The response is the staff fields spread flat with `inviteLink` alongside them (matching the contract's own flat style, e.g. `GET /auth/me`), not nested under a `staff` key the contract never names.

---

## Shared code

Six files are single-source. A second copy is a bug, not a convenience. Enumerated in the README so "I'll just write a small local helper" is visibly against the rules.

### S1 — One phone normalizer, load-bearing

`utils/phone.js` is the only thing standing between duplicate detection and a silently missed match, because [D3](#d3--no-uniqueness-constraint-on-patient-identity) removed the database backstop. Two lanes normalizing differently means one lane's "no match found" is another's duplicate.

**Extended the original:** added the bare 10-digit case (`8031234567`, typed without the leading zero) alongside `+234`/`234`/`0` prefixes. All four formats now collapse to one value — verified, see below.

**Known limitation:** the implementation assumes Nigerian numbering. An international number won't normalize meaningfully. Fine for the MVP's single-market scope; would need revisiting before any multi-country deployment.

### S2 — One role gate

`middlewares/authorize.js` is the only permission check. The contract is explicit that lanes must not re-implement it — divergent role logic across four lanes is how a cashier ends up able to complete a consultation.

**Hardened:** it now returns `401` if `req.user` is absent, rather than throwing on `undefined.role`. Guards against being mounted without `auth` in front of it.

### S3 — Errors go through `ApiError` + one handler

Handlers `throw new ApiError(status, code, message)`; `errorHandler` renders the contract's error envelope. Nothing builds an error response inline.

**Rationale:** the envelope shape is a contract promise consumed by frontend and mobile. One rendering site means it can't drift in a corner of lane 3.

**Trade-off:** an unrecognised error becomes a generic `500 INTERNAL_ERROR` with the detail only in server logs. That's deliberate for a public API, but means debugging depends on log access.

### S4 — `ACTIVE_QUEUE_STATUSES` derived once

The "one active visit per patient" rule needs a definition of active in code, not prose. Exported from `constants/index.js` so the check can't be re-derived inconsistently. See [Q1](#q1--is-cancelled-a-queue-status) — the definition has an ambiguity worth resolving.

---

## Workflow

### W1 — `main` protected, admins exempt

Applied: PR required, 1 approving review, stale approvals dismissed on new commits, force-push and deletion blocked, conversations must be resolved before merge. `enforce_admins: false`.

**The trade-off, explicitly:** with admin enforcement on, the lead — who is also a lane owner — could not merge their own work without a teammate's approval, which risks deadlock on a four-person team where reviewer availability is uneven. With it off, the rule disciplines the three lane owners and the lead keeps an escape hatch.

**The cost:** the exemption is silent. Nothing warns before a direct push to `main`, which is precisely the accident the rule exists to prevent. Mitigation is habit, not tooling — the lead should use PRs anyway. Worth flipping to enforced if the team's review latency turns out to be fine.

Added beyond the original list: required conversation resolution, so review comments can't be silently merged past. Cheap to remove if it feels heavy.

### W2 — `.gitattributes` with `eol=lf`

Committed after seeing git's CRLF warnings on a Windows machine. Mixed-OS teams otherwise produce whole-file diffs on save, which makes reviews unreadable and hides the actual change. Cheaper to set before the first branch than to normalize later.

### W3 — Empty directories tracked with `.gitkeep`

`controllers/`, `migrations/`, `seeders/` are empty. Git doesn't track directories, so without these the structure a lane owner clones wouldn't match the documented layout.

---

## Verification record

Nothing below is inferred from reading the code — each was executed against the running app on 2026-07-21, Node 22.22.0.

| Check                             | Result                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm install`                     | 269 packages, clean; `bcrypt` native build succeeded                                                          |
| `GET /api/health`                 | `200 {"success":true,"data":{"status":"ok"}}`                                                                 |
| No token                          | `401 UNAUTHENTICATED`                                                                                         |
| Malformed token                   | `401 UNAUTHENTICATED`                                                                                         |
| Nurse → `POST /patients`          | `403 FORBIDDEN_ROLE`                                                                                          |
| Receptionist → `POST /patients`   | `501 NOT_IMPLEMENTED` (stub reached — gate passes the right role)                                             |
| `normalizePhone` × 4 formats      | `+234 803…`, `234803…`, `0803…`, `803…` → all `08031234567`                                                   |
| `assertCanTransition`             | throws `501 NOT_IMPLEMENTED` as intended                                                                      |
| `sequelize-cli` + `.sequelizerc`  | loads `config.cjs`, writes to `src/migrations/`                                                               |
| ESM `.sequelizerc` (control test) | CLI silently prints help, runs nothing — confirms [M2](#m2--sequelizerc-must-be-commonjs-fixed-a-real-defect) |
| Remote file tree after push       | 27 files; **no `.env`, no `node_modules`**                                                                    |
| Branch protection                 | read back from the API, all seven settings as intended                                                        |
| Live database verification        | `sequelize.authenticate()` successfully connects and the application boots as expected                        |

The database connection has been verified: `sequelize.authenticate()` successfully connects to the local PostgreSQL database, and the application boots on the configured port.

---

## Open questions

Unresolved. Each needs an owner before the work it blocks starts.

### Q1 — Is `Cancelled` a queue status? — **RESOLVED, see [D8](#d8--queue-cancellation-a-terminal-status-note-required-admin-included)**

The contract defines an active visit as "any status except `Completed`/`Cancelled`", but `Cancelled` is not in the Queue Status enum — it only appears in Appointment Status. So either a queue entry can be cancelled and the enum is incomplete, or visits are never cancelled and the definition should say `Completed` only.

`ACTIVE_QUEUE_STATUSES` currently assumes the latter. **This affects the `409 QUEUE_ALREADY_CHECKED_IN` check**: if a visit can be abandoned mid-flow with no cancel path, that patient can never check in again. Worth resolving before Lane 2 builds check-in.

**Resolved:** `Cancelled` *is* a queue status. `Checked-In → Cancelled` is a real, note-required transition, and `Cancelled` is terminal (excluded from `ACTIVE_QUEUE_STATUSES`), so a cancelled visit frees the patient to check in again. See D8 for the full reasoning.

### Q2 — Queue state machine: imported module or internal HTTP call?

The contract says the queue is "shared; called by every lane" without specifying the mechanism. The scaffold assumes a directly imported module (`services/queue/transitions.js`), which is the simpler reading — but this was never explicitly confirmed, and it changes how every other lane calls into the queue. Raised during setup; still unanswered.

### Q3 — Where does the flat consultation fee come from?

`POST /consultations/:id/complete` creates an invoice at a "flat fee". Not specified whether that's a constant, a per-clinic setting, or a config value. Lane 3 and Lane 4 both need the answer, and it likely implies a column on the clinic record — which means it belongs in the schema work.

### Q4 — Shared-utils module layout

Flagged during setup as worth settling before the first commit; the current single-file-per-concern layout under `utils/` is a default, not a decision. Fine as-is, but if it's going to change, cheaper now than after four lanes import from it.

---

## Deliberately deferred

Not oversights. Each is a conscious "not yet", with the trigger for revisiting.

| Deferred                                 | Why                                                                                       | Revisit when                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 5 of 10 models remain (Vitals, Consultation, Prescription, Invoice, Payment) | Schema is the critical path for Lanes 3 and 4                             | Lane 3 / Lane 4 start                                                                                              |
| Appointment double-booking guard         | Real design question (unique index vs. overlap check) the contract doesn't mandate for v1 | Before appointments carries real scheduling weight — see [D11](#d11--appointment-resolved-and-merged-in-victors-absence) |
| `assertCanTransition` implementation     | Lane 1's work, not the scaffold's                                                         | Lane 1 starts                                                                                                      |
| Concurrent-duplicate lock (phone-scoped) | Post-MVP per the contract; residual duplicates handled administratively                   | Real concurrent load                                                                                               |
| Tests                                    | ~~No framework installed~~ **In use.** `node --test` (zero-dep), 20 tests: transition guard, CORS, and DB-touching queue route coverage | Broaden as each lane's handlers land                     |
| Linting                                  | An `eslint-disable` comment already exists with no ESLint — mild inconsistency, accepted  | Team agrees on a style                                                                                             |
| CI                                       | Nothing to run without tests                                                              | Tests exist                                                                                                        |
| `CONTRIBUTING.md` + PR template          | Branch naming and PR expectations currently live only in the README                       | Before lanes branch                                                                                                |
| CORS (Lane 1 / `app.js`)                 | ~~Not in `app.js` today~~ **Done — see [D9](#d9--cors-env-driven-allow-list-rejection-routed-through-apierror).** Env-driven allow-list, `403 FORBIDDEN_ORIGIN`, now in the contract's Conventions | — |
