import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { taskCreateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const category = searchParams.get("category")?.trim();
  const assigneeId = searchParams.get("assigneeId")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.TaskWhereInput = {};
  if (status && status !== "All") where.status = status;
  if (category && category !== "All") where.category = category;
  if (assigneeId && assigneeId !== "All") where.assigneeId = assigneeId;
  if (clientId) where.clientId = clientId;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    include: { client: true, assignee: true },
  });
  return ok(tasks);
});

export const POST = route(async (req) => {
  await requirePermission("manageTasks");
  const data = await parse(req, taskCreateSchema);
  const task = await prisma.task.create({
    data: {
      ...data,
      completedAt: data.status === "Completed" ? new Date() : null,
    },
    include: { client: true, assignee: true },
  });
  return ok(task, 201);
});
