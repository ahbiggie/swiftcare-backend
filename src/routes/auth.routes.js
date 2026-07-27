import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import {
  postClinicSignup,
  postLogin,
  postInvite,
  postAcceptInvite,
  getMe,
} from '../controllers/auth.controller.js';

const router = Router();

// Public, deliberately: the caller has no account yet, so there is no token to
// present. One of the three unauthenticated routes in the contract.
router.post('/clinic/signup', postClinicSignup);

// Public for the same reason — this is the route that issues the token.
router.post('/login', postLogin);

// admin only — a static role check is the right tool here (unlike the queue
// routes): "who may invite" doesn't depend on any request-specific state.
router.post('/invite', auth, authorize(Role.ADMIN), postInvite);

// Deliberately NO auth middleware. The person calling this has no JWT yet —
// that's the entire point of an invite flow. The gate is knowing the invite
// token itself, carried in the body, not a Bearer header. Mounting `auth` here
// would make this endpoint uncallable by the exact people it exists for.
router.post('/accept-invite', postAcceptInvite);

// Any signed-in user — no role restriction, just a valid token.
router.get('/me', auth, getMe);

export default router;
