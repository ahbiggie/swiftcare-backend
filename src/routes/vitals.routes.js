import { Router } from "express";
import auth from "../middlewares/auth.js";
import authorize from "../middlewares/authorize.js";
import { Role } from "../constants/index.js";
import { postVitals, getVitals } from "../controllers/vitals.controller.js";

const router = Router();

router.post("/", auth, authorize(Role.NURSE, Role.DOCTOR), postVitals);
router.get(
  "/:patientId",
  auth,
  authorize(Role.NURSE, Role.DOCTOR, Role.ADMIN),
  getVitals,
);

export default router;
