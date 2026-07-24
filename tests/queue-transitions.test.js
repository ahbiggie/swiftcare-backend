// Manual-verification tests, no framework beyond Node's built-in runner
// (`node --test`, zero dependencies — see DECISIONS "Tests"). Covers the queue
// transition guard: legality, role ownership, the note requirement, admin
// override, and the empty/whitespace edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertCanTransition } from '../src/services/queue/transitions.js';
import { QueueStatus as S, Role, ACTIVE_QUEUE_STATUSES } from '../src/constants/index.js';

// Assert the guard throws an ApiError carrying the expected HTTP status + code.
function assertRejects(args, statusCode, code) {
  assert.throws(
    () => assertCanTransition(...args),
    (err) => {
      assert.equal(err.statusCode, statusCode, `expected status ${statusCode}, got ${err.statusCode}`);
      assert.equal(err.code, code, `expected code ${code}, got ${err.code}`);
      return true;
    },
  );
}

// Assert the guard returns silently (the move is allowed).
function assertAllows(args) {
  assert.doesNotThrow(() => assertCanTransition(...args));
}

test('Cancelled and Completed are terminal — excluded from active statuses', () => {
  assert.equal(ACTIVE_QUEUE_STATUSES.includes(S.CANCELLED), false);
  assert.equal(ACTIVE_QUEUE_STATUSES.includes(S.COMPLETED), false);
});

test('legal non-note transitions are allowed without a note', () => {
  assertAllows([S.CHECKED_IN, S.TRIAGE_READY, Role.NURSE]);
  assertAllows([S.TRIAGE_READY, S.AWAITING_DOCTOR, Role.NURSE]);
  assertAllows([S.AWAITING_DOCTOR, S.IN_CONSULTATION, Role.DOCTOR]);
  assertAllows([S.IN_CONSULTATION, S.AWAITING_PAYMENT, Role.DOCTOR]);
  assertAllows([S.AWAITING_PAYMENT, S.COMPLETED, Role.CASHIER]);
});

test('illegal moves are 409, reported before role', () => {
  // skip-ahead, backwards, and a cancel from a state no row allows
  assertRejects([S.CHECKED_IN, S.COMPLETED, Role.NURSE], 409, 'QUEUE_ILLEGAL_TRANSITION');
  assertRejects([S.TRIAGE_READY, S.CHECKED_IN, Role.NURSE], 409, 'QUEUE_ILLEGAL_TRANSITION');
  assertRejects([S.AWAITING_PAYMENT, S.CANCELLED, Role.RECEPTIONIST, 'x'], 409, 'QUEUE_ILLEGAL_TRANSITION');
});

test('wrong role is 403, reported before the note check', () => {
  assertRejects([S.CHECKED_IN, S.TRIAGE_READY, Role.CASHIER], 403, 'FORBIDDEN_ROLE');
  // A nurse cancelling: role fails before we ever complain about a missing note.
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.NURSE], 403, 'FORBIDDEN_ROLE');
});

test('cancellation requires a real note', () => {
  assertAllows([S.CHECKED_IN, S.CANCELLED, Role.RECEPTIONIST, 'patient left']);
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.RECEPTIONIST], 400, 'VALIDATION_ERROR');
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.RECEPTIONIST, ''], 400, 'VALIDATION_ERROR');
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.RECEPTIONIST, '   '], 400, 'VALIDATION_ERROR');
});

test('admin overrides permission but not the note requirement', () => {
  // Permission override: an illegal, non-cancel move is allowed with no note.
  assertAllows([S.CHECKED_IN, S.COMPLETED, Role.ADMIN]);
  // Cancel with a note: fine.
  assertAllows([S.CHECKED_IN, S.CANCELLED, Role.ADMIN, 'admin reason']);
  // Cancel without a note: the note survives the admin bypass.
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.ADMIN], 400, 'VALIDATION_ERROR');
  assertRejects([S.CHECKED_IN, S.CANCELLED, Role.ADMIN, ''], 400, 'VALIDATION_ERROR');
});

test('destination-keyed: admin cancelling via an undefined path still needs a note', () => {
  // AWAITING_PAYMENT -> CANCELLED matches no row, so admin bypasses legality —
  // but the destination is Cancelled, which is note-requiring, so it still throws.
  // This is the path with no other guardrail, where the audit note matters most.
  assertRejects([S.AWAITING_PAYMENT, S.CANCELLED, Role.ADMIN], 400, 'VALIDATION_ERROR');
  assertAllows([S.AWAITING_PAYMENT, S.CANCELLED, Role.ADMIN, 'admin override, vitals already taken']);
});
