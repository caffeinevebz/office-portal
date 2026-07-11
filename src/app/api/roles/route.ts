import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { roleCreateSchema } from "@/lib/validation";
import { ensureSystemRoles } from "@/lib/auth/ensure-roles";
import { effectivePermissions } from "@/lib/auth/effective";
import {
  SYSTEM_ROLES,
  PERMISSION_META,
  PERMISSION_CATEGORIES,
  ALL_PERMISSIONS,
  ROLE_ACCESS,
  SUPERADMIN_ROLE,
} from "@/lib/auth/roles";

export const GET = route(async () => {
  await requirePermission("manageRoles");
  await ensureSystemRoles(prisma);

  const [roleRows, staffGroups] = await Promise.all([
    prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }] }),
    prisma.staff.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);
  const counts = new Map(staffGroups.map((g) => [g.role, g._count._all]));

  const roles = await Promise.all(
    roleRows.map(async (r) => ({
      name: r.name,
      description: r.description ?? ROLE_ACCESS[r.name] ?? null,
      isSystem: r.isSystem,
      isSuperadmin: r.name === SUPERADMIN_ROLE,
      staffCount: counts.get(r.name) ?? 0,
      permissions: await effectivePermissions(r.name),
    })),
  );

  return ok({
    roles,
    permissions: ALL_PERMISSIONS.map((p) => ({ key: p, ...PERMISSION_META[p] })),
    categories: PERMISSION_CATEGORIES,
  });
});

export const POST = route(async (req) => {
  await requirePermission("manageRoles");
  const data = await parse(req, roleCreateSchema);
  const name = data.name.trim();
  if ((SYSTEM_ROLES as readonly string[]).includes(name)) {
    return fail("That is a built-in role");
  }
  if (await prisma.role.findUnique({ where: { name } })) {
    return fail("A role with that name already exists");
  }
  const role = await prisma.role.create({
    data: { name, description: data.description, isSystem: false },
  });
  return ok(role, 201);
});
