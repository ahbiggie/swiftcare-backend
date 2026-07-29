import {
  recordVitals,
  getVitalsForPatient,
} from "../services/vitals/vitals.service.js";
import { ok, created } from "../utils/response.js";

export async function postVitals(req, res, next) {
  try {
    const {
      queueEntryId,
      patientId,
      bpSystolic,
      bpDiastolic,
      temperature,
      weight,
    } = req.body || {};
    const vitals = await recordVitals({
      clinicId: req.user.clinicId,
      queueEntryId,
      patientId,
      bpSystolic,
      bpDiastolic,
      temperature,
      weight,
      recordedBy: req.user.id,
    });
    return created(res, vitals);
  } catch (err) {
    return next(err);
  }
}

export async function getVitals(req, res, next) {
  try {
    const { patientId } = req.params;
    const { queueEntryId } = req.query;
    const vitals = await getVitalsForPatient({
      clinicId: req.user.clinicId,
      patientId,
      queueEntryId,
    });
    return ok(res, { vitals });
  } catch (err) {
    return next(err);
  }
}
