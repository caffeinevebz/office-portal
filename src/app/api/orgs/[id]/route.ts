import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { organizationUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const data = await parse(req, organizationUpdateSchema);
  const org = await prisma.organization.update({ where: { id }, data });
  const { logo, ...rest } = org;
  return ok({ ...rest, hasLogo: !!logo });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) return fail("Organization not found", 404);
  if (org.isDefault) {
    return fail("The default organization cannot be deleted — make another one default first");
  }
  await prisma.organization.delete({ where: { id } }); // invoices keep their data (SetNull)
  return ok({ ok: true });
});
