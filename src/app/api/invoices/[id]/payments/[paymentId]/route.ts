import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { deletePayment, settlementOf } from "@/lib/payments";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

/** Undo a receipt — entered in error, or a cheque that bounced. */
export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id, paymentId } = await ctx.params;
  const removed = await deletePayment(id, paymentId);
  if (!removed) return fail("Payment not found", 404);
  const after = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { orderBy: { paidDate: "asc" } } },
  });
  if (!after) return fail("Invoice not found", 404);
  return ok({ invoice: after, settlement: settlementOf(after, after.payments) });
});
