import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { postAppointment } from '../controllers/appointment.controller.js';

const router = Router();

router.post('/', auth, authorize(Role.RECEPTIONIST, Role.ADMIN), postAppointment);

export default router;
