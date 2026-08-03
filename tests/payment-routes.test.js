// Route-level coverage for GET /invoices/:patientId, POST /payments, and
// GET /payments/history. Payment is the last step in the visit lifecycle:
// the invoice row must be locked before checking whether it's already paid,
// the request body carries no amount, and success moves the queue entry to
// Completed the same way completeConsultation moves it to Awaiting Payment.
// Like tests/consultation-complete-routes.test.js, this touches the real dev
// database: seeds a clinic, staff, a patient and a visit all the way through
// to Awaiting Payment, drives the HTTP API, then cleans up after itself.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

let app;
let db;
let server;
let baseUrl;
const seeded = { clinicId: null, staff: {}, otherClinicId: null, otherStaff: {} };

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

// Carries a fresh patient + visit all the way to Awaiting Payment with a
// real Pending invoice, driving the actual HTTP endpoints so the setup is
// exactly what a real cashier would see - not a shortcut that bypasses the
// endpoints this feature depends on. Scoped to whichever clinic the doctor
// belongs to, so the same helper can seed either clinic in the isolation test.
async function newAwaitingPaymentVisit(doctor) {
  const patient = await db.Patient.create({
    clinicId: doctor.clinicId,
    firstName: 'Test',
    lastName: 'Patient',
    phone: '08030000000',
  });
  const queueEntry = await db.QueueEntry.create({
    clinicId: doctor.clinicId,
    patientId: patient.id,
    assignedDoctorId: doctor.id,
    status: 'In Consultation',
  });

  const doctorToken = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const opened = await api('/consultations', {
    method: 'POST',
    token: doctorToken,
    body: { queueEntryId: queueEntry.id, patientId: patient.id },
  });
  assert.equal(opened.status, 201, 'precondition: consultation must open');

  const completed = await api(`/consultations/${opened.body.data.id}/complete`, {
    method: 'POST',
    token: doctorToken,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(completed.status, 200, 'precondition: consultation must complete');

  return { patient, queueEntry, invoiceId: completed.body.data.invoice.id };
}

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  const clinic = await db.Clinic.create({
    name: 'Payment Test Clinic',
    address: 'nowhere',
    email: `payment-${stamp}@test.com`,
    password: 'pw',
  });
  seeded.clinicId = clinic.id;

  for (const role of ['doctor', 'cashier', 'cashier2', 'nurse']) {
    const actualRole = role === 'cashier2' ? 'cashier' : role;
    seeded.staff[role] = await db.Staff.create({
      clinicId: clinic.id,
      name: `Test ${role}`,
      email: `${role}-${stamp}@test.com`,
      role: actualRole,
      inviteToken: `${role}-${stamp}`,
    });
  }

  // A second, wholly separate clinic - real rows, not a fabricated clinicId -
  // so the payments/history isolation test has an actual cross-tenant Payment
  // row to prove doesn't leak, rather than one only inferred from a code trace.
  const otherClinic = await db.Clinic.create({
    name: 'Payment Test Clinic B',
    address: 'nowhere',
    email: `payment-b-${stamp}@test.com`,
    password: 'pw',
  });
  seeded.otherClinicId = otherClinic.id;
  for (const role of ['doctor', 'cashier']) {
    seeded.otherStaff[role] = await db.Staff.create({
      clinicId: otherClinic.id,
      name: `Other Test ${role}`,
      email: `other-${role}-${stamp}@test.com`,
      role,
      inviteToken: `other-${role}-${stamp}`,
    });
  }

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

async function cleanupClinic(clinicId) {
  await db.Payment.destroy({ where: { clinicId } });
  const consultations = await db.Consultation.findAll({ where: { clinicId } });
  const consultationIds = consultations.map((c) => c.id);
  await db.Invoice.destroy({ where: { clinicId } });
  if (consultationIds.length) {
    await db.Prescription.destroy({ where: { consultationId: consultationIds } });
  }
  await db.Consultation.destroy({ where: { clinicId } });
  await db.QueueEntry.destroy({ where: { clinicId } });
  await db.Patient.destroy({ where: { clinicId } });
  await db.Staff.destroy({ where: { clinicId } });
  await db.Clinic.destroy({ where: { id: clinicId } });
}

after(async () => {
  if (db) {
    await cleanupClinic(seeded.clinicId);
    if (seeded.otherClinicId) await cleanupClinic(seeded.otherClinicId);
    await db.sequelize.close();
  }
  server?.close();
});

test('happy path: cashier pays an invoice and the visit completes', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);

  const cashierToken = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token: cashierToken,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });

  assert.equal(status, 200);
  assert.ok(body.data.payment.id);
  assert.equal(body.data.receipt.invoiceId, visit.invoiceId);
  assert.equal(body.data.receipt.amount, 5000);
  assert.equal(body.data.receipt.method, 'cash');
  assert.equal(body.data.queueStatus, 'Completed');

  const invoice = await db.Invoice.findByPk(visit.invoiceId);
  assert.equal(invoice.status, 'Paid');

  const payment = await db.Payment.findOne({ where: { invoiceId: visit.invoiceId } });
  assert.ok(payment);
  assert.equal(Number(payment.amount), 5000);
  assert.equal(payment.receivedBy, cashier.id);

  await visit.queueEntry.reload();
  assert.equal(visit.queueEntry.status, 'Completed');
});

