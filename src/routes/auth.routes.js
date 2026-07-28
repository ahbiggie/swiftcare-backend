import { Router } from 'express';
import auth from '../middlewares/auth.js';
import authorize from '../middlewares/authorize.js';
import { Role } from '../constants/index.js';
import {
  postClinicSignup,
  postLogin,
  postInvite,
  postAcceptInvite,
  getMe,
} from '../controllers/auth.controller.js';

const router = Router();

/**
 * @openapi
 * /auth/clinic/signup:
 *   post:
 *     summary: Create a clinic and its admin account
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clinicName, address, email, password]
 *             properties:
 *               clinicName: { type: string }
 *               address: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/AuthResponse' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409:
 *         description: Email already registered
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// Public, deliberately: the caller has no account yet, so there is no token to
// present. One of the three unauthenticated routes in the contract.
router.post('/clinic/signup', postClinicSignup);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Sign in
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/AuthResponse' }
 *       401:
 *         description: Invalid email or password
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 *       403:
 *         description: Invite not accepted yet
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// Public for the same reason — this is the route that issues the token.
router.post('/login', postLogin);

/**
 * @openapi
 * /auth/invite:
 *   post:
 *     summary: Invite a staff member into the caller's clinic
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [receptionist, nurse, doctor, cashier] }
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
 *                   allOf:
 *                     - $ref: '#/components/schemas/StaffListItem'
 *                     - type: object
 *                       properties:
 *                         inviteLink: { type: string }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409:
 *         description: Email already registered
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// admin only — a static role check is the right tool here (unlike the queue
// routes): "who may invite" doesn't depend on any request-specific state.
router.post('/invite', auth, authorize(Role.ADMIN), postInvite);

/**
 * @openapi
 * /auth/accept-invite:
 *   post:
 *     summary: Accept an invite and set a password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [inviteToken, password]
 *             properties:
 *               inviteToken: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/AuthResponse' }
 *       404:
 *         description: Invite link invalid or already used
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
// Deliberately NO auth middleware. The person calling this has no JWT yet —
// that's the entire point of an invite flow. The gate is knowing the invite
// token itself, carried in the body, not a Bearer header. Mounting `auth` here
// would make this endpoint uncallable by the exact people it exists for.
router.post('/accept-invite', postAcceptInvite);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the signed-in user
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
 *                 data: { $ref: '#/components/schemas/AuthUser' }
 *       401: { $ref: '#/components/responses/Unauthenticated' }
 */
// Any signed-in user — no role restriction, just a valid token.
router.get('/me', auth, getMe);

export default router;
