import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import { getPatients, getPatientById, postPatient, putPatient } from '../controllers/patient.controller.js';

const router = Router();

/**
 * @openapi
 * /patients:
 *   get:
 *     summary: Search / list patients in the caller's clinic
 *     tags: [Patients]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches first/last name (partial) OR phone (exact, normalized).
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
 *                     patients:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Patient' }
 *                     total: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 */
router.get('/', auth, getPatients);

/**
 * @openapi
 * /patients/{id}:
 *   get:
 *     summary: Get one patient
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
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
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', auth, getPatientById);

/**
 * @openapi
 * /patients:
 *   post:
 *     summary: Register a new patient
 *     description: >
 *       Checks for existing patients on the same normalized phone in this clinic first.
 *       If any are found and confirmNewPatient isn't set, returns 409 with the candidates
 *       instead of creating a duplicate.
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientInput' }
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
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409:
 *         description: Possible duplicate patient — resend with confirmNewPatient true to proceed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/DuplicatePatientError' }
 */
router.post(
  '/',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  postPatient
);

/**
 * @openapi
 * /patients/{id}:
 *   put:
 *     summary: Edit a patient's demographics
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PatientUpdateInput' }
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
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.put(
  '/:id',
  auth,
  authorize(Role.RECEPTIONIST, Role.ADMIN),
  putPatient
);

export default router;
