import { eq } from "drizzle-orm";
import {
  db, users, circles, memberships, careRecords,
  careMessages, careEvents, careTasks, careRides, careRideEvents,
  usingEmbeddedDatabase,
} from "@workspace/db";
import { hashPassword } from "../lib/auth";

/**
 * The Wilson family demo circle.
 *
 * Seeded so every screen has believable history the moment you log in, while
 * the hero moment of the demo still happens live: Friday's physical therapy
 * ride has no driver yet, so the presenter assigns it and the driver accepts
 * on stage.
 *
 * Idempotent — if the circle already exists, nothing is written.
 */

export const DEMO_CIRCLE_NAME = "Wilson Care Circle";

/**
 * Used only when running against the embedded database, which is a local file
 * and never networked. Against a real DATABASE_URL, DEMO_PASSWORD is required
 * so a deployed environment can never get a known password by default.
 */
const EMBEDDED_DEFAULT_PASSWORD = "carerelay-demo";

export const DEMO_PEOPLE = [
  { key: "margaret", email: "margaret@carerelay.demo", displayName: "Margaret Wilson", role: "primary_user" as const, blurb: "Care recipient" },
  { key: "sarah", email: "sarah@carerelay.demo", displayName: "Sarah Wilson", role: "primary_caretaker" as const, blurb: "Primary caregiver (daughter)" },
  { key: "patel", email: "patel@carerelay.demo", displayName: "Dr. Maya Patel", role: "primary_physician" as const, blurb: "Primary care physician" },
  { key: "john", email: "john@carerelay.demo", displayName: "John Wilson", role: "family" as const, blurb: "Family support (son)" },
  { key: "alex", email: "alex@carerelay.demo", displayName: "Alex Wilson", role: "family" as const, blurb: "Family support (son)" },
  { key: "emily", email: "emily@carerelay.demo", displayName: "Emily Wilson", role: "family" as const, blurb: "Family (granddaughter)" },
];

