import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { invoiceCreateSchema } from "@/lib/validation";
import { nextInvoiceNumber, nextReceiptNumber, orgForInvoice } from "@/lib/numbering";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const clientId = searchParams.get("clientId")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Prisma.InvoiceWhereInput = {};
  if (status && status !== "All") where.status = status;
  if (clientId) where.clientId = clientId;
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { issueDate: "desc" },
    include: {
      client: true,
      tradeName: true,
      organization: { select: { id: true, name: true } },
      lineItems: {
        orderBy: { createdAt: "asc" },
        include: { task: { select: { id: true, title: true, category: true } } },
      },
    },
  });
  return ok(invoices);
});

export const POST = route(async (req) => {
  await requirePermission("manageInvoices");
  const { lineItems, ...data } = await parse(req, invoiceCreateSchema);
  const issueDate = data.issueDate ?? new Date();
  const org = await orgForInvoice(data.organizationId);
  const paid = data.status === "Paid";
  const paidDate = paid ? new Date() : null;
  // The invoice amount is the sum of its line items (falls back to the single
  // amount when no line items are supplied).
  const amount =
    lineItems && lineItems.length
      ? lineItems.reduce((s, li) => s + (li.amount || 0), 0)
      : (data.amount ?? 0);

  // Auto-generate the invoice number (and receipt number if already paid),
  // retrying on the rare unique-collision from concurrent creates.
  // Reimbursement bills number on their own EXP series.
  const kind = data.kind === "Reimbursement" ? "Reimbursement" : "Fee";
  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber =
      data.invoiceNumber?.trim() || (await nextInvoiceNumber(org, issueDate, kind));
    const receiptNumber = paid ? await nextReceiptNumber(org, paidDate!, kind) : null;
    try {
      const invoice = await prisma.invoice.create({
        data: {
          ...data,
          amount,
          invoiceNumber,
          issueDate,
          paidDate,
          receiptNumber,
          lineItems:
            lineItems && lineItems.length
              ? { create: lineItems.map(({ id: _id, ...li }) => li) }
              : undefined,
        },
        include: {
          client: true,
          tradeName: true,
          lineItems: { include: { task: { select: { id: true, title: true, category: true } } } },
        },
      });
      return ok(invoice, 201);
    } catch (e) {
      const code = (e as { code?: string }).code;
      // P2002 = unique constraint; regenerate only for auto numbers.
      if (code === "P2002" && !data.invoiceNumber?.trim() && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
});
