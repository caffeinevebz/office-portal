import "server-only";
import { rgb } from "pdf-lib";
import type { Invoice, Client, Organization, TradeName, InvoiceLineItem } from "@prisma/client";
import { getDefaultOrg, toLetterhead, type Letterhead } from "@/lib/org";
import { rupeesInWords } from "./words";
import {
  A4,
  MARGIN,
  INK,
  MUTED,
  FAINT,
  FILL,
  createA4,
  text,
  wrap,
  hline,
  money,
  watermark,
  firmHeader,
  signatureAndFooter,
} from "./layout";

export type InvoiceForPdf = Invoice & {
  client: Client;
  organization?: Organization | null;
  tradeName?: TradeName | null;
  lineItems?: InvoiceLineItem[];
};

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** The party billed on an invoice: the chosen trade name, else the client's
 *  own details (a trade name may carry its own GSTIN / PAN / address). */
export function billedParty(inv: InvoiceForPdf) {
  const t = inv.tradeName;
  return {
    name: t?.name ?? inv.client.name,
    gstin: t?.gstin ?? inv.client.gstin,
    pan: t?.pan ?? inv.client.pan,
    address: t?.address ?? inv.client.address,
    contactPerson: inv.client.contactPerson,
  };
}

/**
 * GST breakdown for an invoice. `gstMode` overrides the automatic
 * intra/inter-state detection: Auto (compare the billed party's GSTIN state
 * with the billing organization's), Intra (CGST+SGST), Inter (IGST), None.
 */
export function taxBreakdown(inv: InvoiceForPdf, orgStateCode: string | null) {
  const mode = inv.gstMode ?? "Auto";
  const none = mode === "None" || inv.taxRate <= 0;

  const clientState = billedParty(inv).gstin?.slice(0, 2);
  const interState =
    mode === "Inter"
      ? true
      : mode === "Intra"
        ? false
        : !!clientState && !!orgStateCode && clientState !== orgStateCode;

  const taxable = inv.amount;
  const taxTotal = none ? 0 : (taxable * inv.taxRate) / 100;
  const gross = taxable + taxTotal;
  const grand = Math.round(gross);
  const roundOff = grand - gross;
  return { none, interState, taxable, taxTotal, gross, grand, roundOff, rate: inv.taxRate };
}

/** Letterhead for an invoice: its own organization, else the firm default. */
export async function letterheadFor(inv: InvoiceForPdf): Promise<Letterhead> {
  return toLetterhead(inv.organization ?? (await getDefaultOrg()));
}

