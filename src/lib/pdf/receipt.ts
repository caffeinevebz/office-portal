import "server-only";
import { rupeesInWords } from "./words";
import { taxBreakdown, letterheadFor, billedParty, type InvoiceForPdf } from "./invoice";
import type { Payment } from "@prisma/client";

/** The receipt a payment produces. A bill settled in instalments has one per
 *  instalment, each acknowledging its own amount and the balance left. */
export type PaymentForPdf = Payment;
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

/** Fallback receipt number for a payment that somehow has none stored. */
export function receiptNumber(inv: InvoiceForPdf, payment?: PaymentForPdf | null): string {
  if (payment?.receiptNumber) return payment.receiptNumber;
  if (inv.receiptNumber) return inv.receiptNumber;
  const n = inv.invoiceNumber;
  // Insert an "R" before the trailing sequence, e.g. APSB/26-27/001 → …/R001.
  const m = n.match(/^(.*\/)(\d+)$/);
  if (m) return `${m[1]}R${m[2]}`;
  return n.startsWith("INV-") ? n.replace(/^INV-/, "RCT-") : `RCT-${n}`;
}

/** Human description of how the payment came in, from the recorded mode. */
export function paymentNarration(p: PaymentForPdf, paidOn: Date): string[] {
  const mode = p.paymentMode;
  if (!mode) return [];
  if (mode === "Cheque") {
    const bits = [
      p.chequeNumber ? `Cheque No. ${p.chequeNumber}` : null,
      p.chequeDate ? `dated ${fmtDate(p.chequeDate)}` : null,
      p.chequeBank ? `drawn on ${p.chequeBank}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return bits ? [`Cheque Details`, bits] : [];
  }
  if (mode !== "Cash" && p.transactionRef) {
    return ["Transaction", `${p.transactionRef} dated ${fmtDate(paidOn)}`];
  }
  return [];
}

export async function buildReceiptPdf(
  inv: InvoiceForPdf,
  payment?: PaymentForPdf | null,
  /** What the client still owed after this payment — printed when non-zero. */
  balanceAfter = 0,
): Promise<Uint8Array> {
  const pdf = await createA4();
  const { page, reg, bold } = pdf;
  const right = A4.width - MARGIN;
  const lh = await letterheadFor(inv);

  const partial = balanceAfter > 0.5;
  const title =
    inv.kind === "Reimbursement"
      ? "REIMBURSEMENT RECEIPT"
      : partial
        ? "PAYMENT RECEIPT (ON ACCOUNT)"
        : "PAYMENT RECEIPT";
  let y = await firmHeader(pdf, title, lh);
  const tax = taxBreakdown(inv, lh.stateCode);
  const paidOn = payment?.paidDate ?? inv.paidDate ?? new Date();

  // What this receipt acknowledges: the instalment settled, less any TDS the
  // client withheld out of it, which is the cash actually received.
  const settled = payment ? payment.amount : tax.grand;
  const tds = payment ? (payment.tdsDeducted ?? 0) : (inv.tdsDeducted ?? 0);
  const net = Math.max(0, settled - tds);

  const party = billedParty(inv);
  // Facts rows: receipt basics + how the payment came in.
  const facts: [string, string][] = [
    ["Receipt No.", receiptNumber(inv, payment)],
    ["Receipt Date", fmtDate(paidOn)],
    ["Against Invoice", `${inv.invoiceNumber} dated ${fmtDate(inv.issueDate)}`],
  ];
  const mode = payment?.paymentMode ?? inv.paymentMode;
  if (mode) facts.push(["Mode of Payment", mode]);
  const narration = payment ? paymentNarration(payment, paidOn) : [];
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
  const via = mode ? (mode === "Cash" ? " in cash" : ` by ${mode}`) : "";
  const tdsNote =
    tds > 0 ? ` after TDS of ${money(tds)} deducted at source (against ${money(settled)})` : "";
  // A part payment must say so on its face, and say what is still due.
  const onAccount = partial ? " on account" : "";
  const paragraphs = [
    `Received with thanks from ${party.name}${
      party.address ? `, ${party.address}` : ""
    }, the sum of ${money(net)} (${rupeesInWords(net)})${via}${onAccount} against invoice ${
      inv.invoiceNumber
    } towards ${inv.description?.trim() || "professional services rendered"}${tdsNote}.`,
  ];
  if (partial) {
    paragraphs.push(
      `This is a part payment. Of the invoice value of ${money(tax.grand)}, ${money(
        settled,
      )} stands settled by this receipt and ${money(balanceAfter)} remains outstanding.`,
    );
  }
  for (const p of paragraphs) {
    for (const line of wrap(p, reg, 10.5, right - MARGIN)) {
      text(page, line, { x: MARGIN, y, size: 10.5, font: reg });
      y -= 16;
    }
  }

  // Settlement summary whenever the receipt is not simply "the whole bill in
  // cash" — TDS withheld, or a balance still to come.
  if (tds > 0 || partial) {
    y -= 10;
    const rows: [string, string, boolean][] = [
      ["Invoice amount", money(tax.grand), false],
      // Only worth a line of its own when TDS makes it differ from the cash.
      ...(tds > 0
        ? ([
            ["Settled by this receipt", money(settled), false],
            ["Less: TDS deducted at source", money(tds), false],
          ] as [string, string, boolean][])
        : []),
      ["Amount received", money(net), true],
      ...(partial
        ? ([["Balance outstanding", money(balanceAfter), false]] as [string, string, boolean][])
        : []),
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
  const aside = [
    tds > 0 ? `TDS ${money(tds)} deducted at source by the client.` : null,
    partial ? `${money(balanceAfter)} still outstanding on invoice ${inv.invoiceNumber}.` : null,
  ].filter(Boolean);
  if (aside.length > 0) {
    let ay = y - 13;
    for (const line of aside) {
      text(page, line!, { x: MARGIN + 212, y: ay, size: 8, font: reg, color: MUTED });
      ay -= 11;
    }
  }

  y -= 60;
  text(page, "Payment received against professional fees. Receipt is subject to realisation of funds.", {
    x: MARGIN,
    y,
    size: 8,
    font: reg,
    color: FAINT,
  });

  await signatureAndFooter(pdf, 168, lh.name, lh);
  return pdf.doc.save();
}
