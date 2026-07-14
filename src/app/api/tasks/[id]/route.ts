import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { taskUpdateSchema, taskFilingSchema } from "@/lib/validation";
import {
  checklistStatus,
  tdsFormLabel,
  CATEGORY_RETURN_TYPE,
  type ChecklistItem,
} from "@/lib/constants";
import type { Prisma, Task } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const TASK_INCLUDE = {
  client: true,
  assignee: true,
  invoiceLines: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
} as const;

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
    include: TASK_INCLUDE,
  });
}

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const { clientIds: _ignored, ...data } = await parse(req, taskUpdateSchema);
  const task = await applyUpdate(id, data as Prisma.TaskUncheckedUpdateInput);
  return ok(task);
});

// Lightweight partial update used by the table: a quick status change, or a
// checklist tick — the status is then derived from the steps checked
// (none → Pending, some → In Progress, all → Completed).
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageTasks");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    checklist?: ChecklistItem[];
  };
  if (!body.status && !body.checklist) return fail("status or checklist is required");

  const patch: Prisma.TaskUncheckedUpdateInput = {};
  if (body.checklist) {
    const items = body.checklist
      .filter((i) => i && typeof i.label === "string" && i.label.trim())
      .map((i) => ({ label: i.label, done: !!i.done }));
    patch.checklist = items;
    // Auto-update the status from the steps checked (unless an explicit
    // status accompanies the request).
    const derived = checklistStatus(items);
    if (!body.status && derived) patch.status = derived;
  }
  if (body.status) patch.status = body.status;

  const task = await applyUpdate(id, patch);
  return ok(task);
});

/**
 * Add or refresh the filing-register entry for a task whose return has been
 * filed. Keyed by taskId, so re-recording a filing updates the same row.
 */
async function upsertFilingRecord(task: Task) {
  const returnType = CATEGORY_RETURN_TYPE[task.category];
  if (!returnType || !task.clientId) return;

  const formType =
    task.category === "TDS"
      ? tdsFormLabel(task.tdsForm) || "TDS Return"
      : task.category === "GST"
        ? (task.gstReturnType ?? "GST Return")
        : task.category === "Income Tax"
          ? "ITR"
          : "Other";

  const fields = {
    returnType,
    formType,
    financialYear: task.financialYear,
    periodQuarter: task.periodQuarter,
    periodMonth: task.periodMonth,
    status: "Filed",
    filedOn: task.filingDate,
    ackNumber: task.ackNumber,
    clientId: task.clientId,
    assigneeId: task.assigneeId,
    notes: task.title,
  };
  await prisma.itrFiling.upsert({
    where: { taskId: task.id },
    update: fields,
    create: { ...fields, taskId: task.id },
  });
}

// Record a return filing (filing date + acknowledgement) → marks it filed
// and posts the filing into the return-filing register.
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
    include: TASK_INCLUDE,
  });
  await upsertFilingRecord(task);
  return ok(task);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("deleteTasks");
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id } });
  return ok({ ok: true });
});
