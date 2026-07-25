// Route-level coverage for the queue endpoints, via node --test. Unlike the
// other suites these touch the real dev database: they seed a clinic, staff,
// patients and visits, drive the HTTP API, then clean up after themselves.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

let app;
let db;
let server;
let baseUrl;
const seeded = { clinicId: null, staff: {}, patientIds: [] };

const stamp = Date.now();

function tokenFor({ id, clinicId, role }) {
  return jwt.sign({ sub: id, clinicId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

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

// A fresh patient + visit per scenario — the partial unique index allows only
// one active visit per patient, so scenarios must not share one.
async function newVisit(status = 'Checked-In') {
  const patient = await db.Patient.create({
    clinicId: seeded.clinicId,
    firstName: 'Test',
    lastName: 'Patient',
    phone: '08030000000',
  });
  seeded.patientIds.push(patient.id);
  return db.QueueEntry.create({
    clinicId: seeded.clinicId,
    patientId: patient.id,
    assignedDoctorId: seeded.staff.doctor.id,
    status,
  });
}

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  const clinic = await db.Clinic.create({
    name: 'Route Test Clinic',
    address: 'nowhere',
    email: `routes-${stamp}@test.com`,
    password: 'pw',
  });
  seeded.clinicId = clinic.id;

  for (const role of ['nurse', 'doctor', 'receptionist', 'cashier']) {
    seeded.staff[role] = await db.Staff.create({
      clinicId: clinic.id,
      name: `Test ${role}`,
      email: `${role}-${stamp}@test.com`,
      role,
      inviteToken: `${role}-${stamp}`,
    });
  }

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (db) {
    await db.QueueEntry.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Patient.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Staff.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Clinic.destroy({ where: { id: seeded.clinicId } });
    await db.sequelize.close();
  }
  server?.close();
});

test('GET /queue without a token is 401', async () => {
  const { status, body } = await api('/queue');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'UNAUTHENTICATED');
});

test('GET /queue returns the clinic queue', async () => {
  await newVisit();
  const token = tokenFor({ ...seeded.staff.nurse.get(), id: seeded.staff.nurse.id });
  const { status, body } = await api('/queue', { token });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data.queue));
  assert.ok(body.data.queue.length >= 1);
});

test('unknown queueId is 404', async () => {
  const token = tokenFor({ ...seeded.staff.nurse.get(), id: seeded.staff.nurse.id });
  const { status, body } = await api('/queue/00000000-0000-4000-8000-00000000dead/status', {
    method: 'POST',
    token,
    body: { status: 'Triage Ready' },
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('happy path: nurse moves Checked-In -> Triage Ready', async () => {
  const visit = await newVisit();
  const nurse = seeded.staff.nurse;
  const token = tokenFor({ id: nurse.id, clinicId: nurse.clinicId, role: 'nurse' });
  const { status, body } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Triage Ready' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, 'Triage Ready');
  assert.equal(body.data.lastUpdatedBy, nurse.id);

  // The transition was recorded, with its from/to.
  const events = await db.QueueStatusEvent.findAll({ where: { queueEntryId: visit.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].fromStatus, 'Checked-In');
  assert.equal(events[0].toStatus, 'Triage Ready');
});

test('illegal move is 409', async () => {
  const visit = await newVisit();
  const nurse = seeded.staff.nurse;
  const token = tokenFor({ id: nurse.id, clinicId: nurse.clinicId, role: 'nurse' });
  const { status, body } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Completed' },
  });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'QUEUE_ILLEGAL_TRANSITION');
});

test('wrong role is 403', async () => {
  const visit = await newVisit();
  const cashier = seeded.staff.cashier;
  const token = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });
  const { status, body } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Triage Ready' },
  });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('cancelling without a note is 400', async () => {
  const visit = await newVisit();
  const receptionist = seeded.staff.receptionist;
  const token = tokenFor({ id: receptionist.id, clinicId: receptionist.clinicId, role: 'receptionist' });
  const { status, body } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Cancelled' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('cancelling with a note succeeds and persists the note', async () => {
  const visit = await newVisit();
  const receptionist = seeded.staff.receptionist;
  const token = tokenFor({ id: receptionist.id, clinicId: receptionist.clinicId, role: 'receptionist' });
  const { status } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Cancelled', note: 'patient left without being seen' },
  });
  assert.equal(status, 200);

  const event = await db.QueueStatusEvent.findOne({ where: { queueEntryId: visit.id } });
  assert.equal(event.toStatus, 'Cancelled');
  assert.equal(event.note, 'patient left without being seen');
});

test('admin overrides an otherwise illegal move', async () => {
  const visit = await newVisit();
  // Admin is the clinic account, so its token subject is the clinic id.
  const token = tokenFor({ id: seeded.clinicId, clinicId: seeded.clinicId, role: 'admin' });
  const { status, body } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Awaiting Payment' },
  });
  assert.equal(status, 200);
  assert.equal(body.data.status, 'Awaiting Payment');
  // lastUpdatedBy stays null (admin isn't a staff row, and that column is
  // FK-constrained to staff) but the audit event still records who acted.
  assert.equal(body.data.lastUpdatedBy, null);
  const event = await db.QueueStatusEvent.findOne({ where: { queueEntryId: visit.id } });
  assert.equal(event.changedBy, seeded.clinicId);
  assert.equal(event.toStatus, 'Awaiting Payment');
});

test('another clinic cannot see or touch this visit', async () => {
  const visit = await newVisit();
  const token = tokenFor({
    id: seeded.staff.nurse.id,
    clinicId: '00000000-0000-4000-8000-0000000000aa',
    role: 'nurse',
  });
  const { status } = await api(`/queue/${visit.id}/status`, {
    method: 'POST',
    token,
    body: { status: 'Triage Ready' },
  });
  assert.equal(status, 404); // not 403 — don't leak that the id exists
});
