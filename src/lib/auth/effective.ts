import "server-only";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import {
  ALL_PERMISSIONS,
  defaultAllowed,
  SUPERADMIN_ROLE,
  type Permission,
} from "./roles";

/**
 * Effective permission list for a role: DB overrides layered on defaults.
 * Cached briefly — permission checks run on every API call, and the roles
 * API invalidates the cache when an admin edits access levels.
 */
export async function effectivePermissions(role: string): Promise<Permission[]> {
  if (role === SUPERADMIN_ROLE) return [...ALL_PERMISSIONS];
  return cached(`perms:${role}`, 30_000, async () => {
    const overrides = await prisma.rolePermission.findMany({ where: { role } });
    const map = new Map(overrides.map((o) => [o.permission, o.allowed]));
    return ALL_PERMISSIONS.filter((p) =>
      map.has(p) ? (map.get(p) as boolean) : defaultAllowed(role, p),
    );
  });
}

/** Whether a role currently holds a single permission (cached list lookup). */
export async function roleHasPermission(
  role: string,
  permission: Permission,
): Promise<boolean> {
  if (role === SUPERADMIN_ROLE) return true;
  return (await effectivePermissions(role)).includes(permission);
}
