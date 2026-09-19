import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, approvalRequests, careRecords, auditEntries, memberships, circles } from "@workspace/db";
import { authenticate, type AuthenticatedRequest } from "../lib/auth";
import { membershipFor, deny } from "../lib/policy";
import { z } from "zod";
import { activePrimaryRoleConflictBody, isActivePrimaryRoleConflict } from "../lib/membership-conflict";

const router: IRouter = Router();
const requestBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_record"),
    payload: z.object({
      kind: z.string().min(1),
      title: z.string().min(1),
      details: z.string().optional(),
      dueAt: z.string().datetime().optional(),
    }),
  }),
  z.object({
    action: z.literal("member_add"),
    payload: z.object({
      userId: z.string().uuid(),
      role: z.enum(["primary_caretaker", "family"]),
    }),
  }),
  z.object({
    action: z.literal("member_remove"),
    payload: z.object({ userId: z.string().uuid() }),
  }),
  z.object({
    action: z.literal("tier_change"),
    payload: z.object({
      tier: z.enum(["non_assisted", "transitional", "fully_assisted"]),
    }),
  }),
]);

router.get("/circles/:circleId/approvals", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || relation.membership.role === "family") { deny(res); return; }
  res.json(await db.select().from(approvalRequests).where(eq(approvalRequests.circleId, circleId)));
});

router.post("/circles/:circleId/approvals", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  const parsed = requestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || relation.circle.tier !== "transitional" || !["primary_user", "primary_caretaker"].includes(relation.membership.role)) { deny(res); return; }
  const [created] = await db.insert(approvalRequests).values({ circleId, requesterId: authReq.user.id, action: parsed.data.action, payload: parsed.data.payload, tierVersion: relation.circle.tierVersion }).returning();
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "approval_request", target: created.id, outcome: "pending" });
  res.status(201).json(created);
});

router.post("/circles/:circleId/approvals/:approvalId/approve", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const approvalId = Array.isArray(req.params.approvalId) ? req.params.approvalId[0] : req.params.approvalId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !["primary_user", "primary_caretaker"].includes(relation.membership.role)) { deny(res); return; }
  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [request] = await tx.select().from(approvalRequests).where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.circleId, circleId))).for("update");
      if (!request || request.status !== "pending" || request.tierVersion !== relation.circle.tierVersion) return null;
      const isPrimary = relation.membership.role === "primary_user";
      if ((isPrimary && request.primaryApprovedAt) || (!isPrimary && request.caretakerApprovedAt)) return null;
      const updated = await tx.update(approvalRequests).set(isPrimary ? { primaryApprovedAt: new Date() } : { caretakerApprovedAt: new Date() }).where(and(eq(approvalRequests.id, approvalId), isPrimary ? isNull(approvalRequests.primaryApprovedAt) : isNull(approvalRequests.caretakerApprovedAt))).returning();
      const next = updated[0];
      if (!next.primaryApprovedAt || !next.caretakerApprovedAt) return next;
      if (next.action === "create_record") {
        const payload = next.payload as { kind: string; title: string; details?: string; dueAt?: string };
        await tx.insert(careRecords).values({ circleId, createdBy: next.requesterId, kind: payload.kind, title: payload.title, details: payload.details, dueAt: payload.dueAt ? new Date(payload.dueAt) : undefined });
      }
      if (next.action === "member_add") {
        const payload = next.payload as { userId: string; role: "family" | "primary_caretaker" };
        await tx.insert(memberships).values({ circleId, userId: payload.userId, role: payload.role }).onConflictDoUpdate({ target: [memberships.circleId, memberships.userId], set: { role: payload.role, active: true } });
      }
      if (next.action === "member_remove") {
        const payload = next.payload as { userId: string };
        await tx.update(memberships).set({ active: false }).where(and(eq(memberships.circleId, circleId), eq(memberships.userId, payload.userId), eq(memberships.active, true), eq(memberships.role, "family")));
      }
      if (next.action === "tier_change") {
        const payload = next.payload as { tier: "non_assisted" | "transitional" | "fully_assisted" };
        await tx.update(circles).set({ tier: payload.tier, tierVersion: relation.circle.tierVersion + 1 }).where(and(eq(circles.id, circleId), eq(circles.tierVersion, relation.circle.tierVersion)));
      }
      const [applied] = await tx.update(approvalRequests).set({ status: "applied", appliedAt: new Date() }).where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.status, "pending"))).returning();
      if (applied) await tx.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "approval_applied", target: approvalId, outcome: "allowed" });
      return applied ?? next;
    });
  } catch (error) {
    if (isActivePrimaryRoleConflict(error)) {
      res.status(409).json(activePrimaryRoleConflictBody);
      return;
    }
    throw error;
  }
  if (!result) { res.status(409).json({ error: "Approval is stale, unauthorized, or already resolved" }); return; }
  res.json(result);
});

router.post("/circles/:circleId/approvals/:approvalId/reject", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const approvalId = Array.isArray(req.params.approvalId) ? req.params.approvalId[0] : req.params.approvalId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !["primary_user", "primary_caretaker"].includes(relation.membership.role)) { deny(res); return; }
  const [rejected] = await db.update(approvalRequests).set({ status: "rejected" }).where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.circleId, circleId), eq(approvalRequests.status, "pending"))).returning();
  if (!rejected) { res.status(409).json({ error: "Approval is already resolved" }); return; }
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId, action: "approval_rejected", target: approvalId, outcome: "rejected" });
  res.json(rejected);
});

export default router;