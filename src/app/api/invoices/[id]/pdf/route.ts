import { prisma } from "@/lib/prisma";
import { fail, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { buildInvoicePdf } from "@/lib/pdf/invoice";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, organization: true, tradeName: true, lineItems: { orderBy: { createdAt: "asc" } } },
  });
  if (!invoice) return fail("Invoice not found", 404);

  const bytes = await buildInvoicePdf(invoice);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
