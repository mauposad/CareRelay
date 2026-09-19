import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db, users, careMessages, careEvents, careTasks, careRides, careRideEvents, auditEntries,
} from "@workspace/db";
import { authenticate, type AuthenticatedRequest } from "../lib/auth";
import {
  canCoordinate, canRead, canSeeEvent, canSeeRides, canActOnRide, deny, membershipFor,
} from "../lib/policy";
import { extractFromText } from "../lib/careExtraction";
import { z } from "zod";

const router: IRouter = Router();

const param = (value: unknown): string => (Array.isArray(value) ? value[0] : value) as string;

const EVENT_TYPES = ["task", "appointment", "note", "medication", "exercise", "check_in", "symptom"] as const;

const eventInput = z.object({
  type: z.enum(EVENT_TYPES),
  summary: z.string().min(1),
  ownerId: z.string().uuid().nullable().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.string().optional(),
  unresolvedTime: z.boolean().optional(),
  recurrence: z.string().nullable().optional(),
});

const ingestInput = z.object({
  text: z.string().min(1).max(20000),
  source: z.enum(["whatsapp", "imessage", "sms", "email", "internal", "voice", "document"]),
});

const confirmInput = z.object({
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  sharedWithPhysician: z.boolean().optional(),
  needsRide: z.boolean().optional(),
});

const rideInput = z.object({
  purpose: z.string().min(1),
  eventId: z.string().uuid().nullable().optional(),
  pickupAt: z.string().datetime({ offset: true }).nullable().optional(),
  pickupLocation: z.string().nullable().optional(),
  dropoffLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Confidence is 0-1 on the wire, 0-100 in the column. */
const toStoredConfidence = (value?: number) => Math.round((value ?? 0.6) * 100);
const toWireConfidence = (value: number) => value / 100;

function serializeEvent(row: typeof careEvents.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    summary: row.summary,
    ownerId: row.ownerId,
    scheduledAt: row.scheduledAt,
    status: row.status,
    confidence: toWireConfidence(row.confidence),
    evidence: row.evidence,
    unresolvedTime: row.unresolvedTime,
    recurrence: row.recurrence,
    sharedWithPhysician: row.sharedWithPhysician,
    extractionMode: row.extractionMode,
    messageId: row.messageId,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
  };
}

async function audit(actorId: string, circleId: string, action: string, target: string, outcome = "allowed") {
  await db.insert(auditEntries).values({ actorId, circleId, action, target, outcome });
}

/* ------------------------------ events ------------------------------ */

router.get("/circles/:circleId/events", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canRead(relation.membership.role)) { deny(res); return; }

  const rows = await db.select().from(careEvents)
    .where(eq(careEvents.circleId, circleId))
    .orderBy(desc(careEvents.createdAt));

  const visible = rows.filter((row) => canSeeEvent(relation.membership.role, authReq.user.id, row));
  res.json(visible.map(serializeEvent));
});

/**
 * Ingest a family update: store the message, run extraction, and record the
 * results as proposed events. Nothing becomes real until a person confirms it.
 */
router.post("/circles/:circleId/messages", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = ingestInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [message] = await db.insert(careMessages).values({
    circleId, senderId: authReq.user.id, source: parsed.data.source, body: parsed.data.text,
  }).returning();

  const extraction = await extractFromText(parsed.data.text, parsed.data.source);

  const inserted = extraction.events.length > 0
    ? await db.insert(careEvents).values(extraction.events.map((event) => ({
        circleId,
        messageId: message.id,
        type: event.type,
        summary: event.summary,
        // The extractor returns persona keys; only real member ids are stored.
        ownerId: null,
        scheduledAt: event.datetime ? new Date(event.datetime) : null,
        status: "proposed" as const,
        confidence: toStoredConfidence(event.confidence),
        evidence: event.evidence,
        unresolvedTime: event.unresolvedTime,
        recurrence: event.recurrence,
        extractionMode: extraction.mode,
        createdBy: authReq.user.id,
      }))).returning()
    : [];

  await audit(authReq.user.id, circleId, "message_ingested", message.id);

  res.status(201).json({
    message: { id: message.id, source: message.source, body: message.body, receivedAt: message.receivedAt },
    mode: extraction.mode,
    fallbackReason: extraction.fallbackReason,
    unresolved: extraction.unresolved,
    events: inserted.map(serializeEvent),
    suggestedOwners: extraction.events.map((event) => event.ownerId ?? null),
  });
});

