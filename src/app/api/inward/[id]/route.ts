import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { packetUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInward");
  const { id } = await ctx.params;
  const data = await parse(req, packetUpdateSchema);
  // receivedAt: only overwrite when a date was actually supplied.
  const { receivedAt, ...rest } = data;
  const packet = await prisma.docPacket.update({
    where: { id },
    data: { ...rest, ...(receivedAt ? { receivedAt } : {}) },
    include: { client: true, movements: { orderBy: { createdAt: "desc" } } },
  });
  return ok(packet);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteInward");
  const { id } = await ctx.params;
  await prisma.docPacket.delete({ where: { id } }); // movements cascade
  return ok({ ok: true });
});
