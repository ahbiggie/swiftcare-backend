import { signupClinic, loginUser, inviteStaff, acceptInvite } from '../services/auth/auth.service.js';
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

export async function postInvite(req, res, next) {
  try {
    const { name, email, role } = req.body || {};
    // clinicId from the caller's own token, never the request body.
    const data = await inviteStaff({ name, email, role, clinicId: req.user.clinicId });
    return created(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function postAcceptInvite(req, res, next) {
  try {
    const { inviteToken, password } = req.body || {};
    const data = await acceptInvite({ inviteToken, password });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}
