import db from '../../models/index.js';
import ApiError from '../../utils/ApiError.js';
import { ErrorCode, Role } from '../../constants/index.js';
import { assertCanTransition } from './transitions.js';

const { QueueEntry, QueueStatusEvent, sequelize } = db;

export function listQueue({ clinicId, status, assignedDoctorId }) {
  const where = { clinicId };
  if (status) where.status = status;
  if (assignedDoctorId) where.assignedDoctorId = assignedDoctorId;
  return QueueEntry.findAll({ where, order: [['createdAt', 'ASC']] });
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
