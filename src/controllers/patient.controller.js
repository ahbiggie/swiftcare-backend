import { getById, search, register } from "../services/patient.services.js";
import { ok, created } from "../utils/response.js";
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

// POST /patients
export async function postPatient(req, res, next) {
    try {
        const { firstName, lastName, phone, gender, dob, confirmNewPatient } = req.body || {};
        const patient = await register(req.user.clinicId, { firstName, lastName, phone, gender, dob, confirmNewPatient });
        return created(res, { patient });
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
