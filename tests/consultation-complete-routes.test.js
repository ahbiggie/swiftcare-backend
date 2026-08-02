// Route-level coverage for POST /consultations/:id/complete, the most
// important write path in the system: notes/diagnosis, every prescription,
// the invoice, and the queue move to Awaiting Payment must land together or
// not at all. Like tests/queue-routes.test.js, this touches the real dev
// database: seeds a clinic, staff, patients and visits, drives the HTTP API,
// then cleans up after itself.

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

// A fresh patient + visit already at "In Consultation", the precondition
// openConsultation enforces - same shortcut newVisit() takes in
// tests/queue-routes.test.js, just further along the queue.
async function newInConsultationVisit(doctor) {
  const patient = await db.Patient.create({
    clinicId: seeded.clinicId,
    firstName: 'Test',
    lastName: 'Patient',
    phone: '08030000000',
  });
  seeded.patientIds.push(patient.id);
  const queueEntry = await db.QueueEntry.create({
    clinicId: seeded.clinicId,
    patientId: patient.id,
    assignedDoctorId: doctor.id,
    status: 'In Consultation',
  });
  return { patient, queueEntry };
}

async function openConsultation(doctor, { patient, queueEntry }) {
  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const { status, body } = await api('/consultations', {
    method: 'POST',
    token,
    body: { queueEntryId: queueEntry.id, patientId: patient.id },
  });
  assert.equal(status, 201, 'precondition: consultation must open');
  return body.data;
}

const validPrescriptions = [
  { drugName: 'Paracetamol', dosage: '500mg', frequency: 'twice daily', duration: '5 days' },
];

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  ({ default: db } = await import('../src/models/index.js'));

  const clinic = await db.Clinic.create({
    name: 'Consult Complete Test Clinic',
    address: 'nowhere',
    email: `consult-complete-${stamp}@test.com`,
    password: 'pw',
  });
  seeded.clinicId = clinic.id;

  for (const role of ['doctor', 'doctor2', 'nurse']) {
    const actualRole = role === 'doctor2' ? 'doctor' : role;
    seeded.staff[role] = await db.Staff.create({
      clinicId: clinic.id,
      name: `Test ${role}`,
      email: `${role}-${stamp}@test.com`,
      role: actualRole,
      inviteToken: `${role}-${stamp}`,
    });
  }

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (db) {
    const consultations = await db.Consultation.findAll({ where: { clinicId: seeded.clinicId } });
    const consultationIds = consultations.map((c) => c.id);
    await db.Invoice.destroy({ where: { clinicId: seeded.clinicId } });
    if (consultationIds.length) {
      await db.Prescription.destroy({ where: { consultationId: consultationIds } });
    }
    await db.Consultation.destroy({ where: { clinicId: seeded.clinicId } });
    await db.QueueEntry.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Patient.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Staff.destroy({ where: { clinicId: seeded.clinicId } });
    await db.Clinic.destroy({ where: { id: seeded.clinicId } });
    await db.sequelize.close();
  }
  server?.close();
});

test('happy path: doctor completes a consultation and everything lands together', async () => {
  const doctor = seeded.staff.doctor;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: {
      notes: 'Mild fever, advised rest and fluids.',
      diagnosis: 'Viral upper respiratory infection',
      prescriptions: validPrescriptions,
    },
  });

  assert.equal(status, 200);
  assert.equal(body.data.consultation.status, 'completed');
  assert.equal(body.data.invoice.status, 'Pending');
  assert.equal(body.data.queueStatus, 'Awaiting Payment');

  const saved = await db.Consultation.findByPk(consultation.id);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.notes, 'Mild fever, advised rest and fluids.');
  assert.equal(saved.diagnosis, 'Viral upper respiratory infection');

  const prescriptions = await db.Prescription.findAll({ where: { consultationId: consultation.id } });
  assert.equal(prescriptions.length, 1);
  assert.equal(prescriptions[0].drugName, 'Paracetamol');

  const invoice = await db.Invoice.findOne({ where: { consultationId: consultation.id } });
  assert.ok(invoice, 'invoice must be created');
  assert.equal(invoice.status, 'Pending');
  assert.equal(invoice.patientId, visit.patient.id);
  assert.equal(Number(invoice.totalAmount), 5000);

  await visit.queueEntry.reload();
  assert.equal(visit.queueEntry.status, 'Awaiting Payment');
});