test('double payment on the same invoice is blocked', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);
  const cashierToken = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });

  const first = await api('/payments', {
    method: 'POST',
    token: cashierToken,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });
  assert.equal(first.status, 200);

  const second = await api('/payments', {
    method: 'POST',
    token: cashierToken,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'INVOICE_ALREADY_PAID');

  // Nothing from the rejected second attempt landed - exactly one payment row.
  const payments = await db.Payment.findAll({ where: { invoiceId: visit.invoiceId } });
  assert.equal(payments.length, 1);
});

test('paying an invoice whose visit is not at Awaiting Payment is blocked', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);

  // Simulate the visit having moved out from under the cashier between
  // consultation-complete and payment.
  visit.queueEntry.status = 'Cancelled';
  await visit.queueEntry.save();

  const cashierToken = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token: cashierToken,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });

  assert.equal(status, 409);
  assert.equal(body.error.code, 'PAYMENT_NOT_DUE');

  const invoice = await db.Invoice.findByPk(visit.invoiceId);
  assert.equal(invoice.status, 'Pending');
});

test('unknown invoice id is 404', async () => {
  const cashier = seeded.staff.cashier;
  const token = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token,
    body: { invoiceId: '00000000-0000-4000-8000-00000000dead', method: 'cash' },
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('another clinic cannot pay this invoice', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);

  const token = tokenFor({
    id: cashier.id,
    clinicId: '00000000-0000-4000-8000-0000000000aa',
    role: 'cashier',
  });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('nurse cannot take a payment', async () => {
  const doctor = seeded.staff.doctor;
  const nurse = seeded.staff.nurse;
  const visit = await newAwaitingPaymentVisit(doctor);

  const token = tokenFor({ id: nurse.id, clinicId: nurse.clinicId, role: 'nurse' });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token,
    body: { invoiceId: visit.invoiceId, method: 'cash' },
  });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('an invalid method is rejected and nothing is saved', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);

  const token = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });
  const { status, body } = await api('/payments', {
    method: 'POST',
    token,
    body: { invoiceId: visit.invoiceId, method: 'bitcoin' },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');

  const invoice = await db.Invoice.findByPk(visit.invoiceId);
  assert.equal(invoice.status, 'Pending');
});

