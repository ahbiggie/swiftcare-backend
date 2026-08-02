import {
  openConsultation,
  completeConsultation,
  getConsultationsForPatient,
} from "../services/consultation/consultation.service.js";
import { ok, created } from "../utils/response.js";

export async function postConsultation(req, res, next) {
  try {
    const { queueEntryId, patientId } = req.body || {};
    const consultation = await openConsultation({
      clinicId: req.user.clinicId,
      queueEntryId,
      patientId,
      doctorId: req.user.id,
    });
    return created(res, consultation);
  } catch (err) {
    return next(err);
  }
}

export async function postCompleteConsultation(req, res, next) {
  try {
    const { notes, diagnosis, prescriptions } = req.body || {};
    const result = await completeConsultation({
      clinicId: req.user.clinicId,
      consultationId: req.params.id,
      doctorId: req.user.id,
      notes,
      diagnosis,
      prescriptions,
    });
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

export async function getConsultations(req, res, next) {
  try {
    const { patientId } = req.params;
    const { queueEntryId } = req.query;
    const consultations = await getConsultationsForPatient({
      clinicId: req.user.clinicId,
      patientId,
      queueEntryId,
    });
    return ok(res, { consultations });
  } catch (err) {
    return next(err);
  }
}
