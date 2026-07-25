import { signupClinic } from '../services/auth/auth.service.js';
import { created } from '../utils/response.js';

export async function postClinicSignup(req, res, next) {
  try {
    const { clinicName, address, email, password } = req.body || {};
    const data = await signupClinic({ clinicName, address, email, password });
    return created(res, data);
  } catch (err) {
    return next(err);
  }
}
