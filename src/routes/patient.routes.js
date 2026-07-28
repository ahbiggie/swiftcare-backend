import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getPatients, getPatientById, postPatient, putPatient } from '../controllers/patient.controller.js';

const router = Router();

router.get('/', auth, getPatients);

router.get('/:id', auth, getPatientById);

router.post(
  '/',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  postPatient
);

router.put(
  '/:id',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  putPatient
);

export default router;
