import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import circlesRouter from "./circles";
import approvalsRouter from "./approvals";
import membersRouter from "./members";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(circlesRouter);
router.use(approvalsRouter);
router.use(membersRouter);
router.use(auditRouter);

export default router;
