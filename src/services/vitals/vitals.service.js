import db from "../../models/index.js";

const { Vitals } = db;

export function recordVitals({
  clinicId,
  queueEntryId,
  patientId,
  bpSystolic,
  bpDiastolic,
  temperature,
  weight,
  recordedBy,
}) {
  return Vitals.create({
    clinicId,
    queueEntryId,
    patientId,
    bpSystolic,
    bpDiastolic,
    temperature,
    weight,
    recordedBy,
    recordedAt: new Date(),
  });
}

export function getVitalsForPatient({ clinicId, patientId, queueEntryId }) {
  const where = { clinicId, patientId };
  if (queueEntryId) where.queueEntryId = queueEntryId;
  return Vitals.findAll({ where, order: [["recordedAt", "DESC"]] });
}
