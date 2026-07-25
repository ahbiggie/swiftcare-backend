// Pass 2: POST /auth/login. Credentials live in two tables, so the load-bearing
// assertions here are (a) both account types resolve correctly, (b) the two
// failure modes are indistinguishable, and (c) the cross-table email guard
// actually holds — no DB constraint covers that one.

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
const PASSWORD = 'correct-horse-battery';
const seeded = { clinic: null, activeStaff: null, invitedStaff: null };

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const login = (email, password) =>
  api('/auth/login', { method: 'POST', body: { email, password } });

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  seeded.clinic = await db.Clinic.create({
    name: 'Login Test Clinic',
    address: '1 Test Road',
    email: `login-clinic-${stamp}@test.com`,
    password: PASSWORD,
  });

  // An accepted staff member: password set, status flipped to active.
  seeded.activeStaff = await db.Staff.create({
    clinicId: seeded.clinic.id,
    name: 'Active Nurse',
    email: `login-nurse-${stamp}@test.com`,
    role: 'nurse',
    inviteToken: `active-${stamp}`,
  });
  seeded.activeStaff.password = PASSWORD;
  seeded.activeStaff.status = 'active';
  await seeded.activeStaff.save();

  // Still invited: password is null, exactly as POST /auth/invite leaves it.
  seeded.invitedStaff = await db.Staff.create({
    clinicId: seeded.clinic.id,
    name: 'Invited Doctor',
    email: `login-invited-${stamp}@test.com`,
    role: 'doctor',
    inviteToken: `invited-${stamp}`,
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

test('clinic login returns a self-referential admin token', async () => {
  const { status, body } = await login(seeded.clinic.email, PASSWORD);
  assert.equal(status, 200);
  assert.ok(body.data.token);

  const decoded = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(decoded.sub, seeded.clinic.id);
  assert.equal(decoded.clinicId, seeded.clinic.id);
  assert.equal(decoded.role, 'admin');
  assert.equal(body.data.user.role, 'admin');
});

test('staff login carries the staff row own clinicId and role', async () => {
  const { status, body } = await login(seeded.activeStaff.email, PASSWORD);
  assert.equal(status, 200);

  const decoded = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(decoded.sub, seeded.activeStaff.id);
  assert.equal(decoded.clinicId, seeded.clinic.id);
  assert.notEqual(decoded.sub, decoded.clinicId); // unlike the admin case
  assert.equal(decoded.role, 'nurse');
});

test('the issued staff token authenticates on a real route', async () => {
  const { body } = await login(seeded.activeStaff.email, PASSWORD);
  const res = await api('/queue', { token: body.data.token });
  assert.equal(res.status, 200);
});

test('the user shape is identical whichever table answered', async () => {
  const asClinic = await login(seeded.clinic.email, PASSWORD);
  const asStaff = await login(seeded.activeStaff.email, PASSWORD);

  // The contract defines `user` once; a caller must not be able to tell which
  // table it came from by the keys present.
  assert.deepEqual(
    Object.keys(asClinic.body.data.user).sort(),
    Object.keys(asStaff.body.data.user).sort(),
  );
  assert.deepEqual(Object.keys(asStaff.body.data.user).sort(), [
    'clinicId',
    'id',
    'name',
    'role',
  ]);
});

test('wrong password and unknown email are byte-identical 401s', async () => {
  const wrongPassword = await login(seeded.clinic.email, 'not-the-password');
  const unknownEmail = await login(`nobody-${stamp}@test.com`, PASSWORD);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  // Proven equal, not assumed: any drift here becomes an enumeration oracle.
  assert.deepEqual(wrongPassword.body, unknownEmail.body);
  assert.equal(wrongPassword.body.error.code, 'UNAUTHENTICATED');
});

test('wrong password for a staff account is also the same 401', async () => {
  const staffWrong = await login(seeded.activeStaff.email, 'not-the-password');
  const unknownEmail = await login(`nobody2-${stamp}@test.com`, PASSWORD);
  assert.equal(staffWrong.status, 401);
  assert.deepEqual(staffWrong.body, unknownEmail.body);
});

test('an unaccepted invite is 403 INVITE_NOT_ACCEPTED, not 401', async () => {
  const { status, body } = await login(seeded.invitedStaff.email, PASSWORD);
  assert.equal(status, 403);
  assert.equal(body.error.code, 'INVITE_NOT_ACCEPTED');
});

test('missing credentials are 400', async () => {
  const { status, body } = await api('/auth/login', { method: 'POST', body: { email: 'a@b.com' } });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('no password hash appears in a login response', async () => {
  const { body } = await login(seeded.clinic.email, PASSWORD);
  assert.ok(!JSON.stringify(body).includes('$2b$'));
  assert.equal(body.data.user.password, undefined);
});

test('signup is blocked by an email held by a STAFF row (cross-table)', async () => {
  // No database constraint covers this: clinics.email and staff.email are
  // separate unique indexes. Only the application-level guard catches it.
  const { status, body } = await api('/auth/clinic/signup', {
    method: 'POST',
    body: {
      clinicName: 'Colliding Clinic',
      address: 'somewhere',
      email: seeded.activeStaff.email,
      password: PASSWORD,
    },
  });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'DUPLICATE_EMAIL');
});
