import { Router } from "express";
import auth from "../middlewares/auth.js";
import authorize from "../middlewares/authorize.js";
import { Role } from "../constants/index.js";
import { postVitals, getVitals } from "../controllers/vitals.controller.js";

const router = Router();

/**
 * @openapi
 * /vitals:
 *   post:
 *     summary: Record vitals for a patient's visit
 *     tags: [Vitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VitalsInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Vitals' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Queue entry not found / not in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post("/", auth, authorize(Role.NURSE), postVitals);

/**
 * @openapi
 * /vitals/{patientId}:
 *   get:
 *     summary: List recorded vitals for a patient
 *     tags: [Vitals]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: queueEntryId
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
 *                     vitals:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Vitals' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  "/:patientId",
  auth,
  authorize(Role.NURSE, Role.DOCTOR, Role.ADMIN),
  getVitals,
);

export default router;
