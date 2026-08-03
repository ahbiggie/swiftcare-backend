import db from "../../models/index.js";
import ApiError from "../../utils/ApiError.js";
import { ErrorCode } from "../../constants/index.js";
import { isUuid } from "../../utils/uuid.js";

const { Patient, Consultation, Invoice } = db;

// GET /invoices/:patientId?queueEntryId= - invoices don't carry queueEntryId
// directly (they're keyed off the consultation that produced them, one
// invoice per consultation), so narrowing by visit means resolving it via
// that link first, same as getConsultationsForPatient does for consultations.
export async function getInvoicesForPatient({ clinicId, patientId, queueEntryId }) {
  const patient = isUuid(patientId) ? await Patient.findOne({ where: { id: patientId, clinicId } }) : null;
  if (!patient) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Patient not found");
  }

  if (queueEntryId && !isUuid(queueEntryId)) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "queueEntryId must be a valid UUID.");
  }

  const where = { clinicId, patientId };
  if (queueEntryId) {
    const consultation = await Consultation.findOne({ where: { clinicId, patientId, queueEntryId } });
    if (!consultation) return [];
    where.consultationId = consultation.id;
  }

  return Invoice.findAll({ where, order: [["createdAt", "DESC"]] });
}
