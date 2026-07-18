import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { staffUpdateSchema } from "@/lib/validation";
import { invalidateCache } from "@/lib/cache";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTeam");
  const { id } = await ctx.params;
  const { password, ...rest } = await parse(req, staffUpdateSchema);

  const data: Prisma.StaffUpdateInput = { ...rest };
  if (typeof rest.email === "string") data.email = rest.email.toLowerCase();
  if (password) data.passwordHash = hashPassword(password);

  const member = await prisma.staff.update({ where: { id }, data });
  // Role / deactivation changes take effect immediately, not after the TTL.
  invalidateCache(`staff:${id}`);
  return ok(member);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTeam");
  const { id } = await ctx.params;
  // Unassign this member from any tasks, then remove them.
  await prisma.task.updateMany({
    where: { assigneeId: id },
    data: { assigneeId: null },
  });
  await prisma.staff.delete({ where: { id } });
  invalidateCache(`staff:${id}`);
  return ok({ ok: true });
});