test('GET /invoices/:patientId returns the patient invoice, narrowed by queueEntryId', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);
  const token = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });

  const all = await api(`/invoices/${visit.patient.id}`, { token });
  assert.equal(all.status, 200);
  assert.equal(all.body.data.invoices.length, 1);
  assert.equal(all.body.data.invoices[0].id, visit.invoiceId);

  const narrowed = await api(`/invoices/${visit.patient.id}?queueEntryId=${visit.queueEntry.id}`, { token });
  assert.equal(narrowed.status, 200);
  assert.equal(narrowed.body.data.invoices.length, 1);
  assert.equal(narrowed.body.data.invoices[0].id, visit.invoiceId);

  const wrongVisit = await api(`/invoices/${visit.patient.id}?queueEntryId=00000000-0000-4000-8000-00000000dead`, { token });
  assert.equal(wrongVisit.status, 200);
  assert.equal(wrongVisit.body.data.invoices.length, 0);
});

test('GET /payments/history lists payments for the clinic, filterable by method', async () => {
  const doctor = seeded.staff.doctor;
  const cashier = seeded.staff.cashier;
  const visit = await newAwaitingPaymentVisit(doctor);
  const cashierToken = tokenFor({ id: cashier.id, clinicId: cashier.clinicId, role: 'cashier' });

  const paid = await api('/payments', {
    method: 'POST',
    token: cashierToken,
    body: { invoiceId: visit.invoiceId, method: 'mobile_money' },
  });
  assert.equal(paid.status, 200);

  const history = await api('/payments/history', { token: cashierToken });
  assert.equal(history.status, 200);
  assert.ok(history.body.data.payments.some((p) => p.invoiceId === visit.invoiceId));

  const filtered = await api('/payments/history?method=mobile_money', { token: cashierToken });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.data.payments.every((p) => p.method === 'mobile_money'));

  const filteredOut = await api('/payments/history?method=insurance', { token: cashierToken });
  assert.equal(filteredOut.status, 200);
  assert.ok(!filteredOut.body.data.payments.some((p) => p.invoiceId === visit.invoiceId));
});

test("GET /payments/history never returns another clinic's payments", async () => {
  // Two real, wholly separate clinics, each with its own paid invoice - not
  // one clinic and a fabricated foreign clinicId. The question here isn't
  // "can a caller reach a specific foreign id" (that's the 404 tests above),
  // it's "does the query only ever return the caller's own slice" - proving
  // that needs data that actually exists on both sides of the boundary.
  const visitA = await newAwaitingPaymentVisit(seeded.staff.doctor);
  const cashierA = tokenFor({ id: seeded.staff.cashier.id, clinicId: seeded.staff.cashier.clinicId, role: 'cashier' });
  const paidA = await api('/payments', {
    method: 'POST',
    token: cashierA,
    body: { invoiceId: visitA.invoiceId, method: 'cash' },
  });
  assert.equal(paidA.status, 200);

  const visitB = await newAwaitingPaymentVisit(seeded.otherStaff.doctor);
  const cashierB = tokenFor({ id: seeded.otherStaff.cashier.id, clinicId: seeded.otherStaff.cashier.clinicId, role: 'cashier' });
  const paidB = await api('/payments', {
    method: 'POST',
    token: cashierB,
    body: { invoiceId: visitB.invoiceId, method: 'cash' },
  });
  assert.equal(paidB.status, 200);

  const historyA = await api('/payments/history', { token: cashierA });
  assert.equal(historyA.status, 200);
  assert.ok(historyA.body.data.payments.some((p) => p.invoiceId === visitA.invoiceId));
  assert.ok(!historyA.body.data.payments.some((p) => p.invoiceId === visitB.invoiceId));

  const historyB = await api('/payments/history', { token: cashierB });
  assert.equal(historyB.status, 200);
  assert.ok(historyB.body.data.payments.some((p) => p.invoiceId === visitB.invoiceId));
  assert.ok(!historyB.body.data.payments.some((p) => p.invoiceId === visitA.invoiceId));
});
