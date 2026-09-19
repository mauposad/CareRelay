import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, sessions, users } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "carerelay_session";
const SESSION_DAYS = 14;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, saltText, hashText] = encoded.split("$");
  if (!saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ userId, tokenHash: digest(token), expiresAt });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function revokeSession(req: Request): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, digest(token)));
}

export type AuthenticatedRequest = Request & { user: typeof users.$inferSelect };

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [row] = await db.select({ session: sessions, user: users })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()), eq(users.disabled, false)));
  if (!row) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  (req as AuthenticatedRequest).user = row.user;
  next();
}
