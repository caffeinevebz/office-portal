import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { taskQueryUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string; queryId: string }> };

/** Edit a clarification point, or record the client's answer against it. */
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id, queryId } = await ctx.params;
  const existing = await prisma.taskQuery.findUnique({ where: { id: queryId } });
  if (!existing || existing.taskId !== id) return fail("Clarification point not found", 404);
  const data = await parse(req, taskQueryUpdateSchema);

  // Recording an answer marks the point answered; clearing it reopens it.
  const response = data.response !== undefined ? data.response : existing.response;
  const status = data.status ?? (response ? "Answered" : "Open");
  const query = await prisma.taskQuery.update({
    where: { id: queryId },
    data: {
      point: data.point ?? existing.point,
      response,
      status,
      answeredAt:
        status === "Answered" ? (existing.answeredAt ?? new Date()) : null,
    },
  });
  return ok(query);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id, queryId } = await ctx.params;
  const existing = await prisma.taskQuery.findUnique({ where: { id: queryId } });
  if (!existing || existing.taskId !== id) return fail("Clarification point not found", 404);
  await prisma.taskQuery.delete({ where: { id: queryId } });
  return ok({ ok: true });
});
