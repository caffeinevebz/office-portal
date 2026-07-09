import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { invoiceUpdateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

async function applyUpdate(id: string, data: Prisma.InvoiceUncheckedUpdateInput) {
  const patch: Prisma.InvoiceUncheckedUpdateInput = { ...data };
  if (typeof data.status === "string") {
    if (data.status === "Paid") {
      const current = await prisma.invoice.findUnique({ where: { id } });
      if (current && !current.paidDate) patch.paidDate = new Date();
    } else {
      patch.paidDate = null;
    }
  }
  return prisma.invoice.update({
    where: { id },
    data: patch,
    include: { client: true },
  });
}

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const data = await parse(req, invoiceUpdateSchema);
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
