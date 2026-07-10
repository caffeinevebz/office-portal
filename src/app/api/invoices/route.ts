import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { invoiceCreateSchema } from "@/lib/validation";
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
      organization: { select: { id: true, name: true } },
    },
  });
  return ok(invoices);
});

export const POST = route(async (req) => {
  await requirePermission("manageInvoices");
  const data = await parse(req, invoiceCreateSchema);
  const invoice = await prisma.invoice.create({
    data: {
      ...data,
      issueDate: data.issueDate ?? new Date(),
      paidDate: data.status === "Paid" ? new Date() : null,
    },
    include: { client: true },
  });
  return ok(invoice, 201);
});
