import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { dscUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageDsc");
  const { id } = await ctx.params;
  const data = await parse(req, dscUpdateSchema);
  const dsc = await prisma.dsc.update({
    where: { id },
    data,
    include: { client: true, movements: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  return ok(dsc);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteDsc");
  const { id } = await ctx.params;
  await prisma.dsc.delete({ where: { id } }); // movements cascade
  return ok({ ok: true });
});
