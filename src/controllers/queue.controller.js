import { listQueue, changeStatus } from '../services/queue/queue.service.js';
import { ok } from '../utils/response.js';

export async function getQueue(req, res, next) {
  try {
    const { status, assignedDoctorId } = req.query;
    const queue = await listQueue({ clinicId: req.user.clinicId, status, assignedDoctorId });
    return ok(res, { queue });
  } catch (err) {
    return next(err);
  }
}

export async function postStatus(req, res, next) {
  try {
    const { status, note } = req.body || {};
    const data = await changeStatus({
      queueId: req.params.queueId,
      actor: req.user,
      status,
      note,
    });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}
