import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.TaskUncheckedUpdateInput) {
  const patch: Prisma.TaskUncheckedUpdateInput = { ...data };
  // Keep completedAt in sync with status transitions.
  if (typeof data.status === "string") {
    if (data.status === "Completed") {
      const current = await prisma.task.findUnique({ where: { id } });
      if (current && !current.completedAt) patch.completedAt = new Date();
    } else {
      patch.completedAt = null;
    }
  }
  return prisma.task.update({
    where: { id },
    data: patch,
    include: { client: true, assignee: true },
  });
}

export const PUT = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const data = await parse(req, taskUpdateSchema);
  const task = await applyUpdate(id, data as Prisma.TaskUncheckedUpdateInput);
  return ok(task);
});

// Lightweight status toggle used by the board / quick actions.
export const PATCH = route(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status) return fail("status is required");
  const task = await applyUpdate(id, { status: body.status });
  return ok(task);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id } });
  return ok({ ok: true });
});
