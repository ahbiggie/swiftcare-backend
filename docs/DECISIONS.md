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

### Q1 — Is `Cancelled` a queue status?

The contract defines an active visit as "any status except `Completed`/`Cancelled`", but `Cancelled` is not in the Queue Status enum — it only appears in Appointment Status. So either a queue entry can be cancelled and the enum is incomplete, or visits are never cancelled and the definition should say `Completed` only.

`ACTIVE_QUEUE_STATUSES` currently assumes the latter. **This affects the `409 QUEUE_ALREADY_CHECKED_IN` check**: if a visit can be abandoned mid-flow with no cancel path, that patient can never check in again. Worth resolving before Lane 2 builds check-in.

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
| 9 of 10 models + first migration         | Schema is the critical path and blocks all four lanes                                     | **Next.** Highest priority.                                                                                        |
| `assertCanTransition` implementation     | Lane 1's work, not the scaffold's                                                         | Lane 1 starts                                                                                                      |
| Concurrent-duplicate lock (phone-scoped) | Post-MVP per the contract; residual duplicates handled administratively                   | Real concurrent load                                                                                               |
| Tests                                    | No framework installed; nothing to test while every handler is a stub                     | First real handler lands                                                                                           |
| Linting                                  | An `eslint-disable` comment already exists with no ESLint — mild inconsistency, accepted  | Team agrees on a style                                                                                             |
| CI                                       | Nothing to run without tests                                                              | Tests exist                                                                                                        |
| `CONTRIBUTING.md` + PR template          | Branch naming and PR expectations currently live only in the README                       | Before lanes branch                                                                                                |
| CORS (Lane 1 / `app.js`)                 | Not in `app.js` today; documenting unbuilt behavior would violate this doc's own standard | **Before frontend calls the API from a browser.** Then it earns a line in the contract's Conventions — not before. |
