import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { fetchReceipts } from "@/lib/receipts";
import { backfillPayments } from "@/lib/payments";
import { buildReceiptRegisterPdf } from "@/lib/pdf/register";

// Printable receipt register for the selected period — under the selected
// firm's letterhead, or grouped per firm across all of them.
export const GET = route(async (req) => {
  await requirePermission("viewInvoices");
  const { searchParams } = new URL(req.url);
  await backfillPayments();
  const { label, orgId, receipts, totals } = await fetchReceipts(searchParams);
  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId } }) : null;
  const bytes = await buildReceiptRegisterPdf(label, receipts, totals, org);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-register.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
