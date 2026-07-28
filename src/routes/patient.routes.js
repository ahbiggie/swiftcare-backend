import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getPatientById } from '../controllers/patient.controller.js';

const router = Router();

const notImplemented = (label) => (_req, res) =>
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: label },
  });

router.get('/', auth, notImplemented('GET /patients'));

router.get('/:id', auth, getPatientById);

router.post(
  '/',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  notImplemented('POST /patients')
);

router.put(
  '/:id',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  notImplemented('PUT /patients/:id')
);

export default router;