/** Create proposed events directly — used by document carry-forward. */
router.post("/circles/:circleId/events", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({
    events: z.array(eventInput).min(1),
    sourceLabel: z.string().optional(),
    extractionMode: z.enum(["ai", "mock", "manual"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [message] = await db.insert(careMessages).values({
    circleId, senderId: authReq.user.id, source: "document",
    body: parsed.data.sourceLabel ? `Care document reviewed: ${parsed.data.sourceLabel}` : "Care document reviewed",
  }).returning();

  const inserted = await db.insert(careEvents).values(parsed.data.events.map((event) => ({
    circleId,
    messageId: message.id,
    type: event.type,
    summary: event.summary,
    ownerId: event.ownerId ?? null,
    scheduledAt: event.scheduledAt ? new Date(event.scheduledAt) : null,
    status: "proposed" as const,
    confidence: toStoredConfidence(event.confidence),
    evidence: event.evidence ?? "",
    unresolvedTime: event.unresolvedTime ?? false,
    recurrence: event.recurrence ?? null,
    extractionMode: parsed.data.extractionMode ?? "manual",
    createdBy: authReq.user.id,
  }))).returning();

  await audit(authReq.user.id, circleId, "document_events_added", message.id);
  res.status(201).json({ events: inserted.map(serializeEvent) });
});

/**
 * Confirm a proposed event. This is the human gate: it resolves the time and
 * owner, creates the follow-on task, and optionally opens a ride request.
 */
router.post("/circles/:circleId/events/:eventId/confirm", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const eventId = param(req.params.eventId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = confirmInput.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [event] = await db.select().from(careEvents)
    .where(and(eq(careEvents.id, eventId), eq(careEvents.circleId, circleId)));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  if (event.status === "confirmed") { res.status(409).json({ error: "Event is already confirmed" }); return; }

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : event.scheduledAt;
  if (event.unresolvedTime && !scheduledAt) {
    res.status(400).json({ error: "This event needs a date and time before it can be confirmed." });
    return;
  }

  const [confirmed] = await db.update(careEvents).set({
    status: "confirmed",
    scheduledAt,
    unresolvedTime: false,
    ownerId: parsed.data.ownerId === undefined ? event.ownerId : parsed.data.ownerId,
    sharedWithPhysician: parsed.data.sharedWithPhysician ?? event.sharedWithPhysician,
    confirmedBy: authReq.user.id,
    confirmedAt: new Date(),
  }).where(eq(careEvents.id, eventId)).returning();

  // Confirmation is what turns an event into work someone has to do.
  let task: typeof careTasks.$inferSelect | undefined;
  if (["task", "appointment", "medication", "exercise", "check_in"].includes(confirmed.type)) {
    const category = confirmed.type === "appointment" ? "appointment"
      : confirmed.type === "medication" ? "medication"
      : confirmed.type === "exercise" ? "exercise"
      : confirmed.type === "check_in" ? "check_in"
      : "other";
    [task] = await db.insert(careTasks).values({
      circleId, eventId: confirmed.id, title: confirmed.summary,
      category, assignedTo: confirmed.ownerId, dueAt: confirmed.scheduledAt,
      recurrence: confirmed.recurrence, createdBy: authReq.user.id,
    }).returning();
  }

  let ride: typeof careRides.$inferSelect | undefined;
  if (parsed.data.needsRide) {
    [ride] = await db.insert(careRides).values({
      circleId, eventId: confirmed.id, purpose: confirmed.summary,
      pickupAt: confirmed.scheduledAt ? new Date(confirmed.scheduledAt.getTime() - 30 * 60000) : null,
      pickupLocation: "Margaret's home",
      status: "needs_driver", createdBy: authReq.user.id,
    }).returning();
    await db.insert(careRideEvents).values({
      rideId: ride.id, actorId: authReq.user.id, action: "created",
      detail: `Ride needed for ${confirmed.summary}`,
    });
  }

  await audit(authReq.user.id, circleId, "event_confirmed", confirmed.id);
  res.json({ event: serializeEvent(confirmed), task, ride });
});

router.post("/circles/:circleId/events/:eventId/reject", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const eventId = param(req.params.eventId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [rejected] = await db.update(careEvents).set({ status: "rejected" })
    .where(and(eq(careEvents.id, eventId), eq(careEvents.circleId, circleId))).returning();
  if (!rejected) { res.status(404).json({ error: "Event not found" }); return; }

  await audit(authReq.user.id, circleId, "event_rejected", rejected.id);
  res.json(serializeEvent(rejected));
});

/** Sharing a reported observation with the physician is always explicit. */
router.post("/circles/:circleId/events/:eventId/share", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const eventId = param(req.params.eventId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({ shared: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [updated] = await db.update(careEvents).set({ sharedWithPhysician: parsed.data.shared })
    .where(and(eq(careEvents.id, eventId), eq(careEvents.circleId, circleId))).returning();
  if (!updated) { res.status(404).json({ error: "Event not found" }); return; }

  await audit(authReq.user.id, circleId, parsed.data.shared ? "observation_shared" : "observation_unshared", updated.id);
  res.json(serializeEvent(updated));
});

router.get("/circles/:circleId/messages", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canRead(relation.membership.role)) { deny(res); return; }
  // Raw source text is context for the people coordinating care, not for
  // family helpers or the physician.
  if (!canCoordinate(relation.membership.role, relation.circle.tier)) { res.json([]); return; }

  const rows = await db.select({ message: careMessages, senderName: users.displayName })
    .from(careMessages).leftJoin(users, eq(users.id, careMessages.senderId))
    .where(eq(careMessages.circleId, circleId))
    .orderBy(desc(careMessages.receivedAt));

  res.json(rows.map(({ message, senderName }) => ({
    id: message.id, source: message.source, body: message.body,
    receivedAt: message.receivedAt, senderId: message.senderId, senderName,
  })));
});

/* ------------------------------ tasks ------------------------------- */

router.get("/circles/:circleId/tasks", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canRead(relation.membership.role)) { deny(res); return; }
  if (relation.membership.role === "primary_physician") { res.json([]); return; }

  const rows = await db.select({
    task: careTasks,
    assigneeName: users.displayName,
  }).from(careTasks)
    .leftJoin(users, eq(users.id, careTasks.assignedTo))
    .where(eq(careTasks.circleId, circleId))
    .orderBy(asc(careTasks.dueAt));

  // Family members see only the work assigned to them.
  const visible = relation.membership.role === "family"
    ? rows.filter((row) => row.task.assignedTo === authReq.user.id)
    : rows;

  res.json(visible.map(({ task, assigneeName }) => ({ ...task, assigneeName })));
});

router.patch("/circles/:circleId/tasks/:taskId", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const taskId = param(req.params.taskId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({
    status: z.enum(["scheduled", "accepted", "done", "declined", "cancelled"]).optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation) { deny(res); return; }

  const [task] = await db.select().from(careTasks)
    .where(and(eq(careTasks.id, taskId), eq(careTasks.circleId, circleId)));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  // You may update your own task; coordinators may update any task.
  const isAssignee = task.assignedTo === authReq.user.id;
  const isCoordinator = canCoordinate(relation.membership.role, relation.circle.tier);
  if (!isAssignee && !isCoordinator) { deny(res); return; }

  // Handing work to someone else is a coordinator action, not a self-service one.
  const reassigning = parsed.data.assignedTo !== undefined;
  if (reassigning && !isCoordinator) { deny(res); return; }

  const status = parsed.data.status ?? task.status;
  const now = new Date();
  const [updated] = await db.update(careTasks).set({
    status,
    assignedTo: reassigning ? parsed.data.assignedTo ?? null : task.assignedTo,
    // A reassigned task is no longer accepted by the previous owner.
    acceptedAt: reassigning ? null : status === "accepted" ? now : task.acceptedAt,
    completedAt: status === "done" ? now : task.completedAt,
  }).where(eq(careTasks.id, taskId)).returning();

  await audit(authReq.user.id, circleId, reassigning ? "task_reassigned" : `task_${status}`, taskId);
  res.json(updated);
});

/* ------------------------------ rides ------------------------------- */

async function rideWithHistory(rideId: string) {
  const [row] = await db.select({ ride: careRides, driverName: users.displayName })
    .from(careRides).leftJoin(users, eq(users.id, careRides.driverId))
    .where(eq(careRides.id, rideId));
  if (!row) return undefined;

  const history = await db.select({ entry: careRideEvents, actorName: users.displayName })
    .from(careRideEvents).leftJoin(users, eq(users.id, careRideEvents.actorId))
    .where(eq(careRideEvents.rideId, rideId))
    .orderBy(asc(careRideEvents.createdAt));

  return {
    ...row.ride,
    driverName: row.driverName,
    history: history.map(({ entry, actorName }) => ({ ...entry, actorName })),
  };
}

router.get("/circles/:circleId/rides", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation || !canRead(relation.membership.role)) { deny(res); return; }
  if (!canSeeRides(relation.membership.role)) { res.json([]); return; }

  const rows = await db.select({ id: careRides.id }).from(careRides)
    .where(eq(careRides.circleId, circleId))
    .orderBy(asc(careRides.pickupAt));

  const rides = await Promise.all(rows.map((row) => rideWithHistory(row.id)));
  res.json(rides.filter(Boolean));
});

