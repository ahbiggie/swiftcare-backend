import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';
import { verifyToken } from '../utils/jwt.js';

export default function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Missing token'));
  }

  try {
    // Shape comes from utils/jwt.js, the same module that signed it.
    req.user = verifyToken(token);
    next();
  } catch {
    next(new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Invalid token'));
  }
}
