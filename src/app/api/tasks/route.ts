import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { taskCreateSchema } from "@/lib/validation";
import { LEGACY_CATEGORY_MAP } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

// Migrate legacy category values (ROC/MCA, Accounting) to the current master
// groups in place. Idempotent and cheap — a no-op once everything is migrated.
async function backfillCategories() {
  for (const [oldVal, newVal] of Object.entries(LEGACY_CATEGORY_MAP)) {
    await prisma.task.updateMany({ where: { category: oldVal }, data: { category: newVal } });
    await prisma.complianceSchedule.updateMany({ where: { category: oldVal }, data: { category: newVal } });
  }
}

export const GET = route(async (req) => {
  await requireUser();
  await backfillCategories();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view")?.trim(); // Active (default) or Completed
  const status = searchParams.get("status")?.trim();
  const category = searchParams.get("category")?.trim();
  const assigneeId = searchParams.get("assigneeId")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const fy = searchParams.get("fy")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.TaskWhereInput = {};
  // Completed tasks live in their own list so the working list stays lean.
  if (view === "Completed") where.status = "Completed";
  else if (view === "Active") where.status = { not: "Completed" };
  if (status && status !== "All") where.status = status;
  if (category && category !== "All") where.category = category;
  if (assigneeId && assigneeId !== "All") where.assigneeId = assigneeId;
  if (clientId) where.clientId = clientId;
  if (fy && fy !== "All") where.financialYear = fy;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    // The completed list reads newest-first; the working list by due date.
    orderBy: view === "Completed" ? [{ completedAt: "desc" }] : [{ dueDate: "asc" }],
    include: {
      client: true,
      assignee: true,
      // Whether (and on which invoice) this task has been billed.
      invoiceLines: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
    },
  });
  return ok(tasks);
});

// Return-filing categories default the "is return filing" flag on.
const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];

export const POST = route(async (req) => {
  await requirePermission("manageTasks");
  const { clientIds, ...data } = await parse(req, taskCreateSchema);
  const isReturnFiling = data.isReturnFiling ?? RETURN_CATEGORIES.includes(data.category);
  // A return task with a filing date recorded is complete on creation.
  const filed = isReturnFiling && !!data.filingDate;
  const status = filed ? "Completed" : data.status;
  const base = {
    ...data,
    isReturnFiling,
    status,
    completedAt: status === "Completed" ? (data.filingDate ?? new Date()) : null,
  };

  // Multi-client creation: one identical task per selected client.
  if (clientIds && clientIds.length > 0) {
    const tasks = [];
    for (const clientId of clientIds) {
      tasks.push(
        await prisma.task.create({
          data: { ...base, clientId },
          include: { client: true, assignee: true },
        }),
      );
    }
    return ok(tasks, 201);
  }

  const task = await prisma.task.create({
    data: base,
    include: { client: true, assignee: true },
  });
  return ok(task, 201);
});
