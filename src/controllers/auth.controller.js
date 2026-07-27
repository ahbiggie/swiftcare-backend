import {
  signupClinic,
  loginUser,
  inviteStaff,
  acceptInvite,
  getCurrentUser,
  listStaff,
  listDoctors,
} from '../services/auth/auth.service.js';
import { ok, created } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';

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

// Contract shape note: the response is the user object directly in `data` —
// { id, name, role, clinicId } — NOT wrapped in a `user` key like login's
// { token, user }. Easy to get backwards by pattern-matching login.
export async function getMe(req, res, next) {
  try {
    const user = await getCurrentUser(req.user);
    return ok(res, user);
  } catch (err) {
    return next(err);
  }
}

export async function getUsers(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const data = await listStaff({
      clinicId: req.user.clinicId,
      role: req.query.role,
      status: req.query.status,
      limit,
      offset,
    });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function getDoctors(req, res, next) {
  try {
    const doctors = await listDoctors(req.user.clinicId);
    return ok(res, { doctors });
  } catch (err) {
    return next(err);
  }
}
