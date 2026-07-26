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

async function assertEmailAvailable(email, message) {
  const [clinic, staff] = await Promise.all([
    Clinic.findOne({ where: { email } }),
    Staff.findOne({ where: { email } }),
  ]);
  if (clinic || staff) {
    throw new ApiError(409, ErrorCode.DUPLICATE_EMAIL, message);
  }
}

// POST /auth/clinic/signup
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
    clinic = await Clinic.create({ name: clinicName, address, email, password });
  } catch (err) {
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

// POST /auth/login
export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'email and password are both required.');
  }

  const rejectCredentials = () =>
    new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Invalid email or password');

  const clinic = await Clinic.findOne({ where: { email } });
  if (clinic) {
    if (!(await clinic.comparePassword(password))) throw rejectCredentials();
    return { token: signClinicToken(clinic), user: clinicAsUser(clinic) };
  }

  const staff = await Staff.findOne({ where: { email } });
  if (!staff) throw rejectCredentials();

  // Status before password
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
