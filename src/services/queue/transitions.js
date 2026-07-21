import { QueueStatus as S, Role, ErrorCode } from '../../constants/index.js';
import ApiError from '../../utils/ApiError.js';

export const TRANSITIONS = [
  { from: S.CHECKED_IN, to: S.TRIAGE_READY, role: Role.NURSE },
  { from: S.TRIAGE_READY, to: S.AWAITING_DOCTOR, role: Role.NURSE },
  { from: S.AWAITING_DOCTOR, to: S.IN_CONSULTATION, role: Role.DOCTOR },
  { from: S.IN_CONSULTATION, to: S.AWAITING_PAYMENT, role: Role.DOCTOR },
  { from: S.AWAITING_PAYMENT, to: S.COMPLETED, role: Role.CASHIER },
];

/**
 * TODO (Lane 1 / Shaibu):
 *   1. Admin override: role === Role.ADMIN -> allow any move.
 *   2. Legal move? find row where from === currentStatus && to === nextStatus;
 *      none -> throw new ApiError(409, ErrorCode.QUEUE_ILLEGAL_TRANSITION, '...').
 *   3. Role owns it? row.role !== callerRole -> throw new ApiError(403, ErrorCode.FORBIDDEN_ROLE, '...').
 *
 *   Concurrency guard belongs in the calling service, not here: re-read the queue
 *   row inside a transaction and compare currentStatus immediately before writing.
 */
// eslint-disable-next-line no-unused-vars
export function assertCanTransition(currentStatus, nextStatus, callerRole) {
  throw new ApiError(501, 'NOT_IMPLEMENTED', 'assertCanTransition not built yet');
}
