import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { clientUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        include: { assignee: true },
      },
      invoices: { orderBy: { issueDate: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!client) return fail("Client not found", 404);
  return ok(client);
});

export const PUT = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await parse(req, clientUpdateSchema);
  const client = await prisma.client.update({ where: { id }, data });
  return ok(client);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await prisma.client.delete({ where: { id } });
  return ok({ ok: true });
});
