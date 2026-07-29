import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getQueue, postStatus, postCheckIn } from '../controllers/queue.controller.js';

const router = Router();

/**
 * @openapi
 * /queue:
 *   get:
 *     summary: List the live queue for the caller's clinic
 *     tags: [Queue]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Checked-In, Triage Ready, Awaiting Doctor, In Consultation, Awaiting Payment, Completed, Cancelled]
 *       - in: query
 *         name: assignedDoctorId
 *         schema: { type: string, format: uuid }
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
 *                     queue:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/QueueEntry' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 */
// All staff (contract, section 4).
router.get('/', auth, getQueue);

/**
 * @openapi
 * /queue/check-in:
 *   post:
 *     summary: Check a patient in, starting a new visit
 *     tags: [Queue]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CheckInInput' }
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
 *                     queueId: { type: string, format: uuid }
 *                     status: { type: string, example: Checked-In }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Patient, doctor, or appointment not found / not in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       409:
 *         description: Patient already has an active visit
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// Fixed role list is fine here, unlike postStatus below: check-in doesn't
// depend on any row's current state.
router.post('/check-in', auth, authorize(Role.RECEPTIONIST, Role.ADMIN), postCheckIn);

/**
 * @openapi
 * /queue/{queueId}/status:
 *   post:
 *     summary: Move a visit to its next queue status
 *     description: The only way a queue entry's status changes. See the queue rulebook in docs/API_CONTRACT.md for who may make which move.
 *     tags: [Queue]
 *     parameters:
 *       - in: path
 *         name: queueId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/QueueStatusInput' }
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
 *                     queueId: { type: string, format: uuid }
 *                     status: { type: string }
 *                     lastUpdatedBy: { type: string, format: uuid, nullable: true }
 *       400:
 *         description: Note is required when moving to Cancelled
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403:
 *         description: This move is reserved for a different role
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Move is not in the rulebook (illegal transition)
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// Deliberately NO authorize() here — do not "fix" this by copying patient.routes.js.
// A static role list can't express "nurse owns this move, but only from Checked-In":
// it never sees the row's current status. assertCanTransition (called by the
// service) is the gate for this route — per-transition role ownership, admin
// override included. A static list would either name all five roles (does
// nothing) or block legitimate transitions.
router.post('/:queueId/status', auth, postStatus);

export default router;
