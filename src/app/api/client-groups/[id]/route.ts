import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { clientGroupSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id } = await ctx.params;
  const data = await parse(req, clientGroupSchema);
  const code = data.code.toUpperCase();
  const clash = await prisma.clientGroup.findUnique({ where: { code } });
  if (clash && clash.id !== id) return fail(`A group with code ${code} already exists`);
  const group = await prisma.clientGroup.update({ where: { id }, data: { ...data, code } });
  return ok(group);
});

// Deleting a group leaves its clients ungrouped (SetNull on the relation).
export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id } = await ctx.params;
  await prisma.clientGroup.delete({ where: { id } });
  return ok({ ok: true });
});