/** Days from now to the next given weekday (0=Sun). Always in the future. */
function nextWeekday(weekday: number, hour: number, minute = 0): Date {
  const date = new Date();
  const delta = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function daysFromNow(days: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export type SeedResult = {
  seeded: boolean;
  reason?: string;
  circleId?: string;
  accounts?: { email: string; displayName: string; role: string }[];
  password?: string;
};

export async function seedDemoData(): Promise<SeedResult> {
  const password = process.env["DEMO_PASSWORD"]
    ?? (usingEmbeddedDatabase ? EMBEDDED_DEFAULT_PASSWORD : undefined);

  if (!password) {
    return {
      seeded: false,
      reason: "DEMO_PASSWORD is required when seeding against a real DATABASE_URL.",
    };
  }
  if (password.length < 10) {
    return { seeded: false, reason: "DEMO_PASSWORD must be at least 10 characters." };
  }

  const [existing] = await db.select().from(circles).where(eq(circles.name, DEMO_CIRCLE_NAME));
  if (existing) {
    return { seeded: false, reason: "Demo circle already exists", circleId: existing.id };
  }

  // --- people -------------------------------------------------------------
  const passwordHash = await hashPassword(password);
  const ids: Record<string, string> = {};

  for (const person of DEMO_PEOPLE) {
    const [created] = await db.insert(users)
      .values({ email: person.email, displayName: person.displayName, passwordHash })
      .onConflictDoNothing()
      .returning();
    if (created) {
      ids[person.key] = created.id;
    } else {
      const [found] = await db.select().from(users).where(eq(users.email, person.email));
      ids[person.key] = found!.id;
    }
  }

  // --- circle -------------------------------------------------------------
  // "fully_assisted": Sarah coordinates Margaret's care directly, which is the
  // arrangement the demo narrates. Tier can be changed in Settings to show the
  // transitional dual-approval path.
  const [circle] = await db.insert(circles).values({
    name: DEMO_CIRCLE_NAME,
    recipientName: "Margaret Wilson",
    tier: "fully_assisted",
  }).returning();

  for (const person of DEMO_PEOPLE) {
    await db.insert(memberships).values({
      circleId: circle.id, userId: ids[person.key]!, role: person.role,
    }).onConflictDoNothing();
  }

  // --- imported history ---------------------------------------------------
  const [dizzyMessage] = await db.insert(careMessages).values({
    circleId: circle.id,
    senderId: ids["sarah"]!,
    source: "whatsapp",
    body: "Margaret mentioned feeling dizzy after breakfast yesterday. I've been keeping an eye on it.",
    receivedAt: daysFromNow(-4, 9, 12),
  }).returning();

  await db.insert(careMessages).values({
    circleId: circle.id,
    senderId: ids["john"]!,
    source: "imessage",
    body: "Picked up Mom's refill on the way home. Also she wants to keep doing her stretches in the mornings.",
    receivedAt: daysFromNow(-6, 17, 40),
  });

  const pastPt = daysFromNow(-7, 10);
  const nextPt = nextWeekday(5, 10); // Friday 10:00

  const [dizzyEvent] = await db.insert(careEvents).values({
    circleId: circle.id,
    messageId: dizzyMessage.id,
    type: "symptom",
    summary: "Reported feeling dizzy after breakfast",
    evidence: "Margaret mentioned feeling dizzy after breakfast yesterday.",
    confidence: 88,
    status: "confirmed",
    sharedWithPhysician: true,
    extractionMode: "mock",
    scheduledAt: daysFromNow(-4, 9),
    createdBy: ids["sarah"]!,
    confirmedBy: ids["sarah"]!,
    confirmedAt: daysFromNow(-4, 9, 30),
  }).returning();

  const [medicationEvent] = await db.insert(careEvents).values({
    circleId: circle.id,
    type: "medication",
    summary: "Lisinopril 10 mg once daily",
    evidence: "Continue lisinopril 10 mg once daily.",
    confidence: 95,
    status: "confirmed",
    recurrence: "daily",
    extractionMode: "mock",
    ownerId: ids["margaret"]!,
    createdBy: ids["patel"]!,
    confirmedBy: ids["sarah"]!,
    confirmedAt: daysFromNow(-10, 11),
  }).returning();

  const [exerciseEvent] = await db.insert(careEvents).values({
    circleId: circle.id,
    type: "exercise",
    summary: "Morning stretching routine",
    evidence: "she wants to keep doing her stretches in the mornings",
    confidence: 86,
    status: "confirmed",
    recurrence: "daily",
    extractionMode: "mock",
    ownerId: ids["margaret"]!,
    createdBy: ids["sarah"]!,
    confirmedBy: ids["sarah"]!,
    confirmedAt: daysFromNow(-6, 18),
  }).returning();

  const [pastPtEvent] = await db.insert(careEvents).values({
    circleId: circle.id,
    type: "appointment",
    summary: "Physical therapy",
    evidence: "PT session confirmed for last week.",
    confidence: 96,
    status: "confirmed",
    scheduledAt: pastPt,
    extractionMode: "mock",
    createdBy: ids["sarah"]!,
    confirmedBy: ids["sarah"]!,
    confirmedAt: daysFromNow(-9, 12),
  }).returning();

  const [nextPtEvent] = await db.insert(careEvents).values({
    circleId: circle.id,
    type: "appointment",
    summary: "Physical therapy",
    evidence: "PT moved to Friday at 10.",
    confidence: 94,
    status: "confirmed",
    scheduledAt: nextPt,
    extractionMode: "mock",
    createdBy: ids["sarah"]!,
    confirmedBy: ids["sarah"]!,
    confirmedAt: daysFromNow(-1, 9),
  }).returning();

  // --- tasks --------------------------------------------------------------
  await db.insert(careTasks).values([
    {
      circleId: circle.id, eventId: medicationEvent.id, title: "Take lisinopril 10 mg",
      category: "medication", assignedTo: ids["margaret"]!, dueAt: daysFromNow(0, 9),
      status: "scheduled", recurrence: "daily", createdBy: ids["sarah"]!,
    },
    {
      circleId: circle.id, eventId: exerciseEvent.id, title: "Morning stretching routine",
      category: "exercise", assignedTo: ids["margaret"]!, dueAt: daysFromNow(0, 8),
      status: "scheduled", recurrence: "daily", createdBy: ids["sarah"]!,
    },
    {
      circleId: circle.id, title: "Pick up prescription refill",
      category: "other", assignedTo: ids["john"]!, dueAt: daysFromNow(-6, 17),
      status: "done", acceptedAt: daysFromNow(-6, 12), completedAt: daysFromNow(-6, 17, 30),
      createdBy: ids["sarah"]!,
    },
    {
      circleId: circle.id, eventId: nextPtEvent.id, title: "Physical therapy",
      category: "appointment", dueAt: nextPt, status: "scheduled", createdBy: ids["sarah"]!,
    },
  ]);

  // --- ride logistics -----------------------------------------------------
  // A completed ride (history), a ride that was handed off after a decline
  // (shows the handoff chain), and Friday's ride still needing a driver
  // (the live demo moment).
  const [completedRide] = await db.insert(careRides).values({
    circleId: circle.id, eventId: pastPtEvent.id,
    purpose: "Physical therapy",
    pickupAt: new Date(pastPt.getTime() - 30 * 60000),
    pickupLocation: "Margaret's home", dropoffLocation: "Riverside Physical Therapy",
    status: "completed", driverId: ids["john"]!, assignedBy: ids["sarah"]!,
    assignedAt: daysFromNow(-9, 12), acceptedAt: daysFromNow(-9, 13),
    createdBy: ids["sarah"]!,
  }).returning();

  await db.insert(careRideEvents).values([
    { rideId: completedRide.id, actorId: ids["sarah"]!, action: "created", detail: "Ride needed for physical therapy", createdAt: daysFromNow(-9, 12) },
    { rideId: completedRide.id, actorId: ids["sarah"]!, action: "offered", detail: "Asked John Wilson", createdAt: daysFromNow(-9, 12, 5) },
    { rideId: completedRide.id, actorId: ids["john"]!, action: "accepted", detail: "John Wilson accepted", createdAt: daysFromNow(-9, 13) },
    { rideId: completedRide.id, actorId: ids["john"]!, action: "completed", detail: "Drop-off confirmed", createdAt: daysFromNow(-7, 11) },
  ]);

  const pharmacyRide = (await db.insert(careRides).values({
    circleId: circle.id,
    purpose: "Pharmacy run",
    pickupAt: daysFromNow(2, 15),
    pickupLocation: "Margaret's home", dropoffLocation: "Glenwood Pharmacy",
    status: "accepted", driverId: ids["alex"]!, assignedBy: ids["sarah"]!,
    assignedAt: daysFromNow(-1, 10), acceptedAt: daysFromNow(-1, 14),
    notes: "Emily was asked first but is travelling this week.",
    createdBy: ids["sarah"]!,
  }).returning())[0];

  await db.insert(careRideEvents).values([
    { rideId: pharmacyRide.id, actorId: ids["sarah"]!, action: "created", detail: "Ride needed for pharmacy run", createdAt: daysFromNow(-1, 10) },
    { rideId: pharmacyRide.id, actorId: ids["sarah"]!, action: "offered", detail: "Asked Emily Wilson", createdAt: daysFromNow(-1, 10, 2) },
    { rideId: pharmacyRide.id, actorId: ids["emily"]!, action: "declined", detail: "Travelling this week", createdAt: daysFromNow(-1, 11) },
    { rideId: pharmacyRide.id, actorId: ids["sarah"]!, action: "offered", detail: "Handed off to Alex Wilson", createdAt: daysFromNow(-1, 13) },
    { rideId: pharmacyRide.id, actorId: ids["alex"]!, action: "accepted", detail: "Alex Wilson accepted", createdAt: daysFromNow(-1, 14) },
  ]);

  const [openRide] = await db.insert(careRides).values({
    circleId: circle.id, eventId: nextPtEvent.id,
    purpose: "Physical therapy",
    pickupAt: new Date(nextPt.getTime() - 30 * 60000),
    pickupLocation: "Margaret's home", dropoffLocation: "Riverside Physical Therapy",
    status: "needs_driver",
    createdBy: ids["sarah"]!,
  }).returning();

  await db.insert(careRideEvents).values({
    rideId: openRide.id, actorId: ids["sarah"]!, action: "created",
    detail: "Ride needed for Friday physical therapy",
  });

  // --- legacy care records (the records/approvals screen) ------------------
  await db.insert(careRecords).values([
    { circleId: circle.id, createdBy: ids["patel"]!, kind: "appointment", title: "Primary care follow-up", details: "Follow up 2-4 weeks after the October visit.", dueAt: daysFromNow(21, 10), sensitive: false },
    { circleId: circle.id, createdBy: ids["patel"]!, kind: "medicine", title: "Lisinopril 10 mg once daily", details: "No change at the last visit." },
    { circleId: circle.id, createdBy: ids["sarah"]!, kind: "current_status", title: "Steady week overall", details: "One dizziness episode reported; appetite unchanged.", sensitive: false },
  ]);

  void dizzyEvent;

  return {
    seeded: true,
    circleId: circle.id,
    password,
    accounts: DEMO_PEOPLE.map((p) => ({ email: p.email, displayName: p.displayName, role: p.role })),
  };
}
