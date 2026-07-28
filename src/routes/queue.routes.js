import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getQueue, postStatus, postCheckIn } from '../controllers/queue.controller.js';

const router = Router();

// All staff (contract, section 4).
router.get('/', auth, getQueue);

// Fixed role list is fine here, unlike postStatus below: check-in doesn't
// depend on any row's current state.
router.post('/check-in', auth, authorize(Role.RECEPTIONIST, Role.ADMIN), postCheckIn);

// Deliberately NO authorize() here — do not "fix" this by copying patient.routes.js.
// A static role list can't express "nurse owns this move, but only from Checked-In":
// it never sees the row's current status. assertCanTransition (called by the
// service) is the gate for this route — per-transition role ownership, admin
// override included. A static list would either name all five roles (does
// nothing) or block legitimate transitions.
router.post('/:queueId/status', auth, postStatus);

export default router;