test('atomic failure: an illegal queue transition rolls back every other write', async () => {
  const doctor = seeded.staff.doctor;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  // Simulate the visit having moved out from under the doctor between open
  // and complete (e.g. cancelled elsewhere) - direct write, bypassing
  // changeStatus, so no legality check happens on the way in.
  visit.queueEntry.status = 'Cancelled';
  await visit.queueEntry.save();

  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: {
      notes: 'should not be saved',
      diagnosis: 'should not be saved',
      prescriptions: validPrescriptions,
    },
  });

  // Cancelled -> Awaiting Payment is not in the transition table.
  assert.equal(status, 409);
  assert.equal(body.error.code, 'QUEUE_ILLEGAL_TRANSITION');

  // Nothing from the failed attempt survived - not the consultation update,
  // not the prescription, not the invoice, not the queue status.
  const reloadedConsultation = await db.Consultation.findByPk(consultation.id);
  assert.equal(reloadedConsultation.status, 'in_progress');
  assert.equal(reloadedConsultation.notes, null);
  assert.equal(reloadedConsultation.diagnosis, null);

  const prescriptions = await db.Prescription.findAll({ where: { consultationId: consultation.id } });
  assert.equal(prescriptions.length, 0);

  const invoice = await db.Invoice.findOne({ where: { consultationId: consultation.id } });
  assert.equal(invoice, null);

  await visit.queueEntry.reload();
  assert.equal(visit.queueEntry.status, 'Cancelled');

  const events = await db.QueueStatusEvent.findAll({ where: { queueEntryId: visit.queueEntry.id } });
  assert.equal(events.length, 0);
});

test('completing twice is 409 on the second call', async () => {
  const doctor = seeded.staff.doctor;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);
  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });

  const first = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(first.status, 200);

  const second = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'CONSULTATION_ALREADY_COMPLETED');
});

test('unknown consultation id is 404', async () => {
  const doctor = seeded.staff.doctor;
  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const { status, body } = await api('/consultations/00000000-0000-4000-8000-00000000dead/complete', {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('a different doctor cannot complete this consultation', async () => {
  const doctor = seeded.staff.doctor;
  const otherDoctor = seeded.staff.doctor2;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  const token = tokenFor({ id: otherDoctor.id, clinicId: otherDoctor.clinicId, role: 'doctor' });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(status, 404); // not 403 - don't leak that the id exists
  assert.equal(body.error.code, 'NOT_FOUND');

  const reloaded = await db.Consultation.findByPk(consultation.id);
  assert.equal(reloaded.status, 'in_progress');
});

test('another clinic cannot complete this consultation', async () => {
  const doctor = seeded.staff.doctor;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  const token = tokenFor({
    id: doctor.id,
    clinicId: '00000000-0000-4000-8000-0000000000aa',
    role: 'doctor',
  });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('nurse cannot complete a consultation', async () => {
  const doctor = seeded.staff.doctor;
  const nurse = seeded.staff.nurse;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  const token = tokenFor({ id: nurse.id, clinicId: nurse.clinicId, role: 'nurse' });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: { notes: 'n', diagnosis: 'd', prescriptions: [] },
  });
  assert.equal(status, 403);
  assert.equal(body.error.code, 'FORBIDDEN_ROLE');
});

test('a malformed prescription is rejected and nothing is saved', async () => {
  const doctor = seeded.staff.doctor;
  const visit = await newInConsultationVisit(doctor);
  const consultation = await openConsultation(doctor, visit);

  const token = tokenFor({ id: doctor.id, clinicId: doctor.clinicId, role: 'doctor' });
  const { status, body } = await api(`/consultations/${consultation.id}/complete`, {
    method: 'POST',
    token,
    body: {
      notes: 'n',
      diagnosis: 'd',
      prescriptions: [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'twice daily' }], // missing duration
    },
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');

  const reloaded = await db.Consultation.findByPk(consultation.id);
  assert.equal(reloaded.status, 'in_progress');
  const prescriptions = await db.Prescription.findAll({ where: { consultationId: consultation.id } });
  assert.equal(prescriptions.length, 0);
  const invoice = await db.Invoice.findOne({ where: { consultationId: consultation.id } });
  assert.equal(invoice, null);
});
