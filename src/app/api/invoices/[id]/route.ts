import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { invoiceUpdateSchema, invoicePaymentSchema } from "@/lib/validation";
import { nextReceiptNumber, orgForInvoice } from "@/lib/numbering";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.InvoiceUncheckedUpdateInput) {
  const patch: Prisma.InvoiceUncheckedUpdateInput = { ...data };
  if (typeof data.status === "string") {
    if (data.status === "Paid") {
      const current = await prisma.invoice.findUnique({ where: { id } });
      // Honour an explicit payment date from the record-payment form.
      const paidDate =
        (patch.paidDate instanceof Date ? patch.paidDate : null) ??
        current?.paidDate ??
        new Date();
      if (current && (!current.paidDate || patch.paidDate)) patch.paidDate = paidDate;
      // Assign a receipt number the first time it is marked Paid —
      // reimbursement bills draw from their own EXP receipt series.
      if (current && !current.receiptNumber) {
        const org = await orgForInvoice(current.organizationId);
        const kind = current.kind === "Reimbursement" ? "Reimbursement" : "Fee";
        patch.receiptNumber = await nextReceiptNumber(org, paidDate, kind);
      }
    } else {
      // Moving off Paid clears the payment record.
      patch.paidDate = null;
      patch.paymentMode = null;
      patch.chequeNumber = null;
      patch.chequeDate = null;
      patch.chequeBank = null;
      patch.transactionRef = null;
      patch.tdsDeducted = null;
    }
  }
  return prisma.invoice.update({
    where: { id },
    data: patch,
    include: {
      client: true,
      tradeName: true,
      lineItems: { include: { task: { select: { id: true, title: true, category: true } } } },
    },
  });
}

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const { lineItems, ...data } = await parse(req, invoiceUpdateSchema);
  // Sync line items when the form provides them, and keep `amount` = their sum.
  if (lineItems) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceLineItem.findMany({ where: { invoiceId: id }, select: { id: true } });
      const keep = new Set(lineItems.filter((l) => l.id).map((l) => l.id));
      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (remove.length) await tx.invoiceLineItem.deleteMany({ where: { id: { in: remove } } });
      for (const { id: lid, ...fields } of lineItems) {
        if (lid) await tx.invoiceLineItem.update({ where: { id: lid }, data: fields });
        else await tx.invoiceLineItem.create({ data: { ...fields, invoiceId: id } });
      }
    });
    data.amount = lineItems.reduce((s, l) => s + (l.amount || 0), 0);
  }
  const invoice = await applyUpdate(id, data as Prisma.InvoiceUncheckedUpdateInput);
  return ok(invoice);
});

// Quick status change; marking Paid can carry the payment record — mode of
// payment, instrument details (cheque no./date/bank or transaction ref) and
// any TDS the client deducted at source.
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const data = await parse(req, invoicePaymentSchema);
  const invoice = await applyUpdate(id, data as Prisma.InvoiceUncheckedUpdateInput);
  return ok(invoice);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  await prisma.invoice.delete({ where: { id } });
  return ok({ ok: true });
});
