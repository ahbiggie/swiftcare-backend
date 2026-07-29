import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { postAppointment } from '../controllers/appointment.controller.js';

const router = Router();

/**
 * @openapi
 * /appointments:
 *   post:
 *     summary: Book a future appointment
 *     tags: [Appointments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AppointmentInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Patient not found, or doctorId isn't a real active doctor in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post('/', auth, authorize(Role.RECEPTIONIST, Role.ADMIN), postAppointment);

export default router;
