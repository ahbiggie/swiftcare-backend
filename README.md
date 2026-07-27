# SwiftCare Backend

SwiftCare is a clinic management system. This repository is its backend: the server and database that the web and mobile apps talk to.

It covers a patient's whole visit, from walking in to walking out. A clinic signs up and gets an admin account, then invites its staff: receptionists, nurses, doctors, and cashiers. Each role can do different things, and the server enforces that.

A visit moves through a queue, one step at a time:

1. A receptionist registers the patient and checks them in.
2. A nurse records vitals (blood pressure, temperature, weight) and marks the patient ready.
3. A doctor runs the consultation, writes notes and a diagnosis, and prescribes medication.
4. A cashier takes payment against the invoice the consultation generated.

The server enforces that order. A visit cannot skip from check-in straight to payment, and only the right role can move a visit to the next step. Every move is recorded with who made it and when, so a clinic can see where visits get stuck.

One clinic can never see another clinic's data. Every request is tied to the clinic of the person making it.

**Built with:** Node.js · Express · PostgreSQL · Sequelize

## Where to look first

**[docs/API_CONTRACT.md](docs/API_CONTRACT.md)** lists every endpoint: the URL, who is allowed to call it, what it accepts, and what it returns. It is agreed and fixed. Read it before writing a handler. If something in it needs to change, change it there first in its own pull request, then write the code.

**[docs/DECISIONS.md](docs/DECISIONS.md)** explains why the code is written the way it is, including options that were considered and rejected. Some things in the scaffold look like mistakes but are deliberate, so check here before "fixing" one.

---

## Before you write any code

Two things about file extensions that cause confusing errors if you get them wrong.

### 1. Most files use `import`. A few must use `require`.

This project uses modern JavaScript modules (`import` / `export`). One tool, `sequelize-cli`, only understands the older style (`require` / `module.exports`). Files that tool loads must end in `.cjs` so Node knows to treat them differently.

That applies to `src/config/config.cjs`, `.sequelizerc`, and everything in `src/migrations/` and `src/seeders/`. They use `require` on purpose. If you change them to `import`, the tool stops working before it even starts, and the error message won't mention the file.

When you generate a migration, it comes out as `.js`. Rename it straight away:

```bash
npx sequelize-cli migration:generate --name create-patients
mv src/migrations/<timestamp>-create-patients.js src/migrations/<timestamp>-create-patients.cjs
```

If you leave it as `.js`, whether it works depends on your Node version. Node 22 quietly copes; older versions throw `ReferenceError: module is not defined`. Renaming it means the project behaves the same on everyone's machine.

### 2. Put `.js` on the end of your own imports.

Write `import x from './y.js'`, not `import x from './y'`.

Leaving the extension off used to work and no longer does. It fails when the code actually runs, not when you save it, so a missing extension on a rarely used route can slip through review. Package imports (`'express'`, `'sequelize'`) don't need an extension. Only your own files do.

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

Check it's working:

```bash
curl http://localhost:3000/api/health
# {"success":true,"data":{"status":"ok"}}

npm test
```

On Windows, `createdb` only works if PostgreSQL's `bin` folder is on your `PATH`. If it isn't, create the database from pgAdmin or psql instead. If PowerShell blocks scripts, run the tests with `node --test` directly.

### Scripts

| Script                 | Does                              |
| ---------------------- | --------------------------------- |
| `npm run dev`          | Start the server, restart on save |
| `npm start`            | Start the server once             |
| `npm run migrate`      | Create or update database tables  |
| `npm run migrate:undo` | Undo the last database change     |
| `npm run seed`         | Load sample data                  |
| `npm test`             | Run the tests                     |

---

## Layout

```
src/
├── config/        database connection settings
├── constants/     every fixed value: roles, statuses, error codes
├── models/        one file per database table
├── migrations/    scripts that create and change tables (.cjs)
├── seeders/       scripts that load sample data (.cjs)
├── middlewares/   runs before a handler: check login, check role, handle errors
├── services/      the actual logic, including the queue rules
├── controllers/   takes the request, calls a service, sends the response
├── routes/        which URL maps to which controller
├── utils/         small helpers shared across the project
├── app.js         wires Express together
└── server.js      connects to the database and starts listening
```