router.post("/circles/:circleId/rides", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = rideInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [ride] = await db.insert(careRides).values({
    circleId,
    eventId: parsed.data.eventId ?? null,
    purpose: parsed.data.purpose,
    pickupAt: parsed.data.pickupAt ? new Date(parsed.data.pickupAt) : null,
    pickupLocation: parsed.data.pickupLocation ?? null,
    dropoffLocation: parsed.data.dropoffLocation ?? null,
    notes: parsed.data.notes ?? null,
    status: "needs_driver",
    createdBy: authReq.user.id,
  }).returning();

  await db.insert(careRideEvents).values({
    rideId: ride.id, actorId: authReq.user.id, action: "created",
    detail: `Ride needed for ${ride.purpose}`,
  });
  await audit(authReq.user.id, circleId, "ride_created", ride.id);
  res.status(201).json(await rideWithHistory(ride.id));
});

/** Offer the ride to a family member. Re-offering after a decline is a handoff. */
router.post("/circles/:circleId/rides/:rideId/assign", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const rideId = param(req.params.rideId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({ driverId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation || !canCoordinate(relation.membership.role, relation.circle.tier)) { deny(res); return; }

  const [ride] = await db.select().from(careRides)
    .where(and(eq(careRides.id, rideId), eq(careRides.circleId, circleId)));
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }

  const [driver] = await db.select().from(users).where(eq(users.id, parsed.data.driverId));
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }

  await db.update(careRides).set({
    driverId: driver.id, assignedBy: authReq.user.id, assignedAt: new Date(),
    status: "offered", declinedAt: null, declineReason: null, acceptedAt: null,
    updatedAt: new Date(),
  }).where(eq(careRides.id, rideId));

  await db.insert(careRideEvents).values({
    rideId, actorId: authReq.user.id, action: "offered",
    detail: ride.declinedAt ? `Handed off to ${driver.displayName}` : `Asked ${driver.displayName}`,
  });
  await audit(authReq.user.id, circleId, "ride_offered", rideId);
  res.json(await rideWithHistory(rideId));
});

