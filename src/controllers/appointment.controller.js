import { create } from '../services/appointment.service.js';
import { created } from '../utils/response.js';

// POST /appointments
export async function postAppointment(req, res, next) {
    try {
        const { patientId, doctorId, date, time } = req.body || {};
        const appointment = await create({ clinicId: req.user.clinicId, patientId, doctorId, date, time });
        return created(res, { appointment });
    } catch (err) {
        return next(err);
    }
}
