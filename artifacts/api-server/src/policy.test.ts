import { describe, expect, it } from "vitest";
import { canRead, canWrite, familyVisibleKind, canManageMembership, requiresDualApproval } from "./lib/policy";

describe("circle authorization matrix", () => {
  it.each([
    ["primary_user", "non_assisted", true],
    ["primary_user", "transitional", false],
    ["primary_user", "fully_assisted", false],
    ["primary_caretaker", "non_assisted", false],
    ["primary_caretaker", "transitional", false],
    ["primary_caretaker", "fully_assisted", true],
    ["primary_physician", "non_assisted", true],
    ["primary_physician", "transitional", true],
    ["family", "fully_assisted", false],
  ])("%s at %s has expected write permission", (role, tier, allowed) => {
    expect(canWrite(role, tier)).toBe(allowed);
  });

  it("keeps family visibility limited to high-level updates and appointments", () => {
    for (const kind of ["document", "medicine", "diet", "exercise", "test", "surgery"]) expect(familyVisibleKind(kind)).toBe(false);
    for (const kind of ["appointment", "status", "recovery", "rehab", "current_status"]) expect(familyVisibleKind(kind)).toBe(true);
  });

  it("allows only circle members to enter read policy", () => {
    expect(canRead("primary_user")).toBe(true);
    expect(canRead("primary_caretaker")).toBe(true);
    expect(canRead("primary_physician")).toBe(true);
    expect(canRead("family")).toBe(true);
    expect(canRead("unknown")).toBe(false);
  });

  it("enforces membership authority by tier and assignment", () => {
    expect(canManageMembership("primary_user", "non_assisted")).toBe(true);
    expect(canManageMembership("primary_user", "fully_assisted")).toBe(false);
    expect(canManageMembership("primary_caretaker", "fully_assisted", true)).toBe(true);
    expect(canManageMembership("primary_caretaker", "fully_assisted", false)).toBe(false);
    expect(canManageMembership("primary_physician", "transitional")).toBe(true);
    expect(canManageMembership("family", "non_assisted")).toBe(false);
  });

  it("routes all transitional primary/caretaker mutations to dual approval", () => {
    expect(requiresDualApproval("primary_user", "transitional")).toBe(true);
    expect(requiresDualApproval("primary_caretaker", "transitional")).toBe(true);
    expect(requiresDualApproval("primary_physician", "transitional")).toBe(false);
    expect(requiresDualApproval("primary_user", "non_assisted")).toBe(false);
  });
});