import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/auth/effective";
import { expenseClaimUpdateSchema, expenseDecisionSchema } from "@/lib/validation";
import { notifyStaff } from "@/lib/notifications";

type Ctx = { params: Promise<{ id: string }> };

const CLAIM_INCLUDE = {
  staff: { select: { id: true, name: true, role: true } },
  client: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, category: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} as const;

// Edit a claim — the requester while it is still Pending, or an approver.
export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("raiseExpenses");
  const { id } = await ctx.params;
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) return fail("Claim not found", 404);
  const isApprover = await roleHasPermission(user.role, "approveExpenses");
  if (claim.staffId !== user.id && !isApprover)
    return fail("You can only edit your own claims", 403);
  if (claim.status !== "Pending" && !isApprover)
    return fail("A decided claim can no longer be edited", 409);

  const data = await parse(req, expenseClaimUpdateSchema);
  const updated = await prisma.expenseClaim.update({
    where: { id },
    data: {
      ...data,
      ...(data.items
        ? { items: data.items, totalAmount: data.items.reduce((s, i) => s + i.amount, 0) }
        : {}),
    },
    include: CLAIM_INCLUDE,
  });
  return ok(updated);
});

// Approve / reject a claim (Partner/Admin) — notifies the requester.
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("approveExpenses");
  const { id } = await ctx.params;
  const { action, note } = await parse(req, expenseDecisionSchema);
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) return fail("Claim not found", 404);
  if (claim.status !== "Pending") return fail("This claim has already been decided", 409);

  const status = action === "Approve" ? "Approved" : "Rejected";
  const updated = await prisma.expenseClaim.update({
    where: { id },
    data: {
      status,
      decidedAt: new Date(),
      decidedById: user.id,
      decidedByName: user.name,
      decisionNote: note,
    },
    include: CLAIM_INCLUDE,
  });
  if (claim.staffId !== user.id) {
    await notifyStaff([claim.staffId], {
      type: "expense-decided",
      title: `Reimbursement ${status.toLowerCase()}: ${claim.title}`,
      body: `₹${claim.totalAmount.toLocaleString("en-IN")} · by ${user.name}${note ? ` — ${note}` : ""}`,
      href: "/expenses",
    });
  }
  return ok(updated);
});

// Withdraw / remove a claim — the requester while Pending, or an approver.
export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requirePermission("raiseExpenses");
  const { id } = await ctx.params;
  const claim = await prisma.expenseClaim.findUnique({ where: { id } });
  if (!claim) return fail("Claim not found", 404);
  const isApprover = await roleHasPermission(user.role, "approveExpenses");
  if (claim.staffId !== user.id && !isApprover)
    return fail("You can only withdraw your own claims", 403);
  if (claim.status !== "Pending" && !isApprover)
    return fail("A decided claim can no longer be withdrawn", 409);
  await prisma.expenseClaim.delete({ where: { id } });
  return ok({ ok: true });
});
