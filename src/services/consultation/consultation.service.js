import db from "../../models/index.js";
import ApiError from "../../utils/ApiError.js";
import { ErrorCode, ConsultationStatus, QueueStatus } from "../../constants/index.js";
import { isUuid } from "../../utils/uuid.js";

const { Consultation, Patient, QueueEntry } = db;

export async function openConsultation({ clinicId, queueEntryId, patientId, doctorId }) {
  if (!queueEntryId || !patientId) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "queueEntryId and patientId are required.");
  }

  // Confirms queueEntryId and patientId agree with each other and both
  // belong to this clinic - same cross-clinic guard as vitals.service.js.
  const queueEntry =
    isUuid(queueEntryId) && isUuid(patientId)
      ? await QueueEntry.findOne({ where: { id: queueEntryId, clinicId, patientId } })
      : null;
  if (!queueEntry) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Queue entry not found");
  }

  // Per the queue rulebook, a consultation can't start until the doctor has
  // advanced the visit to In Consultation (Awaiting Doctor -> In Consultation).
  // Skipping straight from an earlier status would bypass that required move.
  if (queueEntry.status !== QueueStatus.IN_CONSULTATION) {
    throw new ApiError(
      409,
      ErrorCode.QUEUE_ILLEGAL_TRANSITION,
      "Queue entry must be In Consultation before a consultation can be opened.",
    );
  }

  return Consultation.create({
    clinicId,
    queueEntryId,
    patientId,
    doctorId,
    status: ConsultationStatus.IN_PROGRESS,
  });
}

export async function getConsultationsForPatient({ clinicId, patientId, queueEntryId }) {
  const patient = isUuid(patientId) ? await Patient.findOne({ where: { id: patientId, clinicId } }) : null;
  if (!patient) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Patient not found");
  }

  if (queueEntryId && !isUuid(queueEntryId)) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "queueEntryId must be a valid UUID.");
  }

  const where = { clinicId, patientId };
  if (queueEntryId) where.queueEntryId = queueEntryId;
  return Consultation.findAll({ where, order: [["createdAt", "DESC"]] });
}
