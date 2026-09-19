import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  approvalRequests,
  auditEntries,
  careRecords,
  circles,
  db,
  memberships,
  pool,
  sessions,
  users,
} from "@workspace/db";
import app from "./app";

type Role = "primary_user" | "primary_caretaker" | "primary_physician" | "family";
type Tier = "non_assisted" | "transitional" | "fully_assisted";
type FixtureUser = { id: string; token: string };

const roles: Role[] = ["primary_user", "primary_caretaker", "primary_physician", "family"];
const prefix = `authz-${process.pid}-${Date.now()}`;
const fixtureUsers = new Map<string, FixtureUser>();
const circleIds: string[] = [];
let server: Server;
let origin: string;
let circleA: string;
let circleB: string;
let replacementCaretaker: FixtureUser;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function request(
  path: string,
  options: { token?: string; method?: string; body?: unknown } = {},
) {
  const headers = new Headers();
  if (options.token) headers.set("cookie", `carerelay_session=${options.token}`);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return fetch(`${origin}/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function actor(circle: "a" | "b", role: Role) {
  const user = fixtureUsers.get(`${circle}-${role}`);
  if (!user) throw new Error(`Missing fixture actor ${circle}-${role}`);
  return user;
}

async function setTier(tier: Tier) {
  const [current] = await db.select().from(circles).where(eq(circles.id, circleA));
  await db.update(circles)
    .set({ tier, tierVersion: current.tierVersion + 1 })
    .where(eq(circles.id, circleA));
}

async function createUser(key: string) {
  const [user] = await db.insert(users).values({
    email: `${prefix}-${key}@example.test`,
    displayName: key,
    passwordHash: "not-used-by-integration-fixtures",
  }).returning();
  const token = `${prefix}-${key}-session-token`;
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  fixtureUsers.set(key, { id: user.id, token });
  return user;
}

async function createApproval(action: "create_record" | "tier_change" = "create_record") {
  await setTier("transitional");
  const response = await request(`/circles/${circleA}/approvals`, {
    token: actor("a", "primary_user").token,
    method: "POST",
    body: action === "create_record"
      ? { action, payload: { kind: "status", title: `approval-${Date.now()}`, details: "private approval payload" } }
      : { action, payload: { tier: "fully_assisted" } },
  });
  expect(response.status).toBe(201);
  return json(response);
}

beforeAll(async () => {
  const listener = app.listen(0, "127.0.0.1");
  server = listener;
  await new Promise<void>((resolve, reject) => {
    listener.once("listening", resolve);
    listener.once("error", reject);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  origin = `http://127.0.0.1:${address.port}`;

  const [a, b] = await db.insert(circles).values([
    { name: `${prefix}-circle-a`, recipientName: "Recipient A", tier: "non_assisted" },
    { name: `${prefix}-circle-b`, recipientName: "Recipient B", tier: "fully_assisted" },
  ]).returning();
  circleA = a.id;
  circleB = b.id;
  circleIds.push(circleA, circleB);

  for (const circle of ["a", "b"] as const) {
    for (const role of roles) {
      const user = await createUser(`${circle}-${role}`);
      await db.insert(memberships).values({
        circleId: circle === "a" ? circleA : circleB,
        userId: user.id,
        role,
      });
    }
  }

  const creator = actor("a", "primary_physician");
  await db.insert(careRecords).values([
    {
      circleId: circleA,
      createdBy: creator.id,
      kind: "appointment",
      title: "Visible family update",
      details: "private appointment notes",
    },
    {
      circleId: circleA,
      createdBy: creator.id,
      kind: "medicine",
      title: "Hidden family medicine",
      details: "private medicine details",
    },
  ]);
}, 30_000);

