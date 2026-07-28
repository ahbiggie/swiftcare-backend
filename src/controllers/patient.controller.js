import { getById } from "../services/patient.services.js";
import { ok } from "../utils/response.js";

// GET /patients/:id
export async function getPatientById(req, res, next) {
    try {
        const patient = await getById(req.params.id, req.user.clinicId);
        return ok(res, { patient });
    } catch (err) {
        return next(err);
    }
}
