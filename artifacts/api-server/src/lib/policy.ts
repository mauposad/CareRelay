import { and, eq } from "drizzle-orm";
import { db, circles, memberships } from "@workspace/db";
import type { Response } from "express";
import type { AuthenticatedRequest } from "./auth";

export async function membershipFor(req: AuthenticatedRequest, circleId: string) {
  const [row] = await db.select({ membership: memberships, circle: circles })
    .from(memberships).innerJoin(circles, eq(circles.id, memberships.circleId))
    .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, req.user.id), eq(memberships.active, true)));
  return row;
}

export function deny(res: Response, status = 403): boolean {
  res.status(status).json({ error: status === 401 ? "Authentication required" : "Permission denied" });
  return false;
}

export function canRead(role: string): boolean {
  return ["primary_user", "primary_caretaker", "primary_physician", "family"].includes(role);
}

export function canWrite(role: string, tier: string): boolean {
  if (role === "primary_physician") return true;
  if (role === "primary_user") return tier === "non_assisted";
  if (role === "primary_caretaker") return tier === "fully_assisted";
  return false;
}

export function canManageMembership(role: string, tier: string, assignedCaretaker = false): boolean {
  if (role === "primary_physician") return true;
  if (tier === "non_assisted" && role === "primary_user") return true;
  if (tier === "fully_assisted" && role === "primary_caretaker" && assignedCaretaker) return true;
  return false;
}

export function requiresDualApproval(role: string, tier: string): boolean {
  return tier === "transitional" && (role === "primary_user" || role === "primary_caretaker");
}

export const CARE_KINDS = ["document", "appointment", "medicine", "diet", "exercise", "test", "surgery", "status", "recovery", "rehab", "current_status"] as const;

export function familyVisibleKind(kind: string): boolean {
  return ["appointment", "status", "recovery", "rehab", "current_status"].includes(kind);
}
