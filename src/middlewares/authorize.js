import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';

// Always mount after `auth` — it reads req.user.role.
export default function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Missing token'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(403, ErrorCode.FORBIDDEN_ROLE, 'Role not permitted for this action')
      );
    }
    next();
  };
}
