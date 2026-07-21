import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';

export default function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Missing token'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.sub, clinicId: decoded.clinicId, role: decoded.role };
    next();
  } catch {
    next(new ApiError(401, ErrorCode.UNAUTHENTICATED, 'Invalid token'));
  }
}
