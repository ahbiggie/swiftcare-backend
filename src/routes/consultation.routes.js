import { Router } from "express";
import auth from "../middlewares/auth.js";
import authorize from "../middlewares/authorize.js";
import { Role } from "../constants/index.js";
import {
  postConsultation,
  postCompleteConsultation,
  getConsultations,
} from "../controllers/consultation.controller.js";

const router = Router();

/**
 * @openapi
 * /consultations:
 *   post:
 *     summary: Open a consultation for a visit
 *     tags: [Consultations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ConsultationInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Consultation' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Queue entry not found / not in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       409:
 *         description: Queue entry isn't In Consultation yet
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post("/", auth, authorize(Role.DOCTOR), postConsultation);

/**
 * @openapi
 * /consultations/{id}/complete:
 *   post:
 *     summary: Complete a consultation
 *     description: >
 *       Runs as one transaction. Writes notes + diagnosis, writes each
 *       prescription, creates the invoice (flat fee), and advances the queue
 *       entry to Awaiting Payment. If any step fails, nothing is saved.
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompleteConsultationInput' }
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
 *                     consultation:
 *                       type: object
 *                       properties:
 *                         id: { type: string, format: uuid }
 *                         status: { type: string, example: completed }
 *                     invoice:
 *                       type: object
 *                       properties:
 *                         id: { type: string, format: uuid }
 *                         status: { type: string, example: Pending }
 *                     queueStatus: { type: string, example: Awaiting Payment }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Consultation not found / not this doctor's / not in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       409:
 *         description: Already completed, or the queue entry isn't where this move expects
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post("/:id/complete", auth, authorize(Role.DOCTOR), postCompleteConsultation);

/**
 * @openapi
 * /consultations/{patientId}:
 *   get:
 *     summary: List a patient's consultations
 *     tags: [Consultations]
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
 *                     consultations:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Consultation' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  "/:patientId",
  auth,
  authorize(Role.DOCTOR, Role.NURSE, Role.ADMIN),
  getConsultations,
);

export default router;
