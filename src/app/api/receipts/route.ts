import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { fetchReceipts } from "@/lib/receipts";
import { backfillPayments } from "@/lib/payments";

// The receipt register: money actually received (paid invoices by payment
// date) for a financial year, a month, or a custom period.
export const GET = route(async (req) => {
  await requirePermission("viewInvoices");
  const { searchParams } = new URL(req.url);
  // Legacy invoice-level payments become Payment rows before the
  // register reads them, else pre-migration receipts would go missing.
  await backfillPayments();
  const data = await fetchReceipts(searchParams);
  return ok(data);
});
