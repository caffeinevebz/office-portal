import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import { invoiceGross } from "@/lib/format";
import { TASK_STATUSES, TASK_CATEGORIES, INVOICE_UNISSUED, effectivePriority } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

const gross = (i: { amount: number; taxRate: number; gstMode: string }) =>
  invoiceGross(i.amount, i.taxRate, i.gstMode);

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const GET = route(async () => {
  const user = await requireUser();
  const now = new Date();
  const today = startOfDay();
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  // Staff-level members see their own task numbers (matching the task list);
  // partners/admins/managers see the whole firm's.
  const viewAll = await roleHasPermission(user.role, "viewAllTasks");
  // Billing figures are partner-level. Without the permission they are not
  // merely hidden in the UI — they never leave the server.
  const seeBilling = await roleHasPermission(user.role, "viewInvoices");
  const taskWhere: Prisma.TaskWhereInput = viewAll
    ? {}
    : {
        OR: [
          { assigneeId: user.id },
          { assignees: { some: { id: user.id } } },
          { approverId: user.id },
        ],
      };

  const [clients, tasks, invoices, activeDscs] = await Promise.all([
    prisma.client.findMany({ select: { status: true } }),
    // Only the fields the summaries below read — full rows drag heavy Json
    // columns (checklists) across the wire for nothing.
    prisma.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        priority: true,
        priorityManual: true,
        dueDate: true,
        client: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      select: {
        amount: true,
        taxRate: true,
        gstMode: true,
        status: true,
        issueDate: true,
        // Money received — a bill may be settled in instalments.
        payments: { select: { amount: true, paidDate: true } },
      },
    }),
    // DSC summary: every active certificate, bucketed by how close expiry is.
    prisma.dsc.findMany({
      where: { status: "Active" },
      select: { expiryDate: true, clientId: true },
    }),
  ]);

  const openQueries = await prisma.taskQuery.count({
    where: { status: { not: "Answered" }, task: taskWhere },
  });

  const openTasks = tasks.filter((t) => t.status !== "Completed");
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueSoon = openTasks.filter(
    (t) => t.dueDate && t.dueDate >= today && t.dueDate <= in7,
  );

  // A bill can be settled in instalments, so both figures work off the money
  // actually received rather than the invoice's status: receivables are what
  // is still owed on every raised bill, collected is what has come in.
  const receivedOn = (i: (typeof invoices)[number]) =>
    (i.payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
  // A bill that has been written up or passed but not yet sent is not money
  // anyone owes yet, so it stays out of receivables until it goes.
  const outstanding = invoices
    .filter((i) => !INVOICE_UNISSUED.has(i.status))
    .reduce((sum, i) => sum + Math.max(0, gross(i) - receivedOn(i)), 0);
  const collected = invoices.reduce((sum, i) => sum + receivedOn(i), 0);

  const statusBreakdown = TASK_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }));

  const categoryBreakdown = TASK_CATEGORIES.map((category) => ({
    category,
    count: openTasks.filter((t) => t.category === category).length,
  })).filter((c) => c.count > 0);

  // Revenue by month over the trailing 6 months (billed value of invoices).
  const months: { key: string; label: string; billed: number; collected: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      billed: 0,
      collected: 0,
    });
  }
  const bucket = new Map(months.map((m) => [m.key, m]));
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  for (const inv of invoices) {
    // Billed lands in the month the invoice was raised…
    const raised = bucket.get(monthKey(new Date(inv.issueDate)));
    if (raised) raised.billed += gross(inv);
    // …collected in the month each payment actually came in, which is what
    // the firm's receipts-basis accounts recognise.
    for (const p of inv.payments ?? []) {
      const m = bucket.get(monthKey(new Date(p.paidDate)));
      if (m) m.collected += p.amount || 0;
    }
  }

  const upcoming = openTasks
    .filter((t) => t.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: effectivePriority(t),
      status: t.status,
      dueDate: t.dueDate,
      client: t.client?.name ?? null,
      assignee: t.assignee?.name ?? null,
    }));

  // Three mutually-exclusive buckets over the active DSCs.
  const dscSummary = {
    expired: activeDscs.filter((d) => d.expiryDate < now).length,
    expiringSoon: activeDscs.filter((d) => d.expiryDate >= now && d.expiryDate <= in30).length,
    valid: activeDscs.filter((d) => d.expiryDate > in30).length,
    unlinked: activeDscs.filter((d) => !d.clientId).length,
  };

  return ok({
    // True when task numbers are scoped to the signed-in member.
    scoped: !viewAll,
    kpis: {
      activeClients: clients.filter((c) => c.status === "Active").length,
      totalClients: clients.length,
      openTasks: openTasks.length,
      overdueTasks: overdue.length,
      dueSoon: dueSoon.length,
      // Points still awaiting a client's answer — what a non-billing member
      // sees in place of the receivables figure.
      openQueries,
      ...(seeBilling
        ? {
            outstanding,
            collected,
            overdueInvoices: invoices.filter((i) => i.status === "Overdue").length,
          }
        : {}),
    },
    statusBreakdown,
    categoryBreakdown,
    months: seeBilling ? months : [],
    upcoming,
    dscSummary,
  });
});