afterAll(async () => {
  const ids = [...fixtureUsers.values()].map((user) => user.id);
  if (circleIds.length) {
    await db.delete(auditEntries).where(inArray(auditEntries.circleId, circleIds));
    await db.delete(approvalRequests).where(inArray(approvalRequests.circleId, circleIds));
    await db.delete(careRecords).where(inArray(careRecords.circleId, circleIds));
    await db.delete(memberships).where(inArray(memberships.circleId, circleIds));
  }
  if (ids.length) await db.delete(sessions).where(inArray(sessions.userId, ids));
  if (ids.length) await db.delete(users).where(inArray(users.id, ids));
  if (circleIds.length) await db.delete(circles).where(inArray(circles.id, circleIds));
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

describe.sequential("database-backed HTTP authorization boundary", () => {
  it("distinguishes missing authentication from forbidden cross-circle access on every protected route", async () => {
    const validRecord = { kind: "status", title: "Boundary check" };
    const protectedRequests = [
      ["GET", "/circles", undefined],
      ["GET", `/circles/${circleB}/records`, undefined],
      ["POST", `/circles/${circleB}/records`, validRecord],
      ["GET", `/circles/${circleB}/members`, undefined],
      ["POST", `/circles/${circleB}/members`, { userId: actor("a", "family").id, role: "family" }],
      ["DELETE", `/circles/${circleB}/members/${actor("b", "family").id}`, undefined],
      ["PATCH", `/circles/${circleB}/caretaker`, { userId: actor("a", "family").id }],
      ["PATCH", `/circles/${circleB}/tier`, { tier: "non_assisted" }],
      ["GET", `/circles/${circleB}/approvals`, undefined],
      ["POST", `/circles/${circleB}/approvals`, { action: "create_record", payload: validRecord }],
      ["POST", `/circles/${circleB}/approvals/00000000-0000-4000-8000-000000000000/approve`, undefined],
      ["POST", `/circles/${circleB}/approvals/00000000-0000-4000-8000-000000000000/reject`, undefined],
      ["GET", `/circles/${circleB}/audit`, undefined],
    ] as const;

    for (const [method, path, body] of protectedRequests) {
      expect((await request(path, { method, body })).status, `${method} ${path} without session`).toBe(401);
    }

    for (const [method, path, body] of protectedRequests.slice(1)) {
      expect(
        (await request(path, { token: actor("a", "primary_physician").token, method, body })).status,
        `${method} ${path} with a different circle's session`,
      ).toBe(403);
    }
  });

  it("enforces all four roles across all three assistance tiers", async () => {
    const expected: Record<Tier, Record<Role, number>> = {
      non_assisted: { primary_user: 201, primary_caretaker: 403, primary_physician: 201, family: 403 },
      transitional: { primary_user: 403, primary_caretaker: 403, primary_physician: 201, family: 403 },
      fully_assisted: { primary_user: 403, primary_caretaker: 201, primary_physician: 201, family: 403 },
    };

    for (const tier of Object.keys(expected) as Tier[]) {
      await setTier(tier);
      for (const role of roles) {
        const response = await request(`/circles/${circleA}/records`, {
          token: actor("a", role).token,
          method: "POST",
          body: { kind: "status", title: `${tier}-${role}` },
        });
        expect(response.status, `${role} writing in ${tier}`).toBe(expected[tier][role]);
      }
    }
  });

  it("omits private fields and hidden record kinds from family responses", async () => {
    const response = await request(`/circles/${circleA}/records`, { token: actor("a", "family").token });
    expect(response.status).toBe(200);
    const records = await response.json() as Array<Record<string, unknown>>;
    expect(records.some((record) => record.title === "Hidden family medicine")).toBe(false);
    const visible = records.find((record) => record.title === "Visible family update");
    expect(visible).toBeDefined();
    expect(visible).not.toHaveProperty("details");
    expect(JSON.stringify(records)).not.toContain("private appointment notes");
    expect(JSON.stringify(records)).not.toContain("private medicine details");
  });

  it("protects physician membership and atomically replaces the caretaker", async () => {
    await setTier("non_assisted");
    const removePhysician = await request(`/circles/${circleA}/members/${actor("a", "primary_physician").id}`, {
      token: actor("a", "primary_user").token,
      method: "DELETE",
    });
    expect(removePhysician.status).toBe(403);

    const replacement = await createUser("replacement-caretaker");
    replacementCaretaker = fixtureUsers.get("replacement-caretaker")!;
    const replace = await request(`/circles/${circleA}/caretaker`, {
      token: actor("a", "primary_physician").token,
      method: "PATCH",
      body: { userId: replacement.id },
    });
    expect(replace.status).toBe(204);

    const activeCaretakers = await db.select().from(memberships).where(and(
      eq(memberships.circleId, circleA),
      eq(memberships.role, "primary_caretaker"),
      eq(memberships.active, true),
    ));
    expect(activeCaretakers.map((membership) => membership.userId)).toEqual([replacement.id]);
  });

  it("rejects expired and revoked real sessions", async () => {
    const expiredUser = await createUser("expired-session");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, expiredUser.id));
    expect((await request("/circles", { token: fixtureUsers.get("expired-session")!.token })).status).toBe(401);

    const active = actor("a", "family");
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, active.id));
    expect((await request("/circles", { token: active.token })).status).toBe(401);
  });

  it("serializes duplicate approvals and applies an approval exactly once", async () => {
    const approval = await createApproval();
    const approvalId = approval.id as string;
    const primaryToken = actor("a", "primary_user").token;
    const duplicateResults = await Promise.all([
      request(`/circles/${circleA}/approvals/${approvalId}/approve`, { token: primaryToken, method: "POST" }),
      request(`/circles/${circleA}/approvals/${approvalId}/approve`, { token: primaryToken, method: "POST" }),
    ]);
    expect(duplicateResults.map((response) => response.status).sort()).toEqual([200, 409]);

    const applied = await request(`/circles/${circleA}/approvals/${approvalId}/approve`, {
      token: replacementCaretaker.token,
      method: "POST",
    });
    expect(applied.status).toBe(200);
    expect((await json(applied)).status).toBe("applied");
    expect((await request(`/circles/${circleA}/approvals/${approvalId}/approve`, {
      token: replacementCaretaker.token,
      method: "POST",
    })).status).toBe(409);

    const approvalTitle = (approval.payload as Record<string, unknown>).title;
    expect(typeof approvalTitle).toBe("string");
    const [recordCount] = await db.select({ id: careRecords.id }).from(careRecords).where(and(
      eq(careRecords.circleId, circleA),
      eq(careRecords.title, approvalTitle as string),
    ));
    expect(recordCount).toBeDefined();
  });

  it("rejects stale, rejected, replayed, and cross-circle approval identifiers", async () => {
    const stale = await createApproval("tier_change");
    await setTier("fully_assisted");
    expect((await request(`/circles/${circleA}/approvals/${stale.id as string}/approve`, {
      token: actor("a", "primary_user").token,
      method: "POST",
    })).status).toBe(409);

    const rejected = await createApproval();
    expect((await request(`/circles/${circleA}/approvals/${rejected.id as string}/reject`, {
      token: replacementCaretaker.token,
      method: "POST",
    })).status).toBe(200);
    expect((await request(`/circles/${circleA}/approvals/${rejected.id as string}/reject`, {
      token: actor("a", "primary_user").token,
      method: "POST",
    })).status).toBe(409);
    expect((await request(`/circles/${circleA}/approvals/${rejected.id as string}/approve`, {
      token: actor("a", "primary_user").token,
      method: "POST",
    })).status).toBe(409);

    expect((await request(`/circles/${circleB}/approvals/${rejected.id as string}/approve`, {
      token: actor("b", "primary_user").token,
      method: "POST",
    })).status).toBe(409);
  });

  it("keeps audit entries append-only and free of sensitive request payloads", async () => {
    const before = await db.select().from(auditEntries).where(eq(auditEntries.circleId, circleA));
    const approval = await createApproval();
    await request(`/circles/${circleA}/approvals/${approval.id as string}/reject`, {
      token: replacementCaretaker.token,
      method: "POST",
    });
    const after = await db.select().from(auditEntries).where(eq(auditEntries.circleId, circleA));

    expect(after.length).toBeGreaterThan(before.length);
    expect(before.every((entry) => after.some((candidate) => candidate.id === entry.id))).toBe(true);
    expect(after.some((entry) => entry.action === "approval_request" && entry.outcome === "pending")).toBe(true);
    expect(after.some((entry) => entry.action === "approval_rejected" && entry.outcome === "rejected")).toBe(true);
    for (const entry of after) {
      expect(Object.keys(entry).sort()).toEqual(["action", "actorId", "circleId", "createdAt", "id", "outcome", "target"].sort());
    }
    expect(JSON.stringify(after)).not.toContain("private approval payload");

    const response = await request(`/circles/${circleA}/audit`, { token: actor("a", "primary_user").token });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("private approval payload");
  });
});