## Shared files

Four people work on different parts of this project at once. These seven files are used by all of them. Import them; don't copy them into your own folder, or the copies will drift apart and start behaving differently.

| File                       | What it does                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| `constants/index.js`       | Holds every role, status, and error code. If two files spell a status differently, the queue stops working and nothing tells you why |
| `middlewares/auth.js`      | Reads the login token and works out who is making the request          |
| `middlewares/authorize.js` | Checks whether that person's role is allowed to do this                |
| `utils/phone.js`           | Puts phone numbers into one consistent format, which is what duplicate-patient checking compares |
| `utils/password.js`        | Scrambles and checks passwords, for both clinic and staff logins       |
| `utils/response.js`        | Wraps every response in the shape the contract promises                |
| `utils/pagination.js`      | Reads `?page=` and `?limit=` the same way on every list endpoint       |

## Adding a new feature

1. **Model** → create `src/models/<name>.js`, copying `patient.js`. Add it to `models/index.js` in both places: the import at the top and the `db` object below it.
2. **Migration** → run `npx sequelize-cli migration:generate --name create-<name>`, rename the file to `.cjs`, then fill in the table it should create.
3. **Routes** → copy `src/routes/patient.routes.js` and set the roles listed in the contract.
4. **Controller and service** → replace the placeholder handlers with real logic.
5. **Register** the routes in `src/routes/index.js`.

For errors, throw `ApiError` with a code from `constants/index.js`. The error handler turns it into the response shape the contract promises. Don't build error responses by hand inside a handler.

---

## Who owns what

| Area                                   | Owner                    |
| -------------------------------------- | ------------------------ |
| Auth & accounts · Queue                | Shaibu (Lane 1)          |
| Patients · Appointments & check-in     | Victor (Lane 2)          |
| Vitals · Consultations & prescriptions | Emmanuel Alliu (Lane 3)  |
| Billing & payments · Dashboard         | Emmanuel Dosumu (Lane 4) |

The queue rules belong to Lane 1, but every lane calls them. Check with Shaibu before changing `services/queue/transitions.js`.

## How we work

You can't push straight to `main`. Make a branch, open a pull request, and wait for someone to review it.

```bash
git checkout -b lane-1-auth
# commit, then:
git push -u origin lane-1-auth
```

## Progress

### Working now

- **Queue rules**: the full set of allowed steps, including cancelling a visit (which requires a reason). In [transitions.js](src/services/queue/transitions.js), tested in [queue-transitions.test.js](tests/queue-transitions.test.js).
- **Queue endpoints**: `GET /queue` and `POST /queue/:queueId/status` are live. Every status change is saved with who changed it, when, and why. See [queue.service.js](src/services/queue/queue.service.js) and [queue-routes.test.js](tests/queue-routes.test.js).
- **Browser access control**: only websites on an approved list can call the API from a browser.
- **Database tables**: 8 created so far, covering clinics, staff, patients, appointments, and the visit queue.
- **Models**: 5 of the 10 the full system needs, plus one extra that records queue history.
- **Tests**: 21 passing on `main`.

### Waiting for review

- **Login and accounts**: clinic signup, login, inviting staff, accepting an invite, and looking up your own account, the staff list, and the doctor list. Finished and tested, sitting in an open pull request.

### Not started

- **Patient and appointment endpoints**: the tables and models exist, but the endpoints still return "not implemented".
- **Checking a patient in**: nothing creates a queue entry yet, so a real visit can't start. Blocked until the patient endpoints work.
- **Vitals, consultations, prescriptions, invoices, payments**: the remaining 5 models and all their endpoints.
- **Stopping double-booked appointments**: deliberately left out for now, see `DECISIONS.md`.
