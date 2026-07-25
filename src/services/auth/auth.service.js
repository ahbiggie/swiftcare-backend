import db from '../../models/index.js';
import ApiError from '../../utils/ApiError.js';
import { ErrorCode, Role, StaffStatus } from '../../constants/index.js';
import { signClinicToken, signStaffToken } from '../../utils/jwt.js';

const { Clinic, Staff } = db;

// Never let the password hash leave the service, even though it's a hash.
const publicClinic = (clinic) => ({
  id: clinic.id,
  name: clinic.name,
  address: clinic.address,
  email: clinic.email,
});

// One signed-in shape, whichever table the account came from. Both builders
// must produce the same keys — the contract defines `user` once, and a caller
// shouldn't be able to tell which table answered. A test asserts key parity.
const clinicAsUser = (clinic) => ({
  id: clinic.id,
  name: clinic.name,
  role: Role.ADMIN,
  clinicId: clinic.id,
});

const staffAsUser = (staff) => ({
  id: staff.id,
  name: staff.name,
  role: staff.role,
  clinicId: staff.clinicId,
});

// Email must be unique across BOTH credential tables, not just within each.
// clinics.email and staff.email are separate unique indexes, so neither stops
// the same address existing in both — and login looks up by email alone, so a
// cross-table duplicate would make that lookup ambiguous. See D11, including
// the concurrent-write case this pre-check cannot cover.
async function assertEmailAvailable(email, message) {
  const [clinic, staff] = await Promise.all([
    Clinic.findOne({ where: { email } }),
    Staff.findOne({ where: { email } }),
  ]);
  if (clinic || staff) {
    throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, message);
  }
}

// POST /auth/clinic/signup — public. Creates the clinic, which IS the admin
// account, and hands back a token so the caller is signed in immediately.
export async function signupClinic({ clinicName, address, email, password }) {
  if (!clinicName || !address || !email || !password) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'clinicName, address, email and password are all required.',
    );
  }

  await assertEmailAvailable(email, 'That email is already registered.');

  let clinic;
  try {
    // The model's beforeCreate hook hashes the password (utils/password.js).
    clinic = await Clinic.create({ name: clinicName, address, email, password });
  } catch (err) {
    // Backstop for the same-table race the pre-check can't win: two concurrent
    // signups both pass the check, then the unique index rejects the loser.
    // Without this it would surface as a generic 500 — errorHandler only
    // special-cases SequelizeValidationError, which this is not.
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, 'That email is already registered.');
    }
    throw err;
  }

  return {
    token: signClinicToken(clinic),
    clinic: publicClinic(clinic),
    user: clinicAsUser(clinic),
  };
}

// POST /auth/login — public. Credentials live in two tables (Clinic = the admin
// account, Staff = everyone invited), and the request carries no hint of which.
export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'email and password are both required.');
  }

  // Identical for "no such email" and "wrong password" — a caller must not be
  // able to probe which addresses are registered. Asserted byte-equal in tests.
  const rejectCredentials = () =>
    new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Invalid email or password');

  // Clinic first, then Staff. Order is not load-bearing: assertEmailAvailable
  // makes at most one row matchable across both tables, so this only decides
  // which query runs first. Fall through on NOT FOUND only — never after a
  // password mismatch. A matched row is definitionally the account, and trying
  // the other table would presume the same email could live in both, which is
  // exactly what the cross-table guard forbids.
  const clinic = await Clinic.findOne({ where: { email } });
  if (clinic) {
    if (!(await clinic.comparePassword(password))) throw rejectCredentials();
    return { token: signClinicToken(clinic), user: clinicAsUser(clinic) };
  }

  const staff = await Staff.findOne({ where: { email } });
  if (!staff) throw rejectCredentials();

  // Status before password, and not as a courtesy: an invited row's password is
  // still null, so there is literally nothing to compare against. This is the
  // only meaningful order. It does leak that the address is registered — a
  // tradeoff the contract accepts by defining this exact error (see D11).
  if (staff.status === StaffStatus.INVITED) {
    throw new ApiError(
      403,
      ErrorCode.INVITE_NOT_ACCEPTED,
      'This invite has not been accepted yet. Set your password using the invite link first.',
    );
  }

  if (!(await staff.comparePassword(password))) throw rejectCredentials();

  return { token: signStaffToken(staff), user: staffAsUser(staff) };
}
