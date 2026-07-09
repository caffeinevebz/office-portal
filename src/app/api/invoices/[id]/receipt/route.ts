import { prisma } from "@/lib/prisma";
import { fail, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { buildReceiptPdf, receiptNumber } from "@/lib/pdf/receipt";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!invoice) return fail("Invoice not found", 404);
  if (invoice.status !== "Paid") {
    return fail("A receipt can only be issued for a paid invoice", 400);
  }

  const bytes = await buildReceiptPdf(invoice);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receiptNumber(invoice.invoiceNumber)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
