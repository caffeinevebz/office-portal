import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import { expenseClaimSchema } from "@/lib/validation";
import { notifyStaff } from "@/lib/notifications";
import type { Prisma } from "@prisma/client";

const CLAIM_INCLUDE = {
  staff: { select: { id: true, name: true, role: true } },
  client: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, category: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} as const;

export const GET = route(async (req) => {
  const user = await requirePermission("raiseExpenses");
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();

  const where: Prisma.ExpenseClaimWhereInput = {};
  if (status && status !== "All") where.status = status;
  // Approvers review everyone's claims; everyone else sees just their own.
  if (!(await roleHasPermission(user.role, "approveExpenses"))) where.staffId = user.id;

  const claims = await prisma.expenseClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: CLAIM_INCLUDE,
  });
  return ok(claims);
});

export const POST = route(async (req) => {
  const user = await requirePermission("raiseExpenses");
  const data = await parse(req, expenseClaimSchema);
  const claim = await prisma.expenseClaim.create({
    data: {
      ...data,
      items: data.items,
      totalAmount: data.items.reduce((s, i) => s + i.amount, 0),
      staffId: user.id,
    },
    include: CLAIM_INCLUDE,
  });

  // Let the approvers know a claim is waiting for them.
  const staff = await prisma.staff.findMany({
    where: { active: true, id: { not: user.id } },
    select: { id: true, role: true },
  });
  const roles = [...new Set(staff.map((s) => s.role))];
  const approverRoles = new Set<string>();
  for (const role of roles) {
    if (await roleHasPermission(role, "approveExpenses")) approverRoles.add(role);
  }
  await notifyStaff(
    staff.filter((s) => approverRoles.has(s.role)).map((s) => s.id),
    {
      type: "expense-raised",
      title: `Reimbursement request: ${claim.title}`,
      body: `${user.name} claims ₹${claim.totalAmount.toLocaleString("en-IN")} (${data.items.length} item${data.items.length === 1 ? "" : "s"})`,
      href: "/expenses",
    },
  );
  return ok(claim, 201);
});
