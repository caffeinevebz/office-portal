import "server-only";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  defaultAllowed,
  SUPERADMIN_ROLE,
  type Permission,
} from "./roles";

/** Effective permission list for a role: DB overrides layered on defaults. */
export async function effectivePermissions(role: string): Promise<Permission[]> {
  if (role === SUPERADMIN_ROLE) return [...ALL_PERMISSIONS];
  const overrides = await prisma.rolePermission.findMany({ where: { role } });
  const map = new Map(overrides.map((o) => [o.permission, o.allowed]));
  return ALL_PERMISSIONS.filter((p) =>
    map.has(p) ? (map.get(p) as boolean) : defaultAllowed(role, p),
  );
}

/** Whether a role currently holds a single permission. */
export async function roleHasPermission(
  role: string,
  permission: Permission,
): Promise<boolean> {
  if (role === SUPERADMIN_ROLE) return true;
  const row = await prisma.rolePermission.findFirst({ where: { role, permission } });
  return row ? row.allowed : defaultAllowed(role, permission);
}
