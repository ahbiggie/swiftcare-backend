import ApiError from '../utils/ApiError.js';
import { ErrorCode } from '../constants/index.js';

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json({ success: false, error: { code: err.code, message: err.message } });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      error: { code: ErrorCode.VALIDATION_ERROR, message: err.message },
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
}
