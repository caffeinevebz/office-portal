import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { taskQuerySchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// Points on this task awaiting the client's clarification, oldest first.
export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const queries = await prisma.taskQuery.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  return ok(queries);
});

// Raise a new point for the client to clarify.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!task) return fail("Task not found", 404);
  const data = await parse(req, taskQuerySchema);
  const query = await prisma.taskQuery.create({
    data: {
      taskId: id,
      point: data.point,
      response: data.response,
      status: data.response ? "Answered" : "Open",
      answeredAt: data.response ? new Date() : null,
      askedBy: user.name,
    },
  });
  return ok(query, 201);
});
