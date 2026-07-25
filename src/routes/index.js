import { Router } from 'express';
import patientRoutes from './patient.routes.js';
import authRoutes from './auth.routes.js';
import queueRoutes from './queue.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

router.use('/patients', patientRoutes);
router.use('/queue', queueRoutes);
router.use('/auth', authRoutes);

// Lane owners: register yours here.
//   Lane 2 (Victor)          — router.use('/appointments', appointmentRoutes);
//   Lane 3 (Emmanuel Alliu)  — router.use('/vitals', vitalsRoutes); router.use('/consultations', consultationRoutes);
//   Lane 4 (Emmanuel Dosumu) — router.use('/invoices', invoiceRoutes); router.use('/payments', paymentRoutes);
// Don't forget the .js extension on the import.

export default router;
