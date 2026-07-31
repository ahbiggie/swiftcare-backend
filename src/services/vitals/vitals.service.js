import db from "../../models/index.js";
import ApiError from "../../utils/ApiError.js";
import { ErrorCode } from "../../constants/index.js";
import { isUuid } from "../../utils/uuid.js";

const { Vitals, Patient, QueueEntry } = db;

export async function recordVitals({
  clinicId,
  queueEntryId,
  patientId,
  bpSystolic,
  bpDiastolic,
  temperature,
  weight,
  recordedBy,
}) {
  if (
    !queueEntryId ||
    !patientId ||
    bpSystolic == null ||
    bpDiastolic == null ||
    temperature == null ||
    weight == null
  ) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "queueEntryId, patientId, bpSystolic, bpDiastolic, temperature, and weight are required.",
    );
  }

  // Confirms queueEntryId and patientId agree with each other, not just that
  // each looks plausible - same cross-clinic guard as queue.service.js's checkIn.
  const queueEntry =
    isUuid(queueEntryId) && isUuid(patientId)
      ? await QueueEntry.findOne({ where: { id: queueEntryId, clinicId, patientId } })
      : null;
  if (!queueEntry) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Queue entry not found");
  }

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

export async function getVitalsForPatient({ clinicId, patientId, queueEntryId }) {
  const patient = isUuid(patientId) ? await Patient.findOne({ where: { id: patientId, clinicId } }) : null;
  if (!patient) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Patient not found");
  }

  if (queueEntryId && !isUuid(queueEntryId)) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "queueEntryId must be a valid UUID.");
  }

  const where = { clinicId, patientId };
  if (queueEntryId) where.queueEntryId = queueEntryId;
  return Vitals.findAll({ where, order: [["recordedAt", "DESC"]] });
}
