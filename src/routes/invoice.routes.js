import { Router } from "express";
import auth from "../middlewares/auth.js";
import authorize from "../middlewares/authorize.js";
import { Role } from "../constants/index.js";
import { getInvoices } from "../controllers/invoice.controller.js";

const router = Router();

/**
 * @openapi
 * /invoices/{patientId}:
 *   get:
 *     summary: List a patient's invoices
 *     description: >
 *       Optionally narrowed to the single invoice tied to one visit via
 *       queueEntryId.
 *     tags: [Invoices]
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
 *                     invoices:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Invoice' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  "/:patientId",
  auth,
  authorize(Role.CASHIER, Role.DOCTOR, Role.ADMIN),
  getInvoices,
);

export default router;
