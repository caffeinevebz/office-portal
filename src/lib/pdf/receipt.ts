import "server-only";
import type { Invoice, Client } from "@prisma/client";
import { rupeesInWords } from "./words";
import { taxBreakdown } from "./invoice";
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

type InvoiceWithClient = Invoice & { client: Client };

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

/** Receipt number derived 1:1 from the invoice number (INV-… -> RCT-…). */
export function receiptNumber(invoiceNumber: string): string {
  return invoiceNumber.startsWith("INV-")
    ? invoiceNumber.replace(/^INV-/, "RCT-")
    : `RCT-${invoiceNumber}`;
}

export async function buildReceiptPdf(inv: InvoiceWithClient): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;

  let y = firmHeader(pdf, "PAYMENT RECEIPT");
  const tax = taxBreakdown(inv);
  const paidOn = inv.paidDate ?? new Date();

  // Facts row
  const facts: [string, string][] = [
    ["Receipt No.", receiptNumber(inv.invoiceNumber)],
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
    `Received with thanks from ${inv.client.name}${
      inv.client.address ? `, ${inv.client.address}` : ""
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

  signatureAndFooter(pdf, 168);
  return pdf.doc.save();
}
