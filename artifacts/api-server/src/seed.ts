import { db, users, circles, memberships, careRecords, closeDatabase } from "@workspace/db";
import { hashPassword } from "./lib/auth";

/**
 * Development-only seed. Run with SEED_DEMO=true and DEMO_PASSWORD (>=10 chars).
 * The password is never committed; accounts are only created when explicitly requested.
 */
if (process.env.SEED_DEMO !== "true") throw new Error("Refusing to seed unless SEED_DEMO=true");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) throw new Error("Set DEMO_PASSWORD to a 10+ character development password");

const people = [
  ["primary@example.test", "Primary User", "primary_user"],
  ["caretaker@example.test", "Primary Caretaker", "primary_caretaker"],
  ["physician@example.test", "Primary Physician", "primary_physician"],
  ["family@example.test", "Family Member", "family"],
] as const;
const created = [];
for (const [email, displayName] of people) {
  const [user] = await db.insert(users).values({ email, displayName, passwordHash: await hashPassword(password) }).onConflictDoNothing().returning();
  if (user) created.push(user);
}
const existing = await db.select().from(users);
const circle = (await db.insert(circles).values({ name: "Wilson Care Circle", recipientName: "Margaret Wilson" }).onConflictDoNothing().returning())[0];
if (circle) {
  for (const person of existing) {
    const role = people.find((p) => p[0] === person.email)?.[2];
    if (role) await db.insert(memberships).values({ circleId: circle.id, userId: person.id, role }).onConflictDoNothing();
  }
  await db.insert(careRecords).values({ circleId: circle.id, createdBy: existing[0].id, kind: "appointment", title: "Primary care follow-up", details: "Bring current status update.", sensitive: false });
}
await closeDatabase();