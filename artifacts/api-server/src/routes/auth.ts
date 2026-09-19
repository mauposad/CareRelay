import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, memberships, users, circles } from "@workspace/db";
import { z } from "zod";
import { authenticate, createSession, hashPassword, revokeSession, type AuthenticatedRequest, verifyPassword } from "../lib/auth";

const router: IRouter = Router();
const authInput = z.object({ email: z.string().email(), password: z.string().min(10), displayName: z.string().min(1).optional() });

async function sessionPayload(userId: string) {
  const rows = await db.select({ user: users, membership: memberships, circle: circles })
    .from(users)
    .leftJoin(
      memberships,
      and(eq(memberships.userId, users.id), eq(memberships.active, true)),
    )
    .leftJoin(circles, eq(circles.id, memberships.circleId))
    .where(eq(users.id, userId));
  const user = rows[0]?.user;
  if (!user) throw new Error("User disappeared");
  return {
    id: user.id, email: user.email, displayName: user.displayName,
    circles: rows.flatMap((r) => r.circle && r.membership ? [{ id: r.circle.id, name: r.circle.name, recipientName: r.circle.recipientName, tier: r.circle.tier, role: r.membership.role }] : []),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = authInput.safeParse(req.body);
  if (!parsed.success || !parsed.data.displayName) { res.status(400).json({ error: "Valid email, password, and displayName are required" }); return; }
  const email = parsed.data.email.toLowerCase();
  const displayName = parsed.data.displayName;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) { res.status(409).json({ error: "Account already exists" }); return; }
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.transaction(async (tx) => {
    const [createdUser] = await tx.insert(users).values({
      email,
      displayName,
      passwordHash,
    }).returning();
    const [circle] = await tx.insert(circles).values({
      name: `${displayName}'s Care Circle`,
      recipientName: displayName,
    }).returning();
    await tx.insert(memberships).values({
      circleId: circle.id,
      userId: createdUser.id,
      role: "primary_user",
    });
    return createdUser;
  });
  await createSession(user.id, res);
  res.status(201).json(await sessionPayload(user.id));
});

router.post("/auth/sign-in", async (req, res): Promise<void> => {
  const parsed = authInput.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid credentials" }); return; }
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase()));
  if (!user || user.disabled || !(await verifyPassword(parsed.data.password, user.passwordHash))) { res.status(401).json({ error: "Invalid credentials" }); return; }
  await createSession(user.id, res);
  res.json(await sessionPayload(user.id));
});

router.post("/auth/sign-out", async (req, res): Promise<void> => { await revokeSession(req); res.clearCookie("carerelay_session", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); res.sendStatus(204); });
router.get("/auth/session", authenticate, async (req, res): Promise<void> => { res.json(await sessionPayload((req as AuthenticatedRequest).user.id)); });
export default router;
