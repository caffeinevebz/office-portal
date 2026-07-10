import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) return fail("Organization not found", 404);
  await prisma.$transaction([
    prisma.organization.updateMany({ data: { isDefault: false } }),
    prisma.organization.update({ where: { id }, data: { isDefault: true } }),
  ]);
  return ok({ ok: true });
});
