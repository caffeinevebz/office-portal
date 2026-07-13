import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { invoiceUpdateSchema } from "@/lib/validation";
import { nextReceiptNumber, orgForInvoice } from "@/lib/numbering";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.InvoiceUncheckedUpdateInput) {
  const patch: Prisma.InvoiceUncheckedUpdateInput = { ...data };
  if (typeof data.status === "string") {
    if (data.status === "Paid") {
      const current = await prisma.invoice.findUnique({ where: { id } });
      const paidDate = current?.paidDate ?? new Date();
      if (current && !current.paidDate) patch.paidDate = paidDate;
      // Assign a receipt number the first time it is marked Paid.
      if (current && !current.receiptNumber) {
        const org = await orgForInvoice(current.organizationId);
        patch.receiptNumber = await nextReceiptNumber(org, paidDate);
      }
    } else {
      patch.paidDate = null;
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

export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status) return fail("status is required");
  const invoice = await applyUpdate(id, { status: body.status });
  return ok(invoice);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  await prisma.invoice.delete({ where: { id } });
  return ok({ ok: true });
});
