import "server-only";
import { rupeesInWords } from "./words";
import { taxBreakdown, letterheadFor, billedParty, type InvoiceForPdf } from "./invoice";
import {
  A4,
  MARGIN,
  MUTED,
  FAINT,
  FILL,
  createA4,
  text,
  wrap,
  hline,
  money,
  firmHeader,
  signatureAndFooter,
} from "./layout";

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** Fallback receipt number for legacy invoices without a stored one.
 *  New invoices carry an assigned receiptNumber (PREFIX/FY/RNNN). */
export function receiptNumber(inv: InvoiceForPdf): string {
  if (inv.receiptNumber) return inv.receiptNumber;
  const n = inv.invoiceNumber;
  // Insert an "R" before the trailing sequence, e.g. APSB/26-27/001 → …/R001.
  const m = n.match(/^(.*\/)(\d+)$/);
  if (m) return `${m[1]}R${m[2]}`;
  return n.startsWith("INV-") ? n.replace(/^INV-/, "RCT-") : `RCT-${n}`;
}

export async function buildReceiptPdf(inv: InvoiceForPdf): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;
  const lh = await letterheadFor(inv);

  let y = await firmHeader(pdf, "PAYMENT RECEIPT", lh);
  const tax = taxBreakdown(inv, lh.stateCode);
  const paidOn = inv.paidDate ?? new Date();

  const party = billedParty(inv);
  // Facts row
  const facts: [string, string][] = [
    ["Receipt No.", receiptNumber(inv)],
    ["Receipt Date", fmtDate(paidOn)],
    ["Against Invoice", `${inv.invoiceNumber} dated ${fmtDate(inv.issueDate)}`],
  ];
  for (const [k, v] of facts) {
    text(page, k, { x: MARGIN, y, size: 9, font: reg, color: MUTED });
    text(page, v, { x: MARGIN + 110, y, size: 9, font: bold });
    y -= 15;
  }

  y -= 14;
  hline(page, MARGIN, right, y);
  y -= 28;

  // Narrative body
  const paragraphs = [
    `Received with thanks from ${party.name}${
      party.address ? `, ${party.address}` : ""
    }, the sum of ${money(tax.grand)} (${rupeesInWords(tax.grand)}) against invoice ${
      inv.invoiceNumber
    } towards ${inv.description?.trim() || "professional services rendered"}.`,
  ];
  for (const p of paragraphs) {
    for (const line of wrap(p, reg, 10.5, right - MARGIN)) {
      text(page, line, { x: MARGIN, y, size: 10.5, font: reg });
      y -= 16;
    }
  }

  // Amount box
  y -= 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - 22,
    width: 200,
    height: 38,
    color: FILL,
    borderColor: FAINT,
    borderWidth: 0.8,
  });
  text(page, "AMOUNT RECEIVED", { x: MARGIN + 10, y: y + 4, size: 7, font: bold, color: FAINT });
  text(page, money(tax.grand), { x: MARGIN + 10, y: y - 13, size: 14, font: bold });

  y -= 60;
  text(page, "Payment received against professional fees. Receipt is subject to realisation of funds.", {
    x: MARGIN,
    y,
    size: 8,
    font: reg,
    color: FAINT,
  });

  signatureAndFooter(pdf, 168, lh.name);
  return pdf.doc.save();
}
