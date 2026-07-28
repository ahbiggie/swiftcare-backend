import db from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';

const { Patient } = db;

const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// clinic-scoped lookup
export async function getById(id, clinicId) {
    const patient = isUuid(id) ? await Patient.findByPk(id) : null;

    // missing and cross-clinic both look like "not found"
    if (!patient || (patient.clinicId !== clinicId)) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, "Patient not found");
    }

    return patient;
}
