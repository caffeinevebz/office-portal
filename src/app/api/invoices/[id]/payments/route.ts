import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { paymentSchema } from "@/lib/validation";
import { recordPayment, settlementOf } from "@/lib/payments";
import { sendReceiptEmail } from "@/lib/receipt-email";

type Ctx = { params: Promise<{ id: string }> };

/** Every receipt against this invoice, oldest first, with where it stands. */
export const GET = route(async (_req, ctx: Ctx) => {
  await requirePermission("viewInvoices");
  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { orderBy: { paidDate: "asc" } } },
  });
  if (!invoice) return fail("Invoice not found", 404);
  return ok({ payments: invoice.payments, settlement: settlementOf(invoice, invoice.payments) });
});

/** Record a receipt — the whole bill, or a payment on account. */
export const POST = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const data = await parse(req, paymentSchema);

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: true },
  });
  if (!invoice) return fail("Invoice not found", 404);

  // Taking more than the bill is worth is a data-entry slip, not a business
  // case — a rupee of slack absorbs rounding on the GST.
  const { outstanding } = settlementOf(invoice, invoice.payments);
  if (outstanding <= 0.5) return fail("This invoice is already paid in full", 409);
  if (data.amount > outstanding + 1) {
    return fail(
      `That is more than the ₹${outstanding.toFixed(2)} still outstanding on this invoice`,
      422,
    );
  }
  // Nor can the client withhold more tax than the instalment itself.
  if ((data.tdsDeducted ?? 0) > data.amount) {
    return fail("The TDS cannot be more than the amount being settled", 422);
  }

  const payment = await recordPayment(id, data);
  if (!payment) return fail("Invoice not found", 404);

  // The receipt for *this* payment goes to the client's inbox.
  const receiptEmail = await sendReceiptEmail(id, payment.id);
  const after = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { orderBy: { paidDate: "asc" } }, client: true },
  });
  return ok(
    {
      payment,
      invoice: after,
      settlement: settlementOf(after!, after!.payments),
      ...(receiptEmail ? { receiptEmail } : {}),
    },
    201,
  );
});
