// GET /auth/me, GET /users, GET /staff/doctors — the three endpoints that close
// out Lane 1's contract section. Each assertion below tests the actual design
// decision (shape parity, filter correctness, pagination truly paging), not
// just that the endpoint returns 200.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

let app;
let db;
let server;
let baseUrl;

const stamp = Date.now();
const seeded = { clinic: null };

async function api(path, { method = 'GET', token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api${path}`, { method, headers });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function adminToken(clinicId) {
  return jwt.sign({ sub: clinicId, clinicId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
function staffToken(staff) {
  return jwt.sign(
    { sub: staff.id, clinicId: staff.clinicId, role: staff.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  seeded.clinic = await db.Clinic.create({
    name: 'MeUsersDoctors Clinic',
    address: '1 Test Road',
    email: `me-users-doctors-${stamp}@test.com`,
    password: 'pw',
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (db) {
    await db.Staff.destroy({ where: { clinicId: seeded.clinic.id } });
    await db.Clinic.destroy({ where: { id: seeded.clinic.id } });
    await db.sequelize.close();
  }
  server?.close();
});

// ---------- GET /auth/me ----------

test('GET /auth/me without a token is 401', async () => {
  const { status } = await api('/auth/me');
  assert.equal(status, 401);
});

test('GET /auth/me as admin returns the flat contract shape, not wrapped in `user`', async () => {
  const { status, body } = await api('/auth/me', { token: adminToken(seeded.clinic.id) });
  assert.equal(status, 200);
  // Flat in `data` — { id, name, role, clinicId } directly, not { user: {...} }.
  assert.equal(body.data.user, undefined, 'must not be wrapped in a user key, unlike login');
  assert.equal(body.data.id, seeded.clinic.id);
  assert.equal(body.data.role, 'admin');
  assert.equal(body.data.clinicId, seeded.clinic.id);
});

test('GET /auth/me shape is byte-identical for an admin token and a staff token', async () => {
  const nurse = await db.Staff.create({
    clinicId: seeded.clinic.id, name: 'Shape Nurse', email: `shape-nurse-${stamp}@test.com`,
    role: 'nurse', inviteToken: `sn-${stamp}`,
  });

  const asAdmin = await api('/auth/me', { token: adminToken(seeded.clinic.id) });
  const asStaff = await api('/auth/me', { token: staffToken(nurse) });

  assert.equal(asAdmin.status, 200);
  assert.equal(asStaff.status, 200);
  // Same key set either way — the contract shape must not depend on which
  // table answered. Same discipline as the login shape-parity check.
  assert.deepEqual(Object.keys(asAdmin.body.data).sort(), Object.keys(asStaff.body.data).sort());
  assert.deepEqual(Object.keys(asStaff.body.data).sort(), ['clinicId', 'id', 'name', 'role']);

  assert.equal(asStaff.body.data.id, nurse.id);
  assert.equal(asStaff.body.data.role, 'nurse');
});

// ---------- GET /users ----------

test('GET /users without admin is 403', async () => {
  const nurse = await db.Staff.create({
    clinicId: seeded.clinic.id, name: 'Cant List', email: `cant-list-${stamp}@test.com`,
    role: 'nurse', inviteToken: `cl-${stamp}`,
  });
  const { status, body } = await api('/users', { token: staffToken(nurse) });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('GET /users filters by role/status and reports the correct total', async () => {
  const clinic = await db.Clinic.create({
    name: 'Users Filter Clinic', address: 'x', email: `users-filter-${stamp}@test.com`, password: 'pw',
  });

  const activeNurse = await db.Staff.create({
    clinicId: clinic.id, name: 'Active Nurse', email: `af-nurse-${stamp}@test.com`,
    role: 'nurse', inviteToken: `afn-${stamp}`,
  });
  activeNurse.status = 'active';
  await activeNurse.save();

  await db.Staff.create({
    clinicId: clinic.id, name: 'Invited Doctor', email: `af-doc-${stamp}@test.com`,
    role: 'doctor', inviteToken: `afd-${stamp}`,
  }); // stays 'invited'

  const { status, body } = await api(
    `/users?role=nurse&status=active`,
    { token: adminToken(clinic.id) },
  );
  assert.equal(status, 200);
  assert.equal(body.data.total, 1);
  assert.equal(body.data.users.length, 1);
  assert.equal(body.data.users[0].id, activeNurse.id);
  assert.equal(body.data.users[0].email, activeNurse.email, 'GET /users exposes email, unlike the auth-token shape');

  // Unfiltered: total counts both.
  const all = await api('/users', { token: adminToken(clinic.id) });
  assert.equal(all.body.data.total, 2);

  await db.Staff.destroy({ where: { clinicId: clinic.id } });
  await db.Clinic.destroy({ where: { id: clinic.id } });
});

test('GET /users pagination actually pages — page 2 differs from page 1', async () => {
  const clinic = await db.Clinic.create({
    name: 'Pagination Clinic', address: 'x', email: `pagination-${stamp}@test.com`, password: 'pw',
  });

  const created = [];
  for (let i = 0; i < 5; i++) {
    const s = await db.Staff.create({
      clinicId: clinic.id, name: `Staff ${i}`, email: `page-${i}-${stamp}@test.com`,
      role: 'cashier', inviteToken: `page-${i}-${stamp}`,
    });
    created.push(s.id);
  }

  const admin = adminToken(clinic.id);
  const page1 = await api('/users?limit=2&page=1', { token: admin });
  const page2 = await api('/users?limit=2&page=2', { token: admin });

  assert.equal(page1.body.data.total, 5);
  assert.equal(page1.body.data.users.length, 2);
  assert.equal(page2.body.data.users.length, 2);

  const page1Ids = page1.body.data.users.map((u) => u.id).sort();
  const page2Ids = page2.body.data.users.map((u) => u.id).sort();
  assert.notDeepEqual(page1Ids, page2Ids, 'page 2 must return different rows than page 1');
  assert.equal(
    page1Ids.some((id) => page2Ids.includes(id)),
    false,
    'no overlap between pages',
  );

  await db.Staff.destroy({ where: { clinicId: clinic.id } });
  await db.Clinic.destroy({ where: { id: clinic.id } });
});

// ---------- GET /staff/doctors ----------

test('GET /staff/doctors as cashier is 403', async () => {
  const cashier = await db.Staff.create({
    clinicId: seeded.clinic.id, name: 'Cant See Doctors', email: `cant-doctors-${stamp}@test.com`,
    role: 'cashier', inviteToken: `cd-${stamp}`,
  });
  const { status, body } = await api('/staff/doctors', { token: staffToken(cashier) });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('GET /staff/doctors returns only ACTIVE doctors, not invited ones', async () => {
  const clinic = await db.Clinic.create({
    name: 'Doctors Filter Clinic', address: 'x', email: `doctors-filter-${stamp}@test.com`, password: 'pw',
  });

  const activeDoctor = await db.Staff.create({
    clinicId: clinic.id, name: 'Active Doctor', email: `active-doc-${stamp}@test.com`,
    role: 'doctor', inviteToken: `ad-${stamp}`,
  });
  activeDoctor.status = 'active';
  await activeDoctor.save();

  const invitedDoctor = await db.Staff.create({
    clinicId: clinic.id, name: 'Invited Doctor', email: `invited-doc-${stamp}@test.com`,
    role: 'doctor', inviteToken: `id-${stamp}`,
  }); // stays 'invited' — cannot log in yet

  // Receptionist, nurse, and admin are all allowed to read this list.
  const receptionist = await db.Staff.create({
    clinicId: clinic.id, name: 'Recep', email: `recep-${stamp}@test.com`,
    role: 'receptionist', inviteToken: `rec-${stamp}`,
  });
  receptionist.status = 'active';
  await receptionist.save();

  const { status, body } = await api('/staff/doctors', { token: staffToken(receptionist) });
  assert.equal(status, 200);
  assert.equal(body.data.doctors.length, 1, 'the invited doctor must not appear');
  assert.equal(body.data.doctors[0].id, activeDoctor.id);
  assert.deepEqual(Object.keys(body.data.doctors[0]).sort(), ['id', 'name']);

  // Confirm the invited one really was excluded, not coincidentally absent.
  assert.ok(!body.data.doctors.some((d) => d.id === invitedDoctor.id));

  await db.Staff.destroy({ where: { clinicId: clinic.id } });
  await db.Clinic.destroy({ where: { id: clinic.id } });
});

test('GET /staff/doctors as admin also works (admin is in the allowed list)', async () => {
  const clinic = await db.Clinic.create({
    name: 'Admin Doctors Clinic', address: 'x', email: `admin-doctors-${stamp}@test.com`, password: 'pw',
  });
  const doctor = await db.Staff.create({
    clinicId: clinic.id, name: 'Doc', email: `admin-doc-${stamp}@test.com`,
    role: 'doctor', inviteToken: `adoc-${stamp}`,
  });
  doctor.status = 'active';
  await doctor.save();

  const { status, body } = await api('/staff/doctors', { token: adminToken(clinic.id) });
  assert.equal(status, 200);
  assert.equal(body.data.doctors.length, 1);

  await db.Staff.destroy({ where: { clinicId: clinic.id } });
  await db.Clinic.destroy({ where: { id: clinic.id } });
});