router.post("/circles/:circleId/rides/:rideId/respond", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const rideId = param(req.params.rideId);
  const relation = await membershipFor(authReq, circleId);
  const parsed = z.object({
    accept: z.boolean(),
    reason: z.string().max(280).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (!relation) { deny(res); return; }

  const [ride] = await db.select().from(careRides)
    .where(and(eq(careRides.id, rideId), eq(careRides.circleId, circleId)));
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }

  // Only the person actually offered the ride can answer for it.
  if (ride.driverId !== authReq.user.id) { deny(res); return; }

  const now = new Date();
  if (parsed.data.accept) {
    await db.update(careRides).set({ status: "accepted", acceptedAt: now, updatedAt: now })
      .where(eq(careRides.id, rideId));
    await db.insert(careRideEvents).values({
      rideId, actorId: authReq.user.id, action: "accepted",
      detail: `${authReq.user.displayName} accepted`,
    });
  } else {
    // A decline releases the ride so a coordinator can hand it off.
    await db.update(careRides).set({
      status: "needs_driver", driverId: null, declinedAt: now,
      declineReason: parsed.data.reason ?? null, acceptedAt: null, updatedAt: now,
    }).where(eq(careRides.id, rideId));
    await db.insert(careRideEvents).values({
      rideId, actorId: authReq.user.id, action: "declined",
      detail: parsed.data.reason ? `${authReq.user.displayName}: ${parsed.data.reason}` : `${authReq.user.displayName} declined`,
    });
  }

  await audit(authReq.user.id, circleId, parsed.data.accept ? "ride_accepted" : "ride_declined", rideId);
  res.json(await rideWithHistory(rideId));
});

router.post("/circles/:circleId/rides/:rideId/complete", authenticate, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const circleId = param(req.params.circleId);
  const rideId = param(req.params.rideId);
  const relation = await membershipFor(authReq, circleId);
  if (!relation) { deny(res); return; }

  const [ride] = await db.select().from(careRides)
    .where(and(eq(careRides.id, rideId), eq(careRides.circleId, circleId)));
  if (!ride) { res.status(404).json({ error: "Ride not found" }); return; }
  if (!canActOnRide(relation.membership.role, relation.circle.tier, ride.driverId, authReq.user.id)) {
    deny(res); return;
  }

  await db.update(careRides).set({ status: "completed", updatedAt: new Date() })
    .where(eq(careRides.id, rideId));
  await db.insert(careRideEvents).values({
    rideId, actorId: authReq.user.id, action: "completed", detail: "Drop-off confirmed",
  });
  await audit(authReq.user.id, circleId, "ride_completed", rideId);
  res.json(await rideWithHistory(rideId));
});

export default router;
