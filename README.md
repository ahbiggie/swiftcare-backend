# SwiftCare Backend

Clinic management API — patient registration, queue, consultations, billing.

**Stack:** Node.js · Express · PostgreSQL · Sequelize · ESM

The API surface is defined in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**, which is **locked**. Read it before writing a handler. Any shape change lands there first, via PR, and only then in code.

Why the code is shaped the way it is — trade-offs, rejected alternatives, and open questions — is in **[docs/DECISIONS.md](docs/DECISIONS.md)**. Read it before changing anything in the scaffold that looks wrong; several things that look like oversights are load-bearing.

---

## Two rules that will bite you

**1. `sequelize-cli` is CommonJS. Its files use the `.cjs` extension — everything else in `src/` is ESM.**

`src/config/config.cjs` and `.sequelizerc` are loaded by the CLI with `require()`, not by Node's ESM loader. They use `require` / `module.exports` on purpose. Do not "fix" them to `import` / `export default` — the CLI will throw a `SyntaxError` before it starts. Every other file in `src/` is ESM.

This extends to **migrations and seeders**. `sequelize-cli migration:generate` emits a `.js` file containing `module.exports` — **rename it to `.cjs` immediately**:

```bash
npx sequelize-cli migration:generate --name create-patients
mv src/migrations/<timestamp>-create-patients.js src/migrations/<timestamp>-create-patients.cjs
```

The CLI discovers `.cjs` fine (its file pattern is `/\.(cjs|js|cts|ts)$/`). Left as `.js`, whether it works depends on your Node version: Node 22's automatic syntax detection quietly loads it as CommonJS, older versions throw `ReferenceError: module is not defined`. `.cjs` removes the ambiguity — use it so the repo behaves the same on everyone's machine.

**2. Always include the `.js` extension on relative imports — `'./y.js'`, not `'./y'`.**

ESM does not resolve extensionless paths. This is the number one "worked in CJS, broke in ESM" bug, and it fails at runtime, not at write time. Bare package imports (`'express'`, `'sequelize'`) do not take an extension — only relative paths do.

---

## Setup

```bash
git clone https://github.com/ahbiggie/swiftcare-backend.git
cd swiftcare-backend
npm install
cp .env.example .env     # then edit DB_USER / DB_PASSWORD to match your local Postgres
createdb swiftcare
npm run dev
```

Verify:

```bash
curl http://localhost:3000/api/health
# {"success":true,"data":{"status":"ok"}}

# Run the test suite:
npm test
```

On Windows, `createdb` requires the PostgreSQL `bin` directory on your `PATH`. If it isn't, create the database from pgAdmin or psql instead. Also, if PowerShell script execution is disabled, you can run tests directly using `node --test`.

### Scripts

| Script                 | Does                                 |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Start with nodemon (reloads on save) |
| `npm start`            | Start once                           |
| `npm run migrate`      | Run pending migrations               |
| `npm run migrate:undo` | Roll back the last migration         |
| `npm run seed`         | Run all seeders                      |
| `npm test`             | Run unit tests (via `node --test`)   |

---

## Layout

```
src/
├── config/        database.js (ESM, app runtime) · config.cjs (CJS, CLI only)
├── constants/     every enum + error code — import, never inline the string
├── models/        explicit registry in index.js; one file per model
├── migrations/    sequelize-cli, .cjs
├── seeders/       sequelize-cli, .cjs
├── middlewares/   auth · authorize · errorHandler
├── services/      business logic, incl. queue/transitions.js
├── controllers/   request → service → response
├── routes/        one <resource>.routes.js per resource, registered in index.js
├── utils/         phone normalizer · password hashing · ApiError · response envelope
├── app.js         express wiring
└── server.js      DB connect + listen
```

## Shared code — do not fork these

Four lanes build in parallel against one contract. These six pieces are single-source; a second copy is a bug, not a convenience.

