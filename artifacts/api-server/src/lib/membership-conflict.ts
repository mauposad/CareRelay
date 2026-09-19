const activePrimaryRoleConstraint = "circle_active_primary_role_unique";

type DatabaseError = {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

function asDatabaseError(error: unknown): DatabaseError | null {
  return typeof error === "object" && error !== null ? error as DatabaseError : null;
}

export function isActivePrimaryRoleConflict(error: unknown): boolean {
  let current = asDatabaseError(error);
  while (current) {
    if (current.code === "23505" && current.constraint === activePrimaryRoleConstraint) return true;
    current = asDatabaseError(current.cause);
  }
  return false;
}

export const activePrimaryRoleConflictBody = {
  error: "An active member already holds this primary role",
} as const;