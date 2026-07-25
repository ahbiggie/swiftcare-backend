import { signupClinic, loginUser } from '../services/auth/auth.service.js';
import { ok, created } from '../utils/response.js';

export async function postClinicSignup(req, res, next) {
  try {
    const { clinicName, address, email, password } = req.body || {};
    const data = await signupClinic({ clinicName, address, email, password });
    return created(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function postLogin(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const data = await loginUser({ email, password });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}
