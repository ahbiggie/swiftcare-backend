import { Op } from 'sequelize';
import db from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';
import { normalizePhone } from '../utils/phone.js';

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

// search by name (partial) or phone (exact, normalized)
export async function search(clinicId, term, limit, offset) {
    const where = { clinicId };

    if (term) {
        where[Op.or] = [
            { firstName: { [Op.iLike]: `%${term}%` } },
            { lastName: { [Op.iLike]: `%${term}%` } },
            { phone: normalizePhone(term) },
        ];
    }

    const { rows, count } = await Patient.findAndCountAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
    });

    return { patients: rows, total: count };
}
