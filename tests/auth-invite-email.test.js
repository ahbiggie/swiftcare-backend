// Proves the one rule that matters most for D20: a failed invite email must
// never fail the invite itself. EMAIL_HOST/PORT point at a closed local port
// (127.0.0.1:1, nothing listens there), so every send fails fast with
// ECONNREFUSED — a real send failure, not a stubbed-out call — and
// POST /auth/invite must still come back 201 with a working inviteLink, same
// as the manual-copy fallback that worked before email delivery existed.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
process.env.EMAIL_HOST = '127.0.0.1';
process.env.EMAIL_PORT = '1';
process.env.SENDGRID_API_KEY = 'not-a-real-key';
process.env.EMAIL_FROM = 'no-reply@test.example';

let app;
let db;
let server;
let baseUrl;

const stamp = Date.now();
const seeded = { clinic: null };

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

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  seeded.clinic = await db.Clinic.create({
    name: 'Email Failure Test Clinic',
    address: '1 Test Road',
    email: `invite-email-clinic-${stamp}@test.com`,
    password: 'admin-correct-horse',
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

test('a failed invite email does not fail the invite: still 201 with a real inviteLink', async () => {
  const token = jwt.sign(
    { sub: seeded.clinic.id, clinicId: seeded.clinic.id, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  const { status, body } = await api('/auth/invite', {
    method: 'POST',
    token,
    body: {
      name: 'Invited Despite Email Failure',
      email: `invite-email-fail-${stamp}@test.com`,
      role: 'nurse',
    },
  });

  assert.equal(status, 201);
  assert.equal(body.data.status, 'invited');
  assert.ok(
    body.data.inviteLink.startsWith('http://localhost:5173/accept-invite?token='),
    'the manual-copy fallback link is still there and usable',
  );

  // Not just a correct-looking response: the row and its token really exist.
  const row = await db.Staff.findByPk(body.data.id);
  assert.equal(row.status, 'invited');
  assert.ok(row.inviteToken, 'a real invite token was generated');
});
