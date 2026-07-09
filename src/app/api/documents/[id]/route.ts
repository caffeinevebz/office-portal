import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { documentUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await parse(req, documentUpdateSchema);
  const doc = await prisma.document.update({
    where: { id },
    data,
    include: { client: true },
  });
  return ok(doc);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await prisma.document.delete({ where: { id } });
  return ok({ ok: true });
});
