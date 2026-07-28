import db from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { ErrorCode, Role } from '../constants/index.js';

const { Patient } = db;

export async function getById(id, clinicId) {
    const patient = await Patient.findByPk(id);

    //Both missing and cross-clinic, get a 404 error meassage
    // (You should not leak other clinics' patient IDs).
    if (!patient || (patient.clinicId !== clinicId)) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, "Patient not found");
    } 

    return patient;
}
