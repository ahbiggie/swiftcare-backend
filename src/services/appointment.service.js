import db from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';
import { isUuid } from '../utils/uuid.js';
import { assertDoctorExists } from './auth/auth.service.js';

const { Patient, Appointment } = db;

// book a future visit
export async function create({ clinicId, patientId, doctorId, date, time }) {
    if (!patientId || !doctorId || !date || !time) {
        throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'patientId, doctorId, date and time are required.');
    }

    const patient = isUuid(patientId) ? await Patient.findOne({ where: { id: patientId, clinicId } }) : null;
    if (!patient) {
        throw new ApiError(404, ErrorCode.NOT_FOUND, 'Patient not found');
    }

    await assertDoctorExists(clinicId, doctorId);

    return Appointment.create({ clinicId, patientId, doctorId, date, time });
}
