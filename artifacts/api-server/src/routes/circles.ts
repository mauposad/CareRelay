import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, circles, memberships, careRecords, auditEntries } from "@workspace/db";
import { authenticate, type AuthenticatedRequest } from "../lib/auth";
import { canRead, canWrite, deny, membershipFor, CARE_KINDS, familyVisibleKind } from "../lib/policy";
import { z } from "zod";

const router: IRouter = Router();
const input = z.object({ kind: z.enum(CARE_KINDS), title: z.string().min(1), details: z.string().optional(), dueAt: z.string().datetime().optional() });

router.get("/circles", authenticate, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).user.id;
  const rows = await db.select({ circle: circles, membership: memberships }).from(memberships).innerJoin(circles, eq(circles.id, memberships.circleId)).where(and(eq(memberships.userId, userId), eq(memberships.active, true)));
  res.json(rows.map(({ circle, membership }) => ({ id: circle.id, name: circle.name, recipientName: circle.recipientName, tier: circle.tier, role: membership.role })));
});

router.get("/circles/:circleId/records", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canRead(relation.membership.role)) { deny(res); return; }
  const rows = await db.select().from(careRecords).where(eq(careRecords.circleId, relation.circle.id));
  const family = relation.membership.role === "family";
  const visible = family ? rows.filter((row) => familyVisibleKind(row.kind)) : rows;
  res.json(visible.map(({ id, kind, title, details, dueAt, createdAt }) => ({ id, kind, title, details: family ? undefined : details, dueAt, createdAt })));
});

router.post("/circles/:circleId/records", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = Array.isArray(req.params.circleId) ? req.params.circleId[0] : req.params.circleId;
  const relation = await membershipFor(authReq, circleId);
  const parsed = input.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canWrite(relation.membership.role, relation.circle.tier)) { deny(res); return; }
  const [record] = await db.insert(careRecords).values({ circleId: relation.circle.id, createdBy: authReq.user.id, kind: parsed.data.kind, title: parsed.data.title, details: parsed.data.details, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined }).returning();
  await db.insert(auditEntries).values({ actorId: authReq.user.id, circleId: relation.circle.id, action: "record_create", target: record.id, outcome: "allowed" });
  res.status(201).json({ id: record.id, kind: record.kind, title: record.title, details: record.details, dueAt: record.dueAt, createdAt: record.createdAt });
});

export default router;