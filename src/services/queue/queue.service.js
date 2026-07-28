import db from '../../models/index.js';
import ApiError from '../../utils/ApiError.js';
import { ErrorCode, Role } from '../../constants/index.js';
import { assertCanTransition } from './transitions.js';
import { assertDoctorExists } from '../auth/auth.service.js';
import { isUuid } from '../../utils/uuid.js';

const { Patient, Appointment, QueueEntry, QueueStatusEvent, sequelize } = db;

export function listQueue({ clinicId, status, assignedDoctorId }) {
  const where = { clinicId };
  if (status) where.status = status;
  if (assignedDoctorId) where.assignedDoctorId = assignedDoctorId;
  return QueueEntry.findAll({ where, order: [['createdAt', 'ASC']] });
}

// the moment a visit begins - creates the QueueEntry everything else attaches to
export async function checkIn({ clinicId, patientId, appointmentId, assignedDoctorId }) {
  if (!patientId || !assignedDoctorId) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'patientId and assignedDoctorId are required.');
  }

  const patient = isUuid(patientId) ? await Patient.findOne({ where: { id: patientId, clinicId } }) : null;
  if (!patient) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, 'Patient not found');
  }

  await assertDoctorExists(clinicId, assignedDoctorId);

  if (appointmentId) {
    const appointment = isUuid(appointmentId)
      ? await Appointment.findOne({ where: { id: appointmentId, clinicId, patientId } })
      : null;
    if (!appointment) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Appointment not found');
    }
  }

  // one active visit per patient is enforced by the DB's partial unique
  // index - this catches that rejection rather than checking-then-hoping
  let entry;
  try {
    entry = await QueueEntry.create({
      clinicId,
      patientId,
      appointmentId: appointmentId || null,
      assignedDoctorId,
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, ErrorCode.QUEUE_ALREADY_CHECKED_IN, 'Patient already has an active visit.');
    }
    throw err;
  }

  return { queueId: entry.id, status: entry.status };
}

export function changeStatus({ queueId, actor, status, note }) {
  return sequelize.transaction(async (t) => {

    const entry = await QueueEntry.findByPk(queueId, { transaction: t, lock: t.LOCK.UPDATE });

    // cross-clinic: don't leak other clinics' queue IDs.
    if (!entry || entry.clinicId !== actor.clinicId) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, 'Queue entry not found');
    }

    assertCanTransition(entry.status, status, actor.role, note);

    const fromStatus = entry.status;
    entry.status = status;

    entry.lastUpdatedBy = actor.role === Role.ADMIN ? null : actor.id;
    await entry.save({ transaction: t });

    // Same transaction as the status change: the event (and its note) can never
    // exist without the move, nor the move without its event.
    await QueueStatusEvent.create(
      { queueEntryId: entry.id, fromStatus, toStatus: status, changedBy: actor.id, note: note || null },
      { transaction: t },
    );

    return { queueId: entry.id, status: entry.status, lastUpdatedBy: entry.lastUpdatedBy };
  });
}
