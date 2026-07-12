import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { tradeNameSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; tnId: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id, tnId } = await ctx.params;
  const data = await parse(req, tradeNameSchema);
  const tradeName = await prisma.tradeName.update({
    where: { id: tnId, clientId: id },
    data,
  });
  return ok(tradeName);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id, tnId } = await ctx.params;
  await prisma.tradeName.delete({ where: { id: tnId, clientId: id } });
  return ok({ ok: true });
});
