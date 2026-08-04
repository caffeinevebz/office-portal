import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { fetchReceipts } from "@/lib/receipts";

// The receipt register: money actually received (paid invoices by payment
// date) for a financial year, a month, or a custom period.
export const GET = route(async (req) => {
  await requirePermission("viewInvoices");
  const { searchParams } = new URL(req.url);
  const data = await fetchReceipts(searchParams);
  return ok(data);
});
