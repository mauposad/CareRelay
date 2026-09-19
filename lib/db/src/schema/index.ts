import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabled: boolean("disabled").notNull().default(false),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const circles = pgTable("care_circles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  recipientName: text("recipient_name").notNull(),
  tier: text("tier", { enum: ["non_assisted", "transitional", "fully_assisted"] }).notNull().default("non_assisted"),
  tierVersion: integer("tier_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable("circle_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["primary_user", "primary_caretaker", "primary_physician", "family"] }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("circle_member_unique").on(t.circleId, t.userId),
  uniqueIndex("circle_active_primary_role_unique")
    .on(t.circleId, t.role)
    .where(sql`${t.active} = true and ${t.role} in ('primary_user', 'primary_caretaker', 'primary_physician')`),
  index("membership_user_idx").on(t.userId),
]);

export const careRecords = pgTable("care_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  details: text("details"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  sensitive: boolean("sensitive").notNull().default(true),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("records_circle_idx").on(t.circleId)]);

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  requesterId: uuid("requester_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetId: uuid("target_id"),
  payload: jsonb("payload").notNull(),
  tierVersion: integer("tier_version").notNull(),
  status: text("status", { enum: ["pending", "applied", "rejected", "expired"] }).notNull().default("pending"),
  primaryApprovedAt: timestamp("primary_approved_at", { withTimezone: true }),
  caretakerApprovedAt: timestamp("caretaker_approved_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("approvals_circle_idx").on(t.circleId)]);

export const auditEntries = pgTable("audit_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id),
  circleId: uuid("circle_id").references(() => circles.id),
  action: text("action").notNull(),
  target: text("target"),
  outcome: text("outcome").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_circle_idx").on(t.circleId, t.createdAt)]);

/* ------------------------------------------------------------------ *
 * Care coordination: ingested messages, extracted events, the tasks
 * they create, and the ride logistics that carry them out.
 * ------------------------------------------------------------------ */

export const careMessages = pgTable("care_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id),
  source: text("source", { enum: ["whatsapp", "imessage", "sms", "email", "internal", "voice", "document"] }).notNull(),
  body: text("body").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_circle_idx").on(t.circleId, t.receivedAt)]);

export const careEvents = pgTable("care_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => careMessages.id, { onDelete: "set null" }),
  type: text("type", { enum: ["task", "appointment", "note", "medication", "exercise", "check_in", "symptom"] }).notNull(),
  summary: text("summary").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status", { enum: ["proposed", "confirmed", "rejected"] }).notNull().default("proposed"),
  // Stored 0-100 so the column stays integral; the API exposes 0-1.
  confidence: integer("confidence").notNull().default(60),
  evidence: text("evidence").notNull().default(""),
  unresolvedTime: boolean("unresolved_time").notNull().default(false),
  recurrence: text("recurrence"),
  sharedWithPhysician: boolean("shared_with_physician").notNull().default(false),
  extractionMode: text("extraction_mode", { enum: ["ai", "mock", "manual"] }).notNull().default("manual"),
  createdBy: uuid("created_by").references(() => users.id),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_circle_idx").on(t.circleId, t.status)]);

export const careTasks = pgTable("care_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => careEvents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category", { enum: ["medication", "exercise", "appointment", "check_in", "nutrition", "transport", "other"] }).notNull().default("other"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status", { enum: ["scheduled", "accepted", "done", "declined", "cancelled"] }).notNull().default("scheduled"),
  recurrence: text("recurrence"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tasks_circle_idx").on(t.circleId, t.status), index("tasks_assignee_idx").on(t.assignedTo)]);

/**
 * Ride logistics. An appointment that someone must be driven to becomes a
 * ride that needs a driver; a driver is offered it, accepts or declines, and
 * a decline sends it back to needing a driver so it can be handed off.
 */
export const careRides = pgTable("care_rides", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").notNull().references(() => circles.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => careEvents.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  pickupAt: timestamp("pickup_at", { withTimezone: true }),
  pickupLocation: text("pickup_location"),
  dropoffLocation: text("dropoff_location"),
  status: text("status", { enum: ["needs_driver", "offered", "accepted", "declined", "completed", "cancelled"] }).notNull().default("needs_driver"),
  driverId: uuid("driver_id").references(() => users.id),
  assignedBy: uuid("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  declinedAt: timestamp("declined_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("rides_circle_idx").on(t.circleId, t.status), index("rides_driver_idx").on(t.driverId)]);

/** Per-ride handoff history, so "who was asked, who said no" is visible. */
export const careRideEvents = pgTable("care_ride_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  rideId: uuid("ride_id").notNull().references(() => careRides.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ride_events_ride_idx").on(t.rideId, t.createdAt)]);

export type CareMessage = typeof careMessages.$inferSelect;
export type CareEventRow = typeof careEvents.$inferSelect;
export type CareTask = typeof careTasks.$inferSelect;
export type CareRide = typeof careRides.$inferSelect;
export type CareRideEvent = typeof careRideEvents.$inferSelect;

export const insertUserSchema = createInsertSchema(users);
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Circle = typeof circles.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type CareRecord = typeof careRecords.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type AuditEntry = typeof auditEntries.$inferSelect;
export const tierSchema = z.enum(["non_assisted", "transitional", "fully_assisted"]);
export const roleSchema = z.enum(["primary_user", "primary_caretaker", "primary_physician", "family"]);