export async function buildInvoicePdf(inv: InvoiceForPdf): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;
  const lh = await letterheadFor(inv);

  if (inv.status === "Paid") watermark(page, "PAID", rgb(0.02, 0.59, 0.41));
  else if (inv.status === "Draft") watermark(page, "DRAFT", rgb(0.42, 0.45, 0.5));
  else if (inv.status === "Overdue") watermark(page, "OVERDUE", rgb(0.88, 0.11, 0.28));

  // A reimbursement bill recovers out-of-pocket expenses — it is not a fee
  // invoice, and its title says so.
  const title = inv.kind === "Reimbursement" ? "REIMBURSEMENT BILL" : "TAX INVOICE";
  let y = await firmHeader(pdf, title, lh);

  // ---- Meta: Bill To (left) & invoice facts (right) ----
  const c = billedParty(inv);
  const tax = taxBreakdown(inv, lh.stateCode);

  text(page, "BILLED TO", { x: MARGIN, y, size: 7.5, font: bold, color: FAINT });
  const factsX = 340;
  const supply = tax.none
    ? "GST not applicable"
    : tax.interState
      ? "Inter-state (IGST)"
      : `Intra-state${lh.stateCode ? ` (${lh.stateCode})` : ""}`;
  const facts: [string, string][] = [
    ["Invoice No.", inv.invoiceNumber],
    ["Invoice Date", fmtDate(inv.issueDate)],
    ["Due Date", fmtDate(inv.dueDate)],
    ["Place of Supply", supply],
  ];
  let fy = y;
  for (const [k, v] of facts) {
    text(page, k, { x: factsX, y: fy, size: 8.5, font: reg, color: MUTED });
    text(page, v, { x: right, y: fy, size: 8.5, font: bold, align: "right" });
    fy -= 13;
  }

  y -= 14;
  text(page, c.name, { x: MARGIN, y, size: 11, font: bold });
  y -= 13;
  if (c.address) {
    for (const line of wrap(c.address, reg, 8.5, 250)) {
      text(page, line, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
      y -= 11;
    }
  }
  if (c.contactPerson) {
    text(page, `Attn: ${c.contactPerson}`, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
    y -= 11;
  }
  const ids = [c.pan ? `PAN: ${c.pan}` : null, c.gstin ? `GSTIN: ${c.gstin}` : null]
    .filter(Boolean)
    .join("   ");
  if (ids) {
    text(page, ids, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
    y -= 11;
  }

  y = Math.min(y, fy) - 18;

  // ---- Line items table ----
  const colSac = 380;
  const rowPadding = 9;
  page.drawRectangle({
    x: MARGIN, y: y - 6, width: right - MARGIN, height: 20, color: FILL,
  });
  text(page, "DESCRIPTION OF SERVICES", { x: MARGIN + 8, y, size: 8, font: bold, color: MUTED });
  text(page, "SAC", { x: colSac, y, size: 8, font: bold, color: MUTED });
  text(page, "AMOUNT", { x: right - 8, y, size: 8, font: bold, color: MUTED, align: "right" });
  y -= 6;
  hline(page, MARGIN, right, y);
  y -= 16;

  // One row per service line; fall back to the single description/amount when
  // an invoice has no line items (older invoices).
  const items: { description: string; amount: number; sacCode: string | null }[] =
    inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map((li) => ({ description: li.description, amount: li.amount, sacCode: li.sacCode }))
      : [{ description: inv.description?.trim() || "Professional services rendered", amount: tax.taxable, sacCode: null }];

  for (const item of items) {
    const descLines = wrap(item.description || "Professional services", reg, 9.5, colSac - MARGIN - 24);
    const rowTop = y;
    for (const line of descLines) {
      text(page, line, { x: MARGIN + 8, y, size: 9.5, font: reg });
      y -= 12;
    }
    text(page, item.sacCode || lh.sacCode, { x: colSac, y: rowTop, size: 9.5, font: reg, color: MUTED });
    text(page, money(item.amount), { x: right - 8, y: rowTop, size: 9.5, font: reg, align: "right" });
    y -= 5;
  }
  y -= rowPadding - 5;
  hline(page, MARGIN, right, y);

  // ---- Totals ----
  const labelX = 360;
  y -= 18;
  const totalRow = (label: string, value: string, opts?: { bold?: boolean; big?: boolean }) => {
    const f = opts?.bold ? bold : reg;
    const size = opts?.big ? 11 : 9;
    text(page, label, { x: labelX, y, size, font: f, color: opts?.bold ? INK : MUTED });
    text(page, value, { x: right - 8, y, size, font: f, align: "right" });
    y -= opts?.big ? 20 : 15;
  };

  totalRow("Taxable value", money(tax.taxable));
  if (tax.none) {
    totalRow("GST", "Not applicable");
  } else if (tax.interState) {
    totalRow(`IGST @ ${tax.rate}%`, money(tax.taxTotal));
  } else {
    totalRow(`CGST @ ${tax.rate / 2}%`, money(tax.taxTotal / 2));
    totalRow(`SGST @ ${tax.rate / 2}%`, money(tax.taxTotal / 2));
  }
  if (Math.abs(tax.roundOff) >= 0.005) {
    totalRow("Round off", (tax.roundOff > 0 ? "+" : "-") + money(Math.abs(tax.roundOff)));
  }
  y -= 5;
  page.drawRectangle({ x: labelX - 10, y: y - 7, width: right - labelX + 10, height: 22, color: FILL });
  totalRow("TOTAL", money(tax.grand), { bold: true, big: true });

  // Amount in words (full width below).
  y -= 6;
  text(page, "Amount in words", { x: MARGIN, y, size: 7.5, font: bold, color: FAINT });
  y -= 12;
  for (const line of wrap(rupeesInWords(tax.grand), reg, 9, right - MARGIN)) {
    text(page, line, { x: MARGIN, y, size: 9, font: reg });
    y -= 12;
  }

  // ---- Bank details + signature ----
  const bankTop = 168;
  const bank: [string, string][] = [];
  if (lh.bank.name) bank.push(["Bank", lh.bank.name]);
  if (lh.bank.account) bank.push(["Account No.", lh.bank.account]);
  if (lh.bank.ifsc) bank.push(["IFSC", lh.bank.ifsc]);
  if (lh.bank.upi) bank.push(["UPI", lh.bank.upi]);

  if (bank.length > 0) {
    text(page, "PAYMENT DETAILS", { x: MARGIN, y: bankTop, size: 7.5, font: bold, color: FAINT });
  }
  let by = bankTop - 14;
  for (const [k, v] of bank) {
    text(page, k, { x: MARGIN, y: by, size: 8.5, font: reg, color: MUTED });
    text(page, v, { x: MARGIN + 70, y: by, size: 8.5, font: bold });
    by -= 12;
  }
  if (lh.invoiceNote) {
    by -= 6;
    for (const line of wrap(lh.invoiceNote, reg, 8, 300)) {
      text(page, line, { x: MARGIN, y: by, size: 8, font: reg, color: FAINT });
      by -= 10;
    }
  }

  signatureAndFooter(pdf, bankTop, lh.name);
  return pdf.doc.save();
}
