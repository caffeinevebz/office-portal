import "server-only";
import { prisma } from "@/lib/prisma";
import { deriveInitials, fyShort } from "@/lib/constants";

type OrgLike = { invoicePrefix?: string | null; name?: string | null } | null;

/** Firm initials used to build invoice/receipt numbers. */
export function invoicePrefix(org: OrgLike): string {
  return org?.invoicePrefix?.trim() || deriveInitials(org?.name);
}

function maxSeq(numbers: (string | null)[], base: string): number {
  let max = 0;
  for (const n of numbers) {
    if (!n || !n.startsWith(base)) continue;
    const m = n.slice(base.length).match(/^(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * Reimbursement bills run on their own series, marked by an EXP segment
 * (e.g. APSB/EXP/26-27/001) so they never consume — or get mixed into —
 * the professional-fee sequence.
 */
export type InvoiceKind = "Fee" | "Reimbursement";

function seriesPrefix(org: OrgLike, kind: InvoiceKind): string {
  return kind === "Reimbursement"
    ? `${invoicePrefix(org)}/EXP`
    : invoicePrefix(org);
}

/** Next invoice number: PREFIX/FY/NNN, e.g. APSB/26-27/001 (reset each FY). */
export async function nextInvoiceNumber(
  org: OrgLike,
  issueDate = new Date(),
  kind: InvoiceKind = "Fee",
): Promise<string> {
  const base = `${seriesPrefix(org, kind)}/${fyShort(issueDate)}/`;
  const rows = await prisma.invoice.findMany({
    where: { invoiceNumber: { startsWith: base } },
    select: { invoiceNumber: true },
  });
  const seq = maxSeq(rows.map((r) => r.invoiceNumber), base) + 1;
  return `${base}${String(seq).padStart(3, "0")}`;
}

/** Next receipt number: PREFIX/FY/RNNN, e.g. APSB/26-27/R001 (reset each FY). */
export async function nextReceiptNumber(
  org: OrgLike,
  paidDate = new Date(),
  kind: InvoiceKind = "Fee",
): Promise<string> {
  const base = `${seriesPrefix(org, kind)}/${fyShort(paidDate)}/R`;
  const rows = await prisma.invoice.findMany({
    where: { receiptNumber: { startsWith: base } },
    select: { receiptNumber: true },
  });
  const seq = maxSeq(rows.map((r) => r.receiptNumber), base) + 1;
  return `${base}${String(seq).padStart(3, "0")}`;
}

/** Resolve the billing organization for an invoice (its own, else default). */
export async function orgForInvoice(organizationId: string | null | undefined) {
  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (org) return org;
  }
  return prisma.organization.findFirst({ where: { isDefault: true } });
}
