import "server-only";
import { rupeesInWords } from "./words";
import { taxBreakdown, letterheadFor, billedParty, type InvoiceForPdf } from "./invoice";
import {
  A4,
  MARGIN,
  MUTED,
  FAINT,
  FILL,
  INK,
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

/** Human description of how the payment came in, from the recorded mode. */
export function paymentNarration(inv: InvoiceForPdf, paidOn: Date): string[] {
  const mode = inv.paymentMode;
  if (!mode) return [];
  if (mode === "Cheque") {
    const bits = [
      inv.chequeNumber ? `Cheque No. ${inv.chequeNumber}` : null,
      inv.chequeDate ? `dated ${fmtDate(inv.chequeDate)}` : null,
      inv.chequeBank ? `drawn on ${inv.chequeBank}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return bits ? [`Cheque Details`, bits] : [];
  }
  if (mode !== "Cash" && inv.transactionRef) {
    return ["Transaction", `${inv.transactionRef} dated ${fmtDate(paidOn)}`];
  }
  return [];
}

export async function buildReceiptPdf(inv: InvoiceForPdf): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;
  const lh = await letterheadFor(inv);

  let y = await firmHeader(pdf, "PAYMENT RECEIPT", lh);
  const tax = taxBreakdown(inv, lh.stateCode);
  const paidOn = inv.paidDate ?? new Date();

  // TDS the client withheld: the receipt acknowledges the net amount received
  // and discloses the deduction against the gross invoice value.
  const tds = inv.tdsDeducted ?? 0;
  const net = Math.max(0, tax.grand - tds);

  const party = billedParty(inv);
  // Facts rows: receipt basics + how the payment came in.
  const facts: [string, string][] = [
    ["Receipt No.", receiptNumber(inv)],
    ["Receipt Date", fmtDate(paidOn)],
    ["Against Invoice", `${inv.invoiceNumber} dated ${fmtDate(inv.issueDate)}`],
  ];
  if (inv.paymentMode) facts.push(["Mode of Payment", inv.paymentMode]);
  const narration = paymentNarration(inv, paidOn);
  if (narration.length === 2) facts.push([narration[0], narration[1]]);

  for (const [k, v] of facts) {
    text(page, k, { x: MARGIN, y, size: 9, font: reg, color: MUTED });
    text(page, v, { x: MARGIN + 110, y, size: 9, font: bold });
    y -= 15;
  }

  y -= 14;
  hline(page, MARGIN, right, y);
  y -= 28;

  // Narrative body
  const via = inv.paymentMode
    ? inv.paymentMode === "Cash"
      ? " in cash"
      : ` by ${inv.paymentMode}`
    : "";
  const tdsNote =
    tds > 0
      ? ` after TDS of ${money(tds)} deducted at source (invoice amount ${money(tax.grand)})`
      : "";
  const paragraphs = [
    `Received with thanks from ${party.name}${
      party.address ? `, ${party.address}` : ""
    }, the sum of ${money(net)} (${rupeesInWords(net)})${via} against invoice ${
      inv.invoiceNumber
    } towards ${inv.description?.trim() || "professional services rendered"}${tdsNote}.`,
  ];
  for (const p of paragraphs) {
    for (const line of wrap(p, reg, 10.5, right - MARGIN)) {
      text(page, line, { x: MARGIN, y, size: 10.5, font: reg });
      y -= 16;
    }
  }

  // Settlement summary when TDS was withheld.
  if (tds > 0) {
    y -= 10;
    const rows: [string, string, boolean][] = [
      ["Invoice amount", money(tax.grand), false],
      ["Less: TDS deducted at source", money(tds), false],
      ["Amount received", money(net), true],
    ];
    for (const [label, value, strong] of rows) {
      text(page, label, { x: MARGIN, y, size: 9.5, font: strong ? bold : reg, color: strong ? INK : MUTED });
      text(page, value, { x: MARGIN + 260, y, size: 9.5, font: strong ? bold : reg, align: "right" });
      if (strong) hline(page, MARGIN, MARGIN + 264, y + 12);
      y -= 15;
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
  text(page, money(net), { x: MARGIN + 10, y: y - 13, size: 14, font: bold });
  if (tds > 0) {
    text(page, `TDS ${money(tds)} deducted at source by the client.`, {
      x: MARGIN + 212,
      y: y - 13,
      size: 8,
      font: reg,
      color: MUTED,
    });
  }

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
