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
 * Guard: returns silently when the move is allowed, throws ApiError when it isn't.
 */
export function assertCanTransition(currentStatus, nextStatus, callerRole) {
  // Admin sits above the table instead of in it, so no lookup is needed.
  if (callerRole === Role.ADMIN) return;

  const transition = TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === nextStatus,
  );

  // Checked before the role check: a move that isn't in the table is illegal for
  // everyone, so reporting it as a role problem would misdescribe the failure.
  if (!transition) {
    throw new ApiError(
      409,
      ErrorCode.QUEUE_ILLEGAL_TRANSITION,
      `Cannot move a visit from "${currentStatus}" to "${nextStatus}".`,
    );
  }

  if (transition.role !== callerRole) {
    throw new ApiError(
      403,
      ErrorCode.FORBIDDEN_ROLE,
      `Moving a visit from "${currentStatus}" to "${nextStatus}" is reserved for the ${transition.role} role.`,
    );
  }
}
