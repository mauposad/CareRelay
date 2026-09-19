import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, auditEntries } from "@workspace/db";
import { authenticate, type AuthenticatedRequest } from "../lib/auth";
import { deny, membershipFor } from "../lib/policy";

const router: IRouter = Router();
router.get("/circles/:circleId/audit", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !["primary_user", "primary_physician"].includes(relation.membership.role)) { deny(res); return; }
  res.json(await db.select().from(auditEntries).where(eq(auditEntries.circleId, circleId)).orderBy(desc(auditEntries.createdAt)).limit(500));
});
export default router;