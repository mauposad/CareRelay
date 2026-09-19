import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, memberships, users, circles, auditEntries } from "@workspace/db";
import { authenticate, type AuthenticatedRequest } from "../lib/auth";
import { deny, membershipFor, canManageMembership, requiresDualApproval } from "../lib/policy";
import { approvalRequests } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();
const memberInput = z.object({ userId: z.string().uuid(), role: z.enum(["primary_user", "primary_caretaker", "primary_physician", "family"]) });

router.get("/circles/:circleId/members", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || relation.membership.role === "family") { deny(res); return; }
  const rows = await db.select({ id: memberships.id, userId: users.id, displayName: users.displayName, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.circleId, circleId), eq(memberships.active, true)));
  res.json(rows);
});

router.post("/circles/:circleId/members", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  const parsed = memberInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const assigned = relation?.membership.role === "primary_caretaker";
  if (!relation || !canManageMembership(relation.membership.role, relation.circle.tier, assigned) || (parsed.data.role === "primary_physician")) {
    if (relation && requiresDualApproval(relation.membership.role, relation.circle.tier)) {
      const [pending] = await db.insert(approvalRequests).values({ circleId, requesterId: authReq.user.id, action: "member_add", payload: parsed.data, tierVersion: relation.circle.tierVersion }).returning();
      res.status(202).json(pending); return;
    }
    deny(res); return;
  }
  const [created] = await db.insert(memberships).values({ circleId, userId: parsed.data.userId, role: parsed.data.role }).onConflictDoUpdate({ target: [memberships.circleId, memberships.userId], set: { role: parsed.data.role, active: true } }).returning();
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "member_add", target: created.id, outcome: "allowed" });
  res.status(201).json(created);
});

router.delete("/circles/:circleId/members/:userId", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation) { deny(res); return; }
  const [target] = await db.select().from(memberships).where(and(eq(memberships.circleId, circleId), eq(memberships.userId, userId), eq(memberships.active, true)));
  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (!canManageMembership(relation.membership.role, relation.circle.tier, relation.membership.role === "primary_caretaker")) {
    if (requiresDualApproval(relation.membership.role, relation.circle.tier)) {
      const [pending] = await db.insert(approvalRequests).values({ circleId, requesterId: authReq.user.id, action: "member_remove", targetId: target.id, payload: { userId }, tierVersion: relation.circle.tierVersion }).returning();
      res.status(202).json(pending); return;
    }
    deny(res); return;
  }
  if (!target || target.role === "primary_physician") { res.status(403).json({ error: "Physician membership is protected" }); return; }
  await db.update(memberships).set({ active: false }).where(eq(memberships.id, target.id));
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "member_remove", target: target.id, outcome: "allowed" });
  res.sendStatus(204);
});

router.patch("/circles/:circleId/caretaker", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || relation.membership.role !== "primary_physician") { deny(res); return; }
  await db.transaction(async (tx) => {
    await tx.update(memberships).set({ active: false }).where(and(eq(memberships.circleId, circleId), eq(memberships.role, "primary_caretaker")));
    await tx.insert(memberships).values({ circleId, userId: parsed.data.userId, role: "primary_caretaker" }).onConflictDoUpdate({ target: [memberships.circleId, memberships.userId], set: { role: "primary_caretaker", active: true } });
    await tx.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "caretaker_replace", target: parsed.data.userId, outcome: "allowed" });
  });
  res.sendStatus(204);
});

router.patch("/circles/:circleId/tier", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({ tier: z.enum(["non_assisted", "transitional", "fully_assisted"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || relation.membership.role === "family") { deny(res); return; }
  if (requiresDualApproval(relation.membership.role, relation.circle.tier)) {
    const [pending] = await db.insert(approvalRequests).values({ circleId, requesterId: authReq.user.id, action: "tier_change", payload: parsed.data, tierVersion: relation.circle.tierVersion }).returning();
    res.status(202).json(pending); return;
  }
  if (!canManageMembership(relation.membership.role, relation.circle.tier, relation.membership.role === "primary_caretaker")) { deny(res); return; }
  const [updated] = await db.update(circles).set({ tier: parsed.data.tier, tierVersion: relation.circle.tierVersion + 1 }).where(and(eq(circles.id, circleId), eq(circles.tierVersion, relation.circle.tierVersion))).returning();
  if (!updated) { res.status(409).json({ error: "Tier changed; retry" }); return; }
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "tier_change", target: circleId, outcome: "allowed" });
  res.json({ tier: updated.tier, tierVersion: updated.tierVersion });
});

export default router;