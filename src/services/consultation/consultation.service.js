import db from "../../models/index.js";
import ApiError from "../../utils/ApiError.js";
import {
  ErrorCode,
  ConsultationStatus,
  QueueStatus,
  InvoiceStatus,
  CONSULTATION_FEE,
  Role,
} from "../../constants/index.js";
import { isUuid } from "../../utils/uuid.js";
import { changeStatus } from "../queue/queue.service.js";

const { Consultation, Patient, QueueEntry, Prescription, Invoice, sequelize } = db;

const REQUIRED_PRESCRIPTION_FIELDS = ["drugName", "dosage", "frequency", "duration"];

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

function assertValidPrescriptions(prescriptions) {
  if (prescriptions === undefined) return;
  if (!Array.isArray(prescriptions)) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "prescriptions must be an array.");
  }
  prescriptions.forEach((item, index) => {
    for (const field of REQUIRED_PRESCRIPTION_FIELDS) {
      if (typeof item?.[field] !== "string" || !item[field].trim()) {
        throw new ApiError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `prescriptions[${index}].${field} is required.`,
        );
      }
    }
  });
}

// The most important write path in the system: notes/diagnosis, every
// prescription, the invoice, and the queue move to Awaiting Payment either
// all land together or none of them do. One sequelize.transaction wraps the
// whole thing, and the queue move runs inside it via changeStatus's
// transaction param (see queue.service.js) rather than a second, separate
// implementation of the transition logic.
export async function completeConsultation({ clinicId, consultationId, doctorId, notes, diagnosis, prescriptions }) {
  if (!isUuid(consultationId)) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Consultation not found");
  }
  assertValidPrescriptions(prescriptions);

  return sequelize.transaction(async (t) => {
    // Row lock: same pattern as queue.service.js's changeStatus - nothing else
    // may act on this consultation while we decide whether to complete it.
    const consultation = await Consultation.findByPk(consultationId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // Cross-clinic and cross-doctor collapse into the same 404: don't tell a
    // caller that a consultation exists if it isn't theirs to complete.
    if (!consultation || consultation.clinicId !== clinicId || consultation.doctorId !== doctorId) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, "Consultation not found");
    }

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new ApiError(
        409,
        ErrorCode.CONSULTATION_ALREADY_COMPLETED,
        "This consultation has already been completed.",
      );
    }

    consultation.notes = notes ?? null;
    consultation.diagnosis = diagnosis ?? null;
    consultation.status = ConsultationStatus.COMPLETED;
    await consultation.save({ transaction: t });

    for (const item of prescriptions ?? []) {
      await Prescription.create(
        {
          consultationId: consultation.id,
          drugName: item.drugName,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
        },
        { transaction: t },
      );
    }

    const invoice = await Invoice.create(
      {
        clinicId,
        patientId: consultation.patientId,
        consultationId: consultation.id,
        totalAmount: CONSULTATION_FEE,
        status: InvoiceStatus.PENDING,
      },
      { transaction: t },
    );

    // Same transition the queue route itself would make (In Consultation ->
    // Awaiting Payment, doctor-owned) - reusing changeStatus is what keeps the
    // transition rules in one place. If the queue entry isn't where this
    // expects (already moved, cancelled, etc.) this throws and every write
    // above rolls back with it.
    const queueResult = await changeStatus({
      queueId: consultation.queueEntryId,
      actor: { id: doctorId, clinicId, role: Role.DOCTOR },
      status: QueueStatus.AWAITING_PAYMENT,
      transaction: t,
    });

    return {
      consultation: { id: consultation.id, status: consultation.status },
      invoice: { id: invoice.id, status: invoice.status },
      queueStatus: queueResult.status,
    };
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
