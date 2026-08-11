import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import { taskCreateSchema } from "@/lib/validation";
import {
  LEGACY_CATEGORY_MAP,
  defaultChecklist,
  canApproveRole,
  effectivePriority,
  priorityFromDueDate,
} from "@/lib/constants";
import { notifyTaskAssignment, notifyTaskApprover } from "@/lib/notifications";
import { ensureCurrentMonthTasks } from "@/lib/generate";
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
  // Recurring obligations become real tasks at the start of the month they
  // fall due, without anyone pressing a button. Runs once per month per
  // process and is idempotent, so reads stay cheap.
  await ensureCurrentMonthTasks();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view")?.trim(); // Active (default) or Completed
  const status = searchParams.get("status")?.trim();
  const category = searchParams.get("category")?.trim();
  const assigneeId = searchParams.get("assigneeId")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const groupId = searchParams.get("groupId")?.trim();
  // "firm" = the firm's own work — raised by hand *or* generated from a
  // recurring obligation the firm set up, because a recurring obligation is
  // only a setting for work the firm does anyway. "statutory" = dates pulled
  // in from a synced government calendar, which are firm-wide and numerous.
  // Absent/"all" = everything.
  const source = searchParams.get("source")?.trim();
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
  // Filter by the client's group ("None" = clients outside any group).
  if (groupId && groupId !== "All")
    and.push({ client: { groupId: groupId === "None" ? null : groupId } });
  if (source === "firm")
    and.push({ OR: [{ scheduleId: null }, { schedule: { source: null } }] });
  else if (source === "statutory") and.push({ schedule: { source: { not: null } } });
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
      client: { select: { id: true, name: true, phone: true } },
      tradeName: { select: { id: true, name: true } },
      assignee: person,
      assignees: person,
      approver: person,
      gstRegistration: { select: { id: true, gstin: true, label: true, state: true } },
      // Whether (and on which invoice) this task has been billed — via the
      // lead-task link or the many-to-many line mapping.
      invoiceLines: { select: { invoice: { select: { id: true, invoiceNumber: true } } } },
      billedLines: { select: { invoice: { select: { id: true, invoiceNumber: true } } } },
      // Clarification points — the list shows how many are still open.
      queries: { orderBy: { createdAt: "asc" } },
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
  tradeName: true,
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
    gstTargets,
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

  // A GST notice reply is not a return, so it never asks for a filing entry —
  // whatever the category's default would otherwise be.
  const gstNotice = data.category === "GST" && data.gstWorkType === "Notice reply";
  const isReturnFiling = gstNotice
    ? false
    : (data.isReturnFiling ?? RETURN_CATEGORIES.includes(data.category));
  // A return task with a filing date recorded is complete on creation.
  const filed = isReturnFiling && !!data.filingDate;
  const status = filed ? "Completed" : data.status;
  // Seed the work programme when the caller did not supply one. Tasks
  // generated from a recurring obligation already get theirs server-side, so
  // a hand-raised task should not depend on the form having filled it in —
  // and a GST notice reply runs a different programme from a GST return.
  const checklist =
    data.checklist && data.checklist.length > 0
      ? data.checklist
      : (() => {
          const seeded = defaultChecklist(data.category, {
            taskType: data.taskType,
            gstReturnType: data.gstReturnType,
            gstWorkType: data.gstWorkType,
          });
          return seeded.length > 0 ? seeded : undefined;
        })();

  const base = {
    ...data,
    checklist,
    priority,
    priorityManual,
    assigneeId: leadAssigneeId,
    assignees: assigneesConnect,
    isReturnFiling,
    status,
    completedAt: status === "Completed" ? (data.filingDate ?? new Date()) : null,
  };

  // Multi-GSTIN creation: one identical GST task per selected GSTIN of the
  // same client — because each registration files its returns separately. The
  // client's GSTINs may be recorded as GST registrations or as trade names (a
  // proprietor's separate concerns), so a target carries whichever links it
  // has and the task ends up showing both the concern and the number.
  const wanted =
    gstTargets && gstTargets.length > 0
      ? gstTargets
      : (gstRegistrationIds ?? []).map((id) => ({
          gstRegistrationId: id,
          tradeNameId: null,
          gstin: null,
        }));
  if (wanted.length > 0) {
    const [regRows, tradeRows] = await Promise.all([
      prisma.gstRegistration.findMany({
        where: {
          id: { in: wanted.map((t) => t.gstRegistrationId).filter(Boolean) as string[] },
          clientId: data.clientId ?? undefined,
        },
      }),
      prisma.tradeName.findMany({
        where: {
          id: { in: wanted.map((t) => t.tradeNameId).filter(Boolean) as string[] },
          clientId: data.clientId ?? undefined,
        },
      }),
    ]);
    const regById = new Map(regRows.map((r) => [r.id, r]));
    const tradeById = new Map(tradeRows.map((t) => [t.id, t]));

    const tasks = [];
    for (const t of wanted) {
      const reg = t.gstRegistrationId ? regById.get(t.gstRegistrationId) : null;
      const trade = t.tradeNameId ? tradeById.get(t.tradeNameId) : null;
      // Nothing on this client matched — not this client's GSTIN.
      if (!reg && !trade) continue;
      tasks.push(
        await prisma.task.create({
          data: {
            ...base,
            gstRegistrationId: reg?.id ?? null,
            tradeNameId: trade?.id ?? base.tradeNameId ?? null,
            gstin: reg?.gstin ?? trade?.gstin ?? t.gstin ?? null,
          },
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
