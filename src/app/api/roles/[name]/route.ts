import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { roleUpdateSchema, rolePermissionSchema } from "@/lib/validation";
import { ALL_PERMISSIONS, SUPERADMIN_ROLE, type Permission } from "@/lib/auth/roles";

type Ctx = { params: Promise<{ name: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageRoles");
  const roleName = decodeURIComponent((await ctx.params).name);
  const data = await parse(req, roleUpdateSchema);
  const role = await prisma.role.update({
    where: { name: roleName },
    data: { description: data.description },
  });
  return ok(role);
});

// Toggle a single permission for a role.
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageRoles");
  const roleName = decodeURIComponent((await ctx.params).name);
  if (roleName === SUPERADMIN_ROLE) {
    return fail("The Partner role always has full access and cannot be changed");
  }
  const { permission, allowed } = await parse(req, rolePermissionSchema);
  if (!(ALL_PERMISSIONS as string[]).includes(permission)) {
    return fail("Unknown permission");
  }
  await prisma.rolePermission.upsert({
    where: { role_permission: { role: roleName, permission } },
    update: { allowed },
    create: { role: roleName, permission, allowed },
  });
  return ok({ ok: true });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageRoles");
  const roleName = decodeURIComponent((await ctx.params).name);
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role) return fail("Role not found", 404);
  if (role.isSystem) return fail("Built-in roles cannot be deleted");

  const staffCount = await prisma.staff.count({ where: { role: roleName } });
  if (staffCount > 0) {
    return fail(`Reassign the ${staffCount} member(s) with this role first`);
  }
  await prisma.rolePermission.deleteMany({ where: { role: roleName } });
  await prisma.role.delete({ where: { name: roleName } });
  return ok({ ok: true });
});

// Silence unused import warning for the type-only Permission reference.
export type { Permission };
