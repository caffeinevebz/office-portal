import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { tradeNameSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const tradeNames = await prisma.tradeName.findMany({
    where: { clientId: id },
    orderBy: { name: "asc" },
  });
  return ok(tradeNames);
});

export const POST = route(async (req, ctx: Ctx) => {
  await requirePermission("manageClients");
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return fail("Client not found", 404);
  const data = await parse(req, tradeNameSchema);
  const tradeName = await prisma.tradeName.create({ data: { ...data, clientId: id } });
  return ok(tradeName, 201);
});
