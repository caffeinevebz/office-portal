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
    },
  });
  return ok(invoices);
});

export const POST = route(async (req) => {
  await requirePermission("manageInvoices");
  const data = await parse(req, invoiceCreateSchema);
  const issueDate = data.issueDate ?? new Date();
  const org = await orgForInvoice(data.organizationId);
  const paid = data.status === "Paid";
  const paidDate = paid ? new Date() : null;

  // Auto-generate the invoice number (and receipt number if already paid),
  // retrying on the rare unique-collision from concurrent creates.
  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber = data.invoiceNumber?.trim() || (await nextInvoiceNumber(org, issueDate));
    const receiptNumber = paid ? await nextReceiptNumber(org, paidDate!) : null;
    try {
      const invoice = await prisma.invoice.create({
        data: { ...data, invoiceNumber, issueDate, paidDate, receiptNumber },
        include: { client: true, tradeName: true },
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
