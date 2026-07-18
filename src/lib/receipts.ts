import "server-only";
import { prisma } from "@/lib/prisma";
import { invoiceGross } from "@/lib/format";

/**
 * Period selection for the receipt register. CA professional income is
 * accounted on receipt basis, so the register slices PAID invoices by their
 * payment date: a financial year, a calendar month, or a custom range.
 */
export function parseReceiptPeriod(searchParams: URLSearchParams): {
  gte: Date | null;
  lt: Date | null;
  label: string;
} {
  const fy = searchParams.get("fy")?.trim();
  const month = searchParams.get("month")?.trim(); // YYYY-MM
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();

  if (fy && /^\d{4}-\d{2}$/.test(fy)) {
    const start = parseInt(fy.slice(0, 4), 10);
    return {
      gte: new Date(start, 3, 1), // 1 Apr
      lt: new Date(start + 1, 3, 1), // to 31 Mar
      label: `FY ${fy} (01 Apr ${start} – 31 Mar ${start + 1})`,
    };
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yy, mm] = month.split("-").map((n) => parseInt(n, 10));
    const gte = new Date(yy, mm - 1, 1);
    const lt = new Date(yy, mm, 1);
    const name = gte.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { gte, lt, label: name };
  }
  if (from || to) {
    const gte = from ? new Date(from) : null;
    let lt: Date | null = null;
    if (to) {
      lt = new Date(to);
      lt.setDate(lt.getDate() + 1); // inclusive "to"
    }
    const f = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const label =
      gte && to
        ? `${f(gte)} – ${f(new Date(to))}`
        : gte
          ? `from ${f(gte)}`
          : `until ${f(new Date(to!))}`;
    return { gte, lt, label };
  }
  return { gte: null, lt: null, label: "All receipts" };
}

export type ReceiptRow = {
  id: string;
  receiptNumber: string | null;
  paidDate: Date;
  invoiceNumber: string;
  clientName: string;
  paymentMode: string | null;
  // Instrument detail: cheque no./date/bank, or the transfer reference.
  detail: string;
  gross: number; // invoice value (incl. GST)
  tds: number; // TDS the client deducted at source
  net: number; // actually received
  // The billing organization (firm) the money was received under — receipt
  // numbering runs per firm, so the register is kept firm-wise.
  orgId: string | null;
  orgName: string;
};

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

/**
 * Paid invoices in the period (by payment date), oldest first, with totals.
 * The register is firm-wise: an `org` param scopes it to one billing
 * organization ("All" spans every firm). Invoices with no organization are
 * billed under the default firm, so they count against it.
 */
export async function fetchReceipts(searchParams: URLSearchParams): Promise<{
  label: string;
  orgId: string | null; // null = all firms
  orgName: string | null;
  receipts: ReceiptRow[];
  totals: { count: number; gross: number; tds: number; net: number };
}> {
  const { gte, lt, label } = parseReceiptPeriod(searchParams);
  const orgParam = searchParams.get("org")?.trim();

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, isDefault: true },
  });
  const defaultOrg = orgs.find((o) => o.isDefault) ?? orgs[0] ?? null;
  const selectedOrg = orgParam && orgParam !== "All" ? (orgs.find((o) => o.id === orgParam) ?? null) : null;

  const invoices = await prisma.invoice.findMany({
    where: {
      status: "Paid",
      paidDate: {
        not: null,
        ...(gte ? { gte } : {}),
        ...(lt ? { lt } : {}),
      },
      ...(selectedOrg
        ? {
            OR: [
              { organizationId: selectedOrg.id },
              // Null-org invoices belong to the default firm.
              ...(selectedOrg.id === defaultOrg?.id ? [{ organizationId: null }] : []),
            ],
          }
        : {}),
    },
    orderBy: { paidDate: "asc" },
    include: {
      client: { select: { name: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  const receipts: ReceiptRow[] = invoices.map((inv) => {
    const gross = Math.round(invoiceGross(inv.amount, inv.taxRate, inv.gstMode));
    const tds = inv.tdsDeducted ?? 0;
    const detail =
      inv.paymentMode === "Cheque"
        ? [
            inv.chequeNumber ? `Chq ${inv.chequeNumber}` : null,
            inv.chequeDate ? fmtDate(inv.chequeDate) : null,
            inv.chequeBank || null,
          ]
            .filter(Boolean)
            .join(" · ")
        : (inv.transactionRef ?? "");
    return {
      id: inv.id,
      receiptNumber: inv.receiptNumber,
      paidDate: inv.paidDate!,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.client.name,
      paymentMode: inv.paymentMode,
      detail,
      gross,
      tds,
      net: Math.max(0, gross - tds),
      orgId: inv.organization?.id ?? defaultOrg?.id ?? null,
      orgName: inv.organization?.name ?? defaultOrg?.name ?? "—",
    };
  });

  const totals = receipts.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      gross: acc.gross + r.gross,
      tds: acc.tds + r.tds,
      net: acc.net + r.net,
    }),
    { count: 0, gross: 0, tds: 0, net: 0 },
  );
  return {
    label,
    orgId: selectedOrg?.id ?? null,
    orgName: selectedOrg?.name ?? null,
    receipts,
    totals,
  };
}
