import "server-only";
import { rgb } from "pdf-lib";
import type { Invoice, Client } from "@prisma/client";
import { FIRM, FIRM_STATE_CODE } from "@/lib/firm";
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

type InvoiceWithClient = Invoice & { client: Client };

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** GST breakdown: intra-state (CGST+SGST) vs inter-state (IGST) by GSTIN state code. */
export function taxBreakdown(inv: InvoiceWithClient) {
  const clientState = inv.client.gstin?.slice(0, 2);
  const interState = !!clientState && clientState !== FIRM_STATE_CODE;
  const taxable = inv.amount;
  const taxTotal = (taxable * inv.taxRate) / 100;
  const gross = taxable + taxTotal;
  const grand = Math.round(gross);
  const roundOff = grand - gross;
  return { interState, taxable, taxTotal, gross, grand, roundOff, rate: inv.taxRate };
}

export async function buildInvoicePdf(inv: InvoiceWithClient): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;

  if (inv.status === "Paid") watermark(page, "PAID", rgb(0.02, 0.59, 0.41));
  else if (inv.status === "Draft") watermark(page, "DRAFT", rgb(0.42, 0.45, 0.5));
  else if (inv.status === "Overdue") watermark(page, "OVERDUE", rgb(0.88, 0.11, 0.28));

  let y = firmHeader(pdf, "TAX INVOICE");

  // ---- Meta: Bill To (left) & invoice facts (right) ----
  const c = inv.client;
  const tax = taxBreakdown(inv);

  text(page, "BILLED TO", { x: MARGIN, y, size: 7.5, font: bold, color: FAINT });
  const factsX = 340;
  const facts: [string, string][] = [
    ["Invoice No.", inv.invoiceNumber],
    ["Invoice Date", fmtDate(inv.issueDate)],
    ["Due Date", fmtDate(inv.dueDate)],
    ["Place of Supply", tax.interState ? `Inter-state (IGST)` : `Maharashtra (${FIRM_STATE_CODE})`],
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

  const desc = inv.description?.trim() || "Professional services rendered";
  const descLines = wrap(desc, reg, 9.5, colSac - MARGIN - 24);
  const rowTop = y;
  for (const line of descLines) {
    text(page, line, { x: MARGIN + 8, y, size: 9.5, font: reg });
    y -= 12;
  }
  text(page, FIRM.sacCode, { x: colSac, y: rowTop, size: 9.5, font: reg, color: MUTED });
  text(page, money(tax.taxable), { x: right - 8, y: rowTop, size: 9.5, font: reg, align: "right" });
  y -= rowPadding;
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
  if (tax.rate > 0) {
    if (tax.interState) {
      totalRow(`IGST @ ${tax.rate}%`, money(tax.taxTotal));
    } else {
      totalRow(`CGST @ ${tax.rate / 2}%`, money(tax.taxTotal / 2));
      totalRow(`SGST @ ${tax.rate / 2}%`, money(tax.taxTotal / 2));
    }
  }
  if (Math.abs(tax.roundOff) >= 0.005) {
    totalRow("Round off", (tax.roundOff > 0 ? "+" : "-") + money(Math.abs(tax.roundOff)));
  }
  y -= 5;
  page.drawRectangle({ x: labelX - 10, y: y - 7, width: right - labelX + 10, height: 22, color: FILL });
  totalRow("TOTAL", money(tax.grand), { bold: true, big: true });

  // Amount in words (left of the totals block, full width below).
  y -= 6;
  text(page, "Amount in words", { x: MARGIN, y, size: 7.5, font: bold, color: FAINT });
  y -= 12;
  for (const line of wrap(rupeesInWords(tax.grand), reg, 9, right - MARGIN)) {
    text(page, line, { x: MARGIN, y, size: 9, font: reg });
    y -= 12;
  }

  // ---- Bank details + signature ----
  const bankTop = 168;
  text(page, "PAYMENT DETAILS", { x: MARGIN, y: bankTop, size: 7.5, font: bold, color: FAINT });
  const bank = [
    ["Bank", FIRM.bank.name],
    ["Account No.", FIRM.bank.account],
    ["IFSC", FIRM.bank.ifsc],
    ["UPI", FIRM.bank.upi],
  ];
  let by = bankTop - 14;
  for (const [k, v] of bank) {
    text(page, k, { x: MARGIN, y: by, size: 8.5, font: reg, color: MUTED });
    text(page, v, { x: MARGIN + 70, y: by, size: 8.5, font: bold });
    by -= 12;
  }
  by -= 6;
  for (const line of wrap(FIRM.invoiceNote, reg, 8, 300)) {
    text(page, line, { x: MARGIN, y: by, size: 8, font: reg, color: FAINT });
    by -= 10;
  }

  signatureAndFooter(pdf, bankTop);
  return pdf.doc.save();
}
