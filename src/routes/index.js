import { Router } from 'express';
import patientRoutes from './patient.routes.js';
import authRoutes from './auth.routes.js';
import queueRoutes from './queue.routes.js';
import appointmentRoutes from './appointment.routes.js';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getUsers, getDoctors } from '../controllers/auth.controller.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

router.use('/patients', patientRoutes);
router.use('/queue', queueRoutes);
router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);

// Contract lists these under "Auth & Accounts" (section 1), but their actual
// paths have no /auth prefix — top-level, wired here rather than inside
// auth.routes.js (which is mounted at /auth).
router.get('/users', auth, authorize(Role.ADMIN), getUsers);
router.get('/staff/doctors', auth, authorize(Role.RECEPTIONIST, Role.NURSE, Role.ADMIN), getDoctors);

// Lane owners: register yours here.
//   Lane 3 (Emmanuel Alliu)  — router.use('/vitals', vitalsRoutes); router.use('/consultations', consultationRoutes);
//   Lane 4 (Emmanuel Dosumu) — router.use('/invoices', invoiceRoutes); router.use('/payments', paymentRoutes);
// Don't forget the .js extension on the import.

export default router;
