import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { fetchReceipts } from "@/lib/receipts";
import { buildReceiptRegisterPdf } from "@/lib/pdf/register";

// Printable receipt register for the selected period.
export const GET = route(async (req) => {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const { label, receipts, totals } = await fetchReceipts(searchParams);
  const bytes = await buildReceiptRegisterPdf(label, receipts, totals);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-register.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
