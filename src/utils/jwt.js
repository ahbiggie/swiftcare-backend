// SHARED. Both sides of the token contract live here: the code that signs a
// token and the code that reads one back.
// Payload is fixed by the contract: { sub, clinicId, role, iat, exp }. No PII.

import jwt from 'jsonwebtoken';
import { Role } from '../constants/index.js';

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

// Private: everything that reaches jwt.sign goes through here.
const signToken = ({ sub, clinicId, role }) =>
  jwt.sign({ sub, clinicId, role }, process.env.JWT_SECRET, { expiresIn: EXPIRES_IN });

// The clinic account IS the admin account (see clinic.js), so its token is
// self-referential: it is both the subject and the clinic being scoped to.
export const signClinicToken = (clinic) =>
  signToken({ sub: clinic.id, clinicId: clinic.id, role: Role.ADMIN });

// Staff carry a real clinicId of their own, and a role from the invitable set.
export const signStaffToken = (staff) =>
  signToken({ sub: staff.id, clinicId: staff.clinicId, role: staff.role });

// Returns the shape routes actually consume (`id`, not `sub`). Throws on an
// invalid or expired token — callers decide how to report that.
export const verifyToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return { id: decoded.sub, clinicId: decoded.clinicId, role: decoded.role };
};
