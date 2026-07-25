import db from '../../models/index.js';
import ApiError from '../../utils/ApiError.js';
import { ErrorCode, Role } from '../../constants/index.js';
import { signClinicToken } from '../../utils/jwt.js';

const { Clinic } = db;

// Never let the password hash leave the service, even though it's a hash.
const publicClinic = (clinic) => ({
  id: clinic.id,
  name: clinic.name,
  address: clinic.address,
  email: clinic.email,
});

// The signed-in shape the rest of the API uses (matches GET /auth/me).
const clinicAsUser = (clinic) => ({
  id: clinic.id,
  name: clinic.name,
  role: Role.ADMIN,
  clinicId: clinic.id,
});

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

  let clinic;
  try {
    // The model's beforeCreate hook hashes the password (utils/password.js).
    clinic = await Clinic.create({ name: clinicName, address, email, password });
  } catch (err) {
    // Clinic.email is globally unique (D6). errorHandler only special-cases
    // SequelizeValidationError, so without this a taken email would surface as
    // a generic 500 instead of telling the caller what's actually wrong.
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(400, ErrorCode.VALIDATION_ERROR, 'That email is already registered.');
    }
    throw err;
  }

  return {
    token: signClinicToken(clinic),
    clinic: publicClinic(clinic),
    user: clinicAsUser(clinic),
  };
}
