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

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: ok }
 */
router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

router.use('/patients', patientRoutes);
router.use('/queue', queueRoutes);
router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);

// Contract lists these under "Auth & Accounts" (section 1), but their actual
// paths have no /auth prefix — top-level, wired here rather than inside
// auth.routes.js (which is mounted at /auth).

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List staff in the caller's clinic
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, receptionist, nurse, doctor, cashier] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [invited, active] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/StaffListItem' }
 *                     total: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/users', auth, authorize(Role.ADMIN), getUsers);

/**
 * @openapi
 * /staff/doctors:
 *   get:
 *     summary: List active doctors in the caller's clinic
 *     description: For populating assignedDoctorId at check-in / appointment booking.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     doctors:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Doctor' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/staff/doctors', auth, authorize(Role.RECEPTIONIST, Role.NURSE, Role.ADMIN), getDoctors);

// Lane owners: register yours here.
//   Lane 3 (Emmanuel Alliu)  — router.use('/vitals', vitalsRoutes); router.use('/consultations', consultationRoutes);
//   Lane 4 (Emmanuel Dosumu) — router.use('/invoices', invoiceRoutes); router.use('/payments', paymentRoutes);
// Don't forget the .js extension on the import.

export default router;
