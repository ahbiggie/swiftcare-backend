// Pass 1: JWT util + POST /auth/clinic/signup. The load-bearing assertion here
// is the admin payload — sub and clinicId must BOTH be the clinic's own id,
// because every route scopes its queries by req.user.clinicId.

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
const createdClinicIds = [];

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

const signup = (overrides = {}) =>
  api('/auth/clinic/signup', {
    method: 'POST',
    body: {
      clinicName: 'Signup Test Clinic',
      address: '1 Test Road',
      email: `signup-${stamp}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      password: 'correct-horse',
      ...overrides,
    },
  });

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (db && createdClinicIds.length) {
    await db.Clinic.destroy({ where: { id: createdClinicIds } });
  }
  await db?.sequelize.close();
  server?.close();
});

test('signup creates the clinic and returns a token', async () => {
  const { status, body } = await signup();
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.ok(body.data.token, 'a token is returned, not just the record');
  assert.equal(body.data.user.role, 'admin');
  createdClinicIds.push(body.data.clinic.id);
});

test('the admin token is self-referential: sub === clinicId === clinic.id', async () => {
  const { body } = await signup();
  const clinicId = body.data.clinic.id;
  createdClinicIds.push(clinicId);

  const decoded = jwt.verify(body.data.token, process.env.JWT_SECRET);
  // The whole point: a Clinic has no clinicId column — it IS the clinic — so
  // both claims resolve to its own id. If clinicId were missing here, every
  // clinic-scoped read would come back empty and every write would 404.
  assert.equal(decoded.sub, clinicId);
  assert.equal(decoded.clinicId, clinicId);
  assert.equal(decoded.role, 'admin');
  // Contract payload: { sub, clinicId, role, iat, exp } — and no PII.
  assert.deepEqual(Object.keys(decoded).sort(), ['clinicId', 'exp', 'iat', 'role', 'sub']);
  assert.equal(decoded.email, undefined);
});

test('the issued token is accepted by the auth middleware end to end', async () => {
  const { body } = await signup();
  createdClinicIds.push(body.data.clinic.id);

  // GET /queue is clinic-scoped and admin-readable: proves sign and verify
  // agree, and that the scoping claim actually works on a real route.
  const res = await api('/queue', { token: body.data.token });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.queue));
});

test('the password hash never leaves the API', async () => {
  const { body } = await signup();
  createdClinicIds.push(body.data.clinic.id);
  assert.equal(body.data.clinic.password, undefined);
  assert.ok(!JSON.stringify(body).includes('$2b$'), 'no bcrypt hash anywhere in the response');
});

test('the stored password is hashed and verifiable', async () => {
  const email = `hash-${stamp}@test.com`;
  const { body } = await signup({ email });
  createdClinicIds.push(body.data.clinic.id);

  const row = await db.Clinic.findByPk(body.data.clinic.id);
  assert.notEqual(row.password, 'correct-horse');
  assert.equal(await row.comparePassword('correct-horse'), true);
});

test('missing fields are 400 VALIDATION_ERROR', async () => {
  const { status, body } = await api('/auth/clinic/signup', {
    method: 'POST',
    body: { email: 'nope@test.com' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('a duplicate email is reported, not a 500', async () => {
  const email = `dupe-${stamp}@test.com`;
  const first = await signup({ email });
  createdClinicIds.push(first.body.data.clinic.id);

  const second = await signup({ email });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_EMAIL');
});
