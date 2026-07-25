import { Router } from 'express';
import { postClinicSignup } from '../controllers/auth.controller.js';

const router = Router();

// Public, deliberately: the caller has no account yet, so there is no token to
// present. One of the three unauthenticated routes in the contract.
router.post('/clinic/signup', postClinicSignup);

export default router;
