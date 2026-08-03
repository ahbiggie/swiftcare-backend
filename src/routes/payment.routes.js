import { Router } from "express";
import auth from "../middlewares/auth.js";
import authorize from "../middlewares/authorize.js";
import { Role } from "../constants/index.js";
import { postPayment, getPaymentHistory } from "../controllers/payment.controller.js";

const router = Router();

/**
 * @openapi
 * /payments:
 *   post:
 *     summary: Take payment on an invoice
 *     description: >
 *       Runs as one transaction with the invoice row locked before checking
 *       whether it's already paid. Reads the amount from the invoice - the
 *       request body carries no amount field. On success, advances the queue
 *       entry to Completed the same way the queue route itself would. The
 *       receipt is data, not a PDF.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/PaymentInput' }
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
 *                     payment:
 *                       type: object
 *                       properties:
 *                         id: { type: string, format: uuid }
 *                     receipt: { type: object }
 *                     queueStatus: { type: string, example: Completed }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404:
 *         description: Invoice not found / not in this clinic
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       409:
 *         description: Invoice already paid, or the patient isn't at Awaiting Payment
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post("/", auth, authorize(Role.CASHIER), postPayment);

/**
 * @openapi
 * /payments/history:
 *   get:
 *     summary: List payments taken in this clinic
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [cash, mobile_money, insurance] }
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
 *                     payments:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Payment' }
 *                     total: { type: integer }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/history", auth, authorize(Role.CASHIER, Role.ADMIN), getPaymentHistory);

export default router;
