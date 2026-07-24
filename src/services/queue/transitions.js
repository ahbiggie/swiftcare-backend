import { QueueStatus as S, Role, ErrorCode } from '../../constants/index.js';
import ApiError from '../../utils/ApiError.js';

export const TRANSITIONS = [
  { from: S.CHECKED_IN, to: S.TRIAGE_READY, role: Role.NURSE },
  { from: S.TRIAGE_READY, to: S.AWAITING_DOCTOR, role: Role.NURSE },
  { from: S.AWAITING_DOCTOR, to: S.IN_CONSULTATION, role: Role.DOCTOR },
  { from: S.IN_CONSULTATION, to: S.AWAITING_PAYMENT, role: Role.DOCTOR },
  { from: S.AWAITING_PAYMENT, to: S.COMPLETED, role: Role.CASHIER },
  { from: S.CHECKED_IN, to: S.CANCELLED, role: Role.RECEPTIONIST, requiresNote: true },
];

// whitespace-only string is treated as missing a blank reason is no reason.
const hasNote = (note) => typeof note === 'string' && note.trim().length > 0;

export function assertCanTransition(currentStatus, nextStatus, callerRole, note) {
  const transition = TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === nextStatus,
  );

  const isAdmin = callerRole === Role.ADMIN;

  // Existence and role are permission concerns, and admin overrides both — an
  // admin can make a move that isn't in the table at all, so for admin we skip

  if (!isAdmin) {
    if (!transition) {
      throw new ApiError(
        409,
        ErrorCode.QUEUE_ILLEGAL_TRANSITION,
        `Cannot move a visit from "${currentStatus}" to "${nextStatus}".`,
      );
    }

    // After existence, before the note check:  Role first.
    if (transition.role !== callerRole) {
      throw new ApiError(
        403,
        ErrorCode.FORBIDDEN_ROLE,
        `Moving a visit from "${currentStatus}" to "${nextStatus}" is reserved for the ${transition.role} role.`,
      );
    }
  }

  if (transition?.requiresNote && !hasNote(note)) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `Moving a visit from "${currentStatus}" to "${nextStatus}" requires a note explaining why.`,
    );
  }
}
