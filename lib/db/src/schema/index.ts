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
}, (t) => [uniqueIndex("circle_member_unique").on(t.circleId, t.userId), index("membership_user_idx").on(t.userId)]);

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