| File                       | Why it's shared                                                      |
| -------------------------- | -------------------------------------------------------------------- |
| `constants/index.js`       | Enum drift breaks the queue state machine silently                   |
| `middlewares/auth.js`      | The one place the JWT is read                                        |
| `middlewares/authorize.js` | The one role gate — don't re-implement per lane                      |
| `utils/phone.js`           | Load-bearing: there is no DB uniqueness backstop on patient identity |
| `utils/password.js`        | Two credential tables (`clinics`, `staff`) — salt rounds and hook guards must not drift |
| `utils/response.js`        | Every response uses the contract envelope                            |

## Adding a resource

1. Model → `src/models/<name>.js`, following `patient.js`. Register it in `models/index.js` (both the import and the `db` object).
2. Migration → `npx sequelize-cli migration:generate --name create-<name>`, then rename the generated file to `.cjs` (see rule 1).
3. Routes → copy `src/routes/patient.routes.js`, set the roles from the contract.
4. Controller + service → replace the `501` stubs.
5. Register the router in `src/routes/index.js`.

Throw `ApiError` with a code from `constants/index.js`; `errorHandler` converts it to the contract's error envelope. Don't call `res.status(...).json(...)` for errors inside a handler.

---

## Lane ownership

| Area                                    | Owner                    |
| --------------------------------------- | ------------------------ |
| Auth & accounts · Queue + state machine | Lane 1 — Shaibu          |
| Patients · Appointments & check-in      | Lane 2 — Victor          |
| Vitals · Consultations & prescriptions  | Lane 3 — Emmanuel Alliu  |
| Billing & payments · Dashboard & audit  | Lane 4 — Emmanuel Dosumu |

The queue state machine is Lane 1's, but every lane calls it. Coordinate before changing `services/queue/transitions.js`.

## Workflow

`main` is protected. Work on a lane branch, open a PR, and wait for review — every PR is reviewed before merge.

```bash
git checkout -b lane-1-auth
# commit, then:
git push -u origin lane-1-auth
```

## Project Progress & Todo

### Built / Implemented

- **Queue transitions guard**: `assertCanTransition()` in [transitions.js](src/services/queue/transitions.js) — the full rulebook including cancellation + required notes — verified in [queue-transitions.test.js](tests/queue-transitions.test.js).
- **Live queue routes**: `GET /queue` and `POST /queue/:queueId/status` are real, backed by [queue.service.js](src/services/queue/queue.service.js) (row-locked transaction, transition history in `QueueStatusEvent`). See [queue-routes.test.js](tests/queue-routes.test.js).
- **CORS**: env-driven origin allow-list, `403 FORBIDDEN_ORIGIN` on a disallowed origin.
- **Database Models**: 5 of the original 10 defined and registered in [index.js](src/models/index.js) — `clinic.js`, `staff.js`, `patient.js`, `appointment.js`, `queueEntry.js` — plus a 6th, `queueStatusEvent.js`, a bonus audit table outside the original 10.
- **Database Migrations**: 8 migrations created and executed — clinics, staff (+ a column-name fix), patients, queue_entries (+ its patients FK), queue_status_events, appointments.
- **Tests**: `node --test`, 21 passing on `main` (transition guard, CORS, live queue routes).

### In review, not yet on `main`

- **Auth**: `POST /auth/clinic/signup`, `/login`, `/invite`, `/accept-invite` are fully built with their own JWT util, tests, and a proven concurrency guard — sitting in an open PR awaiting review.

### Not built yet

- **Patients & appointments route handlers**: `patient.routes.js` is still `501` stubs — the `Patient`/`Appointment` models and migrations exist, but no controller logic reads or writes them yet. No `appointment.routes.js` exists at all.
- **`POST /queue/check-in`**: not started anywhere — this is what actually creates a `QueueEntry` in real use, and it's gated behind patient CRUD above.
- **`GET /auth/me`, `GET /users`, `GET /staff/doctors`**: no route, no stub.
- **Remaining 4 of 10 models**: `Vitals`, `Consultation`, `Prescription`, `Invoice`, `Payment` — none started.
- **Appointment double-booking guard**: deliberately deferred, see `DECISIONS.md`.
