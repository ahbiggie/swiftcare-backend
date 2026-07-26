import crypto from 'node:crypto';
import db from '../../models/index.js';
import ApiError from '../../utils/ApiError.js';
import { ErrorCode, Role, StaffStatus } from '../../constants/index.js';
import { signClinicToken, signStaffToken } from '../../utils/jwt.js';
import { INVITABLE_ROLES } from '../../models/staff.js';

const { Clinic, Staff, sequelize } = db;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Never let the password hash leave the service, even though it's a hash.
const publicClinic = (clinic) => ({
  id: clinic.id,
  name: clinic.name,
  address: clinic.address,
  email: clinic.email,
});

const publicStaff = (staff) => ({
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  status: staff.status,
  clinicId: staff.clinicId,
});

// One signed-in shape, whichever table the account came from. Both builders
// must produce the same keys — the contract defines `user` once, and a caller
// shouldn't be able to tell which table answered.
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

// Email must be unique across BOTH credential tables, not just within each —
// clinics.email and staff.email are separate unique indexes, so neither alone
// stops the same address existing in both (see D11). Returns which table (if
// either) already holds it, so each caller can word its own message.
async function findEmailOwner(email) {
  const [clinic, staff] = await Promise.all([
    Clinic.findOne({ where: { email } }),
    Staff.findOne({ where: { email } }),
  ]);
  if (clinic) return { table: 'clinic', row: clinic };
  if (staff) return { table: 'staff', row: staff };
  return null;
}

async function assertEmailAvailableForSignup(email) {
  if (await findEmailOwner(email)) {
    throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, 'That email is already registered.');
  }
}

// Same guard as signup, but the honest message differs by situation (D12):
// "already registered" reads oddly for an admin re-inviting the same address
// to their own clinic, versus that address belonging to someone else's clinic
// entirely.
async function assertEmailAvailableForInvite(email, clinicId) {
  const owner = await findEmailOwner(email);
  if (!owner) return;

  if (owner.table === 'clinic') {
    throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, 'That email belongs to a clinic account already.');
  }

  const message =
    owner.row.clinicId === clinicId
      ? 'That email has already been invited to this clinic.'
      : 'That email is already registered to a different clinic.';
  throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, message);
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

  await assertEmailAvailableForSignup(email);

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

  // Clinic first, then Staff. Order is not load-bearing: assertEmailAvailable*
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

// POST /auth/invite — admin only. clinicId comes from the caller's own token
// (auth middleware), never from the request body — an admin can only invite
// into their own clinic. Creates the Staff row and returns a link carrying the
// invite token; there's no one to sign in yet, since the invite hasn't been
// accepted.
export async function inviteStaff({ name, email, role, clinicId }) {
  if (!name || !email || !role) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'name, email and role are all required.');
  }
  if (!INVITABLE_ROLES.includes(role)) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `role must be one of: ${INVITABLE_ROLES.join(', ')}.`,
    );
  }

  await assertEmailAvailableForInvite(email, clinicId);

  // 32 random bytes -> 64 hex chars. This token is the ENTIRE gate on
  // accept-invite (no Authorization header exists yet for someone who hasn't
  // accepted), so it has to be unguessable, not just unique — the same
  // primitive used to generate JWT_SECRET, applied at runtime instead of once.
  const inviteToken = crypto.randomBytes(32).toString('hex');

  let staff;
  try {
    staff = await Staff.create({ clinicId, name, email, role, inviteToken });
  } catch (err) {
    // Same same-table race backstop as signup.
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, 'That email is already registered.');
    }
    throw err;
  }

  return {
    ...publicStaff(staff),
    inviteLink: `${FRONTEND_URL}/accept-invite?token=${inviteToken}`,
  };
}

// POST /auth/accept-invite — public (the invite token itself is the gate;
// there is no JWT to present, so `auth` must NOT be mounted on this route).
// Moves the staff member invited -> active and signs them in.
export async function acceptInvite({ inviteToken, password }) {
  if (!inviteToken || !password) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'inviteToken and password are both required.',
    );
  }

  return sequelize.transaction(async (t) => {
    // Locked so two near-simultaneous accepts of the same token can't both
    // succeed — same concurrency discipline as the queue guard (D5): re-read
    // and compare state inside a transaction, immediately before writing.
    const staff = await Staff.findOne({
      where: { inviteToken },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // One failure mode covers two situations, deliberately (D12). Clearing
    // inviteToken below on success means an already-active row can never be
    // found by its old token again, so "token never existed" and "already
    // accepted" collapse into the same case here — there's nothing to invent
    // a second error code for. This is also the actual security property being
    // asked for: a stale invite link sitting unused in an inbox must stop
    // *working*, not just report a friendlier error while still functioning as
    // an unauthenticated password reset. The row lock above gives the same
    // outcome for a genuine race: the losing request's SELECT re-runs after
    // the winner commits and finds nothing, since the token is already null.
    if (!staff) {
      throw new ApiError(
        404,
        ErrorCode.NOT_FOUND,
        'This invite link is invalid or has already been used.',
      );
    }

    staff.password = password; // beforeUpdate hook hashes it (utils/password.js)
    staff.status = StaffStatus.ACTIVE;
    staff.inviteToken = null;
    await staff.save({ transaction: t });

    return { token: signStaffToken(staff), user: staffAsUser(staff) };
  });
}
