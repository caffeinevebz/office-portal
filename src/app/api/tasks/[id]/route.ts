import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { taskUpdateSchema, taskFilingSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.TaskUncheckedUpdateInput) {
  const patch: Prisma.TaskUncheckedUpdateInput = { ...data };

  // Recording a filing date on a return task completes it automatically.
  if (data.filingDate) {
    patch.status = "Completed";
    patch.completedAt = data.filingDate;
  } else if (typeof data.status === "string") {
    // Keep completedAt in sync with manual status transitions.
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
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const data = await parse(req, taskUpdateSchema);
  const task = await applyUpdate(id, data as Prisma.TaskUncheckedUpdateInput);
  return ok(task);
});

// Lightweight status toggle used by the board / quick actions.
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status) return fail("status is required");
  const task = await applyUpdate(id, { status: body.status });
  return ok(task);
});

// Record a return filing (filing date + acknowledgement) → marks it filed.
export const POST = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const data = await parse(req, taskFilingSchema);
  const task = await prisma.task.update({
    where: { id },
    data: {
      filingDate: data.filingDate,
      ackNumber: data.ackNumber,
      isReturnFiling: true,
      status: "Completed",
      completedAt: data.filingDate,
    },
    include: { client: true, assignee: true },
  });
  return ok(task);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteTasks");
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id } });
  return ok({ ok: true });
});
