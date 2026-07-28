import { getById, search } from "../services/patient.services.js";
import { ok } from "../utils/response.js";
import { parsePagination } from "../utils/pagination.js";

// GET /patients
export async function getPatients(req, res, next) {
    try {
        const { limit, offset } = parsePagination(req.query);
        const data = await search(req.user.clinicId, req.query.search, limit, offset);
        return ok(res, data);
    } catch (err) {
        return next(err);
    }
}

// GET /patients/:id
export async function getPatientById(req, res, next) {
    try {
        const patient = await getById(req.params.id, req.user.clinicId);
        return ok(res, { patient });
    } catch (err) {
        return next(err);
    }
}
