import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { invoiceCreateSchema } from "@/lib/validation";
import { nextInvoiceNumber, nextReceiptNumber, orgForInvoice } from "@/lib/numbering";
import { sendReceiptEmail } from "@/lib/receipt-email";
import { backfillPayments, recordPayment } from "@/lib/payments";
import { invoiceGross } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const GET = route(async (req) => {
  await requirePermission("viewInvoices");
  // Invoices paid under the old one-payment-per-bill model become Payment
  // rows on first read. Runs once per process and skips anything already
  // migrated, so the list stays cheap.
  await backfillPayments();
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
        include: { task: { select: { id: true, title: true, category: true } }, tasks: { select: { id: true, title: true, category: true } } },
      },
      // What has actually been received — the rows drive the status badge and
      // the balance shown against a part-paid bill.
      payments: { orderBy: { paidDate: "asc" } },
    },
  });
  return ok(invoices);
});

export const POST = route(async (req) => {
  await requirePermission("manageInvoices");
  const { lineItems, ...data } = await parse(req, invoiceCreateSchema);
  const issueDate = data.issueDate ?? new Date();
  const org = await orgForInvoice(data.organizationId);
  // Raising a bill already settled: the money is recorded as a payment below,
  // which is what then sets the status — nothing here writes it by hand.
  const paid = data.status === "Paid";
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
    try {
      const invoice = await prisma.invoice.create({
        data: {
          ...data,
          amount,
          invoiceNumber,
          issueDate,
          // Left unset: a bill created as Paid gets its payment recorded
          // straight after, and that is what stamps the date.
          status: paid ? "Sent" : data.status,
          lineItems:
            lineItems && lineItems.length
              ? {
                  create: lineItems.map(({ id: _id, taskIds, ...li }) => ({
                    ...li,
                    // Lead task stays on taskId; the full set connects via m-n.
                    taskId: li.taskId || taskIds?.[0] || null,
                    tasks: taskIds?.length
                      ? { connect: taskIds.map((tid) => ({ id: tid })) }
                      : undefined,
                  })),
                }
              : undefined,
        },
        include: {
          client: true,
          tradeName: true,
          lineItems: { include: { task: { select: { id: true, title: true, category: true } }, tasks: { select: { id: true, title: true, category: true } } } },
        },
      });
      // Created directly as Paid → record the money and send the receipt.
      if (paid) {
        const payment = await recordPayment(invoice.id, {
          amount: invoiceGross(invoice.amount, invoice.taxRate, invoice.gstMode),
          tdsDeducted: data.tdsDeducted ?? null,
          paidDate: data.paidDate ?? new Date(),
          paymentMode: data.paymentMode ?? null,
          chequeNumber: data.chequeNumber ?? null,
          chequeDate: data.chequeDate ?? null,
          chequeBank: data.chequeBank ?? null,
          transactionRef: data.transactionRef ?? null,
        });
        const receiptEmail = payment ? await sendReceiptEmail(invoice.id, payment.id) : undefined;
        const settled = await prisma.invoice.findUnique({
          where: { id: invoice.id },
          include: {
            client: true,
            tradeName: true,
            lineItems: { include: { task: { select: { id: true, title: true, category: true } }, tasks: { select: { id: true, title: true, category: true } } } },
            payments: { orderBy: { paidDate: "asc" } },
          },
        });
        return ok(receiptEmail ? { ...settled, receiptEmail } : settled, 201);
      }
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
