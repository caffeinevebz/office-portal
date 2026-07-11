import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { invoiceGross } from "@/lib/format";
import { TASK_STATUSES, TASK_CATEGORIES } from "@/lib/constants";

const gross = (i: { amount: number; taxRate: number; gstMode: string }) =>
  invoiceGross(i.amount, i.taxRate, i.gstMode);

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const GET = route(async () => {
  await requireUser();
  const now = new Date();
  const today = startOfDay();
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);

  const [clients, tasks, invoices, dscs] = await Promise.all([
    prisma.client.findMany({ select: { status: true } }),
    prisma.task.findMany({
      include: { client: { select: { name: true } }, assignee: { select: { name: true } } },
    }),
    prisma.invoice.findMany(),
    // DSC alerts: active certificates already expired or expiring within 30 days.
    prisma.dsc.findMany({
      where: { status: "Active", expiryDate: { lte: in30 } },
      orderBy: { expiryDate: "asc" },
      include: { client: { select: { name: true } } },
    }),
  ]);

  const openTasks = tasks.filter((t) => t.status !== "Completed");
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueSoon = openTasks.filter(
    (t) => t.dueDate && t.dueDate >= today && t.dueDate <= in7,
  );

  // Receivables = billed but not yet paid (Sent + Overdue).
  const outstanding = invoices
    .filter((i) => i.status === "Sent" || i.status === "Overdue")
    .reduce((sum, i) => sum + gross(i), 0);
  const collected = invoices
    .filter((i) => i.status === "Paid")
    .reduce((sum, i) => sum + gross(i), 0);

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
  for (const inv of invoices) {
    const d = new Date(inv.issueDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = bucket.get(key);
    if (!m) continue;
    const total = gross(inv);
    m.billed += total;
    if (inv.status === "Paid") m.collected += total;
  }

  const upcoming = openTasks
    .filter((t) => t.dueDate)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      client: t.client?.name ?? null,
      assignee: t.assignee?.name ?? null,
    }));

  const dscAlerts = dscs.map((d) => ({
    id: d.id,
    holderName: d.holderName,
    client: d.client?.name ?? null,
    expiryDate: d.expiryDate,
    daysLeft: Math.ceil((d.expiryDate.getTime() - today.getTime()) / 86_400_000),
    expired: d.expiryDate < now,
  }));

  return ok({
    kpis: {
      activeClients: clients.filter((c) => c.status === "Active").length,
      totalClients: clients.length,
      openTasks: openTasks.length,
      overdueTasks: overdue.length,
      dueSoon: dueSoon.length,
      outstanding,
      collected,
      overdueInvoices: invoices.filter((i) => i.status === "Overdue").length,
    },
    statusBreakdown,
    categoryBreakdown,
    months,
    upcoming,
    dscAlerts,
  });
});
