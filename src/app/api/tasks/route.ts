import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import { taskCreateSchema } from "@/lib/validation";
import {
  LEGACY_CATEGORY_MAP,
  canApproveRole,
  effectivePriority,
  priorityFromDueDate,
} from "@/lib/constants";
import { notifyTaskAssignment, notifyTaskApprover } from "@/lib/notifications";
import type { Prisma } from "@prisma/client";

// Migrate legacy category values (ROC/MCA, Accounting) to the current master
// groups in place. Runs once per server process, not on every list fetch —
// these updateMany calls were pure latency on each request after the first.
let categoriesBackfilled = false;
async function backfillCategories() {
  if (categoriesBackfilled) return;
  categoriesBackfilled = true;
  for (const [oldVal, newVal] of Object.entries(LEGACY_CATEGORY_MAP)) {
    await prisma.task.updateMany({ where: { category: oldVal }, data: { category: newVal } });
    await prisma.complianceSchedule.updateMany({ where: { category: oldVal }, data: { category: newVal } });
  }
}

export const GET = route(async (req) => {
  const user = await requireUser();
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
  const and: Prisma.TaskWhereInput[] = [];
  // Completed tasks live in their own list so the working list stays lean.
  if (view === "Completed") where.status = "Completed";
  else if (view === "Active") where.status = { not: "Completed" };
  if (status && status !== "All") where.status = status;
  if (category && category !== "All") where.category = category;
  // Match the assignee filter against the lead assignee or any co-assignee.
  if (assigneeId && assigneeId !== "All")
    and.push({ OR: [{ assigneeId }, { assignees: { some: { id: assigneeId } } }] });
  if (clientId) where.clientId = clientId;
  if (fy && fy !== "All") where.financialYear = fy;
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  // Staff-level members (no viewAllTasks) see only work assigned to them —
  // as lead, co-assignee, or the approver awaiting their sign-off.
  if (!(await roleHasPermission(user.role, "viewAllTasks"))) {
    and.push({
      OR: [
        { assigneeId: user.id },
        { assignees: { some: { id: user.id } } },
        { approverId: user.id },
      ],
    });
  }
  if (and.length) where.AND = and;

  // Lean payload: the list renders names and ids, not whole client/staff
  // rows — trimming the includes cuts the response size and query cost.
  const person = { select: { id: true, name: true, role: true } } as const;
  const tasks = await prisma.task.findMany({
    where,
    // The completed list reads newest-first; the working list by due date.
    orderBy: view === "Completed" ? [{ completedAt: "desc" }] : [{ dueDate: "asc" }],
    include: {
      client: { select: { id: true, name: true } },
      assignee: person,
      assignees: person,
      approver: person,
      gstRegistration: { select: { id: true, gstin: true, label: true, state: true } },
      // Whether (and on which invoice) this task has been billed.
      invoiceLines: { select: { invoice: { select: { id: true, invoiceNumber: true } } } },
    },
  });
  // Auto priorities derive fresh from the due date on every read, so they
  // escalate on their own as a deadline approaches.
  return ok(tasks.map((t) => ({ ...t, priority: effectivePriority(t) })));
});

// Return-filing categories default the "is return filing" flag on.
const RETURN_CATEGORIES = ["GST", "Income Tax", "TDS"];

const TASK_INCLUDE = {
  client: true,
  assignee: true,
  assignees: true,
  approver: true,
  gstRegistration: true,
} as const;

export const POST = route(async (req) => {
  const user = await requirePermission("manageTasks");
  const {
    clientIds,
    assigneeIds,
    assigneeId: rawAssigneeId,
    priority: rawPriority,
    gstRegistrationIds,
    ...data
  } = await parse(req, taskCreateSchema);
  // Assignees: the first is the lead (kept on assigneeId for reminders); all
  // are linked via the many-to-many relation.
  const ids = assigneeIds && assigneeIds.length ? assigneeIds : rawAssigneeId ? [rawAssigneeId] : [];
  const leadAssigneeId = ids[0] ?? null;
  const assigneesConnect = ids.length ? { connect: ids.map((id) => ({ id })) } : undefined;

  // Priority defaults to auto (from days left to the due date); an explicit
  // choice pins it, but only a Partner/Admin may pin.
  const priorityManual = rawPriority !== "Auto" && canApproveRole(user.role);
  const priority = priorityManual ? rawPriority : priorityFromDueDate(data.dueDate);

  const isReturnFiling = data.isReturnFiling ?? RETURN_CATEGORIES.includes(data.category);
  // A return task with a filing date recorded is complete on creation.
  const filed = isReturnFiling && !!data.filingDate;
  const status = filed ? "Completed" : data.status;
  const base = {
    ...data,
    priority,
    priorityManual,
    assigneeId: leadAssigneeId,
    assignees: assigneesConnect,
    isReturnFiling,
    status,
    completedAt: status === "Completed" ? (data.filingDate ?? new Date()) : null,
  };

  // Multi-GSTIN creation: one identical GST task per selected registration of
  // the same client — because each GSTIN files its returns separately.
  if (gstRegistrationIds && gstRegistrationIds.length > 0) {
    const regs = await prisma.gstRegistration.findMany({
      where: { id: { in: gstRegistrationIds }, clientId: data.clientId ?? undefined },
    });
    const tasks = [];
    for (const reg of regs) {
      tasks.push(
        await prisma.task.create({
          data: { ...base, gstRegistrationId: reg.id, gstin: reg.gstin },
          include: TASK_INCLUDE,
        }),
      );
    }
    await notifyCreation(tasks.length, user, data, ids, tasks[0]?.client?.name ?? null);
    return ok(tasks, 201);
  }

  // Multi-client creation: one identical task per selected client.
  if (clientIds && clientIds.length > 0) {
    const tasks = [];
    for (const clientId of clientIds) {
      tasks.push(
        await prisma.task.create({ data: { ...base, clientId }, include: TASK_INCLUDE }),
      );
    }
    await notifyCreation(tasks.length, user, data, ids, tasks[0]?.client?.name ?? null);
    return ok(tasks, 201);
  }

  const task = await prisma.task.create({ data: base, include: TASK_INCLUDE });
  await notifyCreation(1, user, data, ids, task.client?.name ?? null);
  return ok(task, 201);
});

// Ping the assignees (and the approver) about their new task.
async function notifyCreation(
  count: number,
  user: { id: string; name: string },
  data: { title: string; dueDate?: Date | null; approverId?: string | null },
  assigneeIds: string[],
  clientName: string | null,
) {
  await notifyTaskAssignment({
    staffIds: assigneeIds,
    actorId: user.id,
    actorName: user.name,
    taskTitle: data.title,
    clientName,
    dueDate: data.dueDate ?? null,
    count,
  });
  if (data.approverId) {
    await notifyTaskApprover({
      approverId: data.approverId,
      actorId: user.id,
      actorName: user.name,
      taskTitle: data.title,
    });
  }
}
