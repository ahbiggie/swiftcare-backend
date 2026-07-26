// Pass 3: POST /auth/invite and POST /auth/accept-invite. The load-bearing
// assertions here: accept-invite needs NO Authorization header (that's the
// whole point of an invite flow), a used/bogus token is one indistinguishable
// 404, and a raced double-accept can't both succeed.

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
const ADMIN_PASSWORD = 'admin-correct-horse';
const seeded = { clinic: null, otherClinic: null };

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

function adminTokenFor(clinicId) {
  return jwt.sign({ sub: clinicId, clinicId, role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

const invite = (token, overrides = {}) =>
  api('/auth/invite', {
    method: 'POST',
    token,
    body: {
      name: 'Invited Person',
      email: `invite-${stamp}-${Math.random().toString(36).slice(2, 8)}@test.com`,
      role: 'nurse',
      ...overrides,
    },
  });

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  seeded.clinic = await db.Clinic.create({
    name: 'Invite Test Clinic',
    address: '1 Test Road',
    email: `invite-clinic-${stamp}@test.com`,
    password: ADMIN_PASSWORD,
  });
  seeded.otherClinic = await db.Clinic.create({
    name: 'Other Clinic',
    address: '2 Other Road',
    email: `invite-other-clinic-${stamp}@test.com`,
    password: ADMIN_PASSWORD,
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (db) {
    await db.Staff.destroy({ where: { clinicId: [seeded.clinic.id, seeded.otherClinic.id] } });
    await db.Clinic.destroy({ where: { id: [seeded.clinic.id, seeded.otherClinic.id] } });
    await db.sequelize.close();
  }
  server?.close();
});

test('inviting without a token is 401', async () => {
  const { status } = await invite(undefined);
  assert.equal(status, 401);
});

test('a non-admin cannot invite', async () => {
  // A nurse token, structurally valid, just the wrong role.
  const nurseToken = jwt.sign(
    { sub: seeded.clinic.id, clinicId: seeded.clinic.id, role: 'nurse' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const { status, body } = await invite(nurseToken);
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('admin invites a staff member and gets an invite link back', async () => {
  const token = adminTokenFor(seeded.clinic.id);
  const { status, body } = await invite(token);
  assert.equal(status, 201);
  assert.equal(body.data.status, 'invited');
  assert.equal(body.data.clinicId, seeded.clinic.id);
  assert.ok(body.data.inviteLink.startsWith('http://localhost:5173/accept-invite?token='));
  assert.equal(body.data.password, undefined);

  const row = await db.Staff.findByPk(body.data.id);
  assert.equal(row.status, 'invited');
  assert.equal(row.password, null);
  assert.ok(row.inviteToken, 'a real token was generated, not left blank');
});

test('an invalid role is 400, not a Sequelize validation dump', async () => {
  const token = adminTokenFor(seeded.clinic.id);
  const { status, body } = await invite(token, { role: 'admin' });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('missing fields are 400', async () => {
  const token = adminTokenFor(seeded.clinic.id);
  const { status, body } = await api('/auth/invite', {
    method: 'POST',
    token,
    body: { name: 'No Email Or Role' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('re-inviting the same email to the same clinic is a clinic-scoped duplicate', async () => {
  const token = adminTokenFor(seeded.clinic.id);
  const email = `same-clinic-${stamp}@test.com`;
  const first = await invite(token, { email });
  assert.equal(first.status, 201);

  const second = await invite(token, { email });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_EMAIL');
  assert.match(second.body.error.message, /this clinic/i);
});

test('inviting an email already staffed at a DIFFERENT clinic says so distinctly', async () => {
  const otherAdminToken = adminTokenFor(seeded.otherClinic.id);
  const email = `cross-clinic-${stamp}@test.com`;
  const first = await invite(otherAdminToken, { email });
  assert.equal(first.status, 201);

  const token = adminTokenFor(seeded.clinic.id);
  const second = await invite(token, { email });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DUPLICATE_EMAIL');
  assert.match(second.body.error.message, /different clinic/i);
});

test('inviting an email that belongs to a CLINIC account says so distinctly', async () => {
  const token = adminTokenFor(seeded.clinic.id);
  const { status, body } = await invite(token, { email: seeded.otherClinic.email });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'DUPLICATE_EMAIL');
  assert.match(body.error.message, /clinic account/i);
});

// ---- accept-invite ----

test('accept-invite needs no Authorization header at all', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  const res = await fetch(`${baseUrl}/api/auth/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // no Authorization at all
    body: JSON.stringify({ inviteToken: tokenParam, password: 'new-password-1' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.data.token);
  assert.equal(body.data.user.role, 'nurse');
});

test('accepting activates the account and signs it in with the staff own identity', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  const { status, body } = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'new-password-2' },
  });
  assert.equal(status, 200);

  const decoded = jwt.verify(body.data.token, process.env.JWT_SECRET);
  assert.equal(decoded.sub, inviteBody.data.id);
  assert.equal(decoded.clinicId, seeded.clinic.id);
  assert.equal(decoded.role, 'nurse');

  const row = await db.Staff.findByPk(inviteBody.data.id);
  assert.equal(row.status, 'active');
  assert.equal(row.inviteToken, null, 'the token is cleared, not just marked used');
  assert.equal(await row.comparePassword('new-password-2'), true);
});

test('the issued token authenticates on a real route', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');
  const { body } = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'new-password-3' },
  });

  const res = await api('/queue', { token: body.data.token });
  assert.equal(res.status, 200);
});

test('a bogus token and an already-used token are the same 404', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  // Use it once.
  const firstAccept = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'new-password-4' },
  });
  assert.equal(firstAccept.status, 200);

  // Same token again — the row is now active, but the token is gone, so this
  // is indistinguishable from a token that never existed.
  const reused = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'anything' },
  });
  const neverExisted = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: 'this-token-was-never-issued', password: 'anything' },
  });

  assert.equal(reused.status, 404);
  assert.equal(neverExisted.status, 404);
  assert.deepEqual(reused.body, neverExisted.body);
  assert.equal(reused.body.error.code, 'NOT_FOUND');
});

test('reusing a token cannot silently reset an already-active password', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'original-password' },
  });

  // An attacker who found the old email link tries to "accept" again with a
  // password of their choosing. Must fail, and must not touch the real one.
  const replay = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'attacker-chosen-password' },
  });
  assert.equal(replay.status, 404);

  const row = await db.Staff.findByPk(inviteBody.data.id);
  assert.equal(await row.comparePassword('original-password'), true);
  assert.equal(await row.comparePassword('attacker-chosen-password'), false);
});

test('a raced double-accept of the same token: exactly one winner', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  const [a, b] = await Promise.all([
    api('/auth/accept-invite', {
      method: 'POST',
      body: { inviteToken: tokenParam, password: 'race-password-a' },
    }),
    api('/auth/accept-invite', {
      method: 'POST',
      body: { inviteToken: tokenParam, password: 'race-password-b' },
    }),
  ]);

  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 404], 'exactly one request wins, the other finds nothing');

  const row = await db.Staff.findByPk(inviteBody.data.id);
  assert.equal(row.status, 'active');
  // Whichever password won is the one that's actually set — no corruption,
  // no both-partially-applied state.
  const winnerPassword = a.status === 200 ? 'race-password-a' : 'race-password-b';
  assert.equal(await row.comparePassword(winnerPassword), true);
});

test('accept-invite validates required fields', async () => {
  const { status, body } = await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: 'x' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('an accepted staff member can then log in normally', async () => {
  const adminToken = adminTokenFor(seeded.clinic.id);
  const { body: inviteBody } = await invite(adminToken);
  const tokenParam = new URL(inviteBody.data.inviteLink).searchParams.get('token');

  await api('/auth/accept-invite', {
    method: 'POST',
    body: { inviteToken: tokenParam, password: 'login-after-accept' },
  });

  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: { email: inviteBody.data.email, password: 'login-after-accept' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.user.id, inviteBody.data.id);
});
