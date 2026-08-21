import "server-only";
import { rgb } from "pdf-lib";
import type { Invoice, Client, Organization, TradeName, InvoiceLineItem } from "@prisma/client";
import { getDefaultOrg, toLetterhead, type Letterhead } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { ensureFirmAssets } from "@/lib/firm-assets-install";
import { firmUpiQr } from "@/lib/upi-qr";
import { rupeesInWords } from "./words";
import {
  A4,
  MARGIN,
  ACCENT,
  SAFFRON,
  FERN,
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
  stampPageNumbers,
  widthOf,
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
  // Bundled UPI QR / signature assets install on first use, so re-read the
  // organization rather than trusting the row the caller loaded earlier.
  await ensureFirmAssets();
  const org = inv.organizationId
    ? await prisma.organization.findUnique({ where: { id: inv.organizationId } })
    : null;
  return toLetterhead(org ?? (await getDefaultOrg()));
}

// Vertical budget for the bottom of the last page. The payment details, the
// scan-to-pay QR and the signature are pinned here, so content laid out from
// the top must stop above it.
const FOOTER_BAND_TOP = 168;
/**
 * Rows may run this far down — near the bottom of the sheet, because only the
 * *last* page carries the footer band. If the totals then have nowhere to go,
 * the tail check carries them over, so the band is never encroached on.
 */
const TABLE_FLOOR = 100;
/** Height the totals block and the amount in words need beneath the table. */
const TAIL_HEIGHT = 130;

export async function buildInvoicePdf(inv: InvoiceForPdf): Promise<Uint8Array> {
  const pdf = await createA4();
  const { reg, bold } = pdf;
  // Reassigned as pages are added; `pdf.page` is kept in step so the shared
  // header/footer helpers draw on the current sheet.
  let page = pdf.page;
  const right = A4.width - MARGIN;
  const lh = await letterheadFor(inv);

  const statusMark =
    inv.status === "Paid"
      ? { label: "PAID", color: rgb(0.02, 0.59, 0.41) }
      : inv.status === "Draft"
        ? { label: "DRAFT", color: rgb(0.42, 0.45, 0.5) }
        : inv.status === "Overdue"
          ? { label: "OVERDUE", color: rgb(0.88, 0.11, 0.28) }
          : null;
  if (statusMark) watermark(page, statusMark.label, statusMark.color);

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

  // The billed-to block shares its line with the invoice facts on the right,
  // so it gets the width up to that column and no more. A long client name —
  // "Bright Future Charitable Trust for Rural Education" — is stepped down a
  // size or two and then wrapped, rather than running under "Invoice Date".
  const billedW = factsX - MARGIN - 16;

  y -= 14;
  let nameSize = 11;
  while (nameSize > 9 && widthOf(bold, c.name, nameSize) > billedW) nameSize -= 0.5;
  for (const line of wrap(c.name, bold, nameSize, billedW)) {
    text(page, line, { x: MARGIN, y, size: nameSize, font: bold });
    y -= nameSize + 2;
  }
  if (c.address) {
    for (const line of wrap(c.address, reg, 8.5, billedW)) {
      text(page, line, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
      y -= 11;
    }
  }
  if (c.contactPerson) {
    for (const line of wrap(`Attn: ${c.contactPerson}`, reg, 8.5, billedW)) {
      text(page, line, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
      y -= 11;
    }
  }
  const ids = [c.pan ? `PAN: ${c.pan}` : null, c.gstin ? `GSTIN: ${c.gstin}` : null]
    .filter(Boolean)
    .join("   ");
  if (ids) {
    for (const line of wrap(ids, reg, 8.5, billedW)) {
      text(page, line, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
      y -= 11;
    }
  }

  y = Math.min(y, fy) - 18;

  // ---- Line items table ----
  // The footer band (payment details, QR, signature) is pinned to the bottom
  // of the last page, so the table must never grow into it: a long bill runs
  // on to another page instead of printing rows on top of the bank details.
  const colSac = 380;
  const rowPadding = 9;

  const drawTableHead = (yy: number) => {
    page.drawRectangle({ x: MARGIN, y: yy - 6, width: right - MARGIN, height: 20, color: FILL });
    text(page, "DESCRIPTION OF SERVICES", { x: MARGIN + 8, y: yy, size: 8, font: bold, color: MUTED });
    text(page, "SAC", { x: colSac, y: yy, size: 8, font: bold, color: MUTED });
    text(page, "AMOUNT", { x: right - 8, y: yy, size: 8, font: bold, color: MUTED, align: "right" });
    hline(page, MARGIN, right, yy - 6);
    return yy - 22;
  };

  /**
   * Start a fresh sheet. `reopenTable` re-draws the column header, which is
   * wanted when more rows follow but not when only the totals are carried.
   */
  const continueOnNewPage = (reopenTable = true) => {
    page = pdf.doc.addPage([A4.width, A4.height]);
    pdf.page = page;
    if (statusMark) watermark(page, statusMark.label, statusMark.color);
    // A slim continuation header — the reader needs to know whose bill this
    // sheet belongs to without repeating the whole letterhead.
    const third = A4.width / 3;
    page.drawRectangle({ x: 0, y: A4.height - 6, width: third, height: 6, color: SAFFRON });
    page.drawRectangle({ x: third, y: A4.height - 6, width: third, height: 6, color: ACCENT });
    page.drawRectangle({ x: third * 2, y: A4.height - 6, width: third, height: 6, color: FERN });
    let ny = A4.height - 56;
    // The firm's name and the continuation label share this line, so the name
    // is stepped down until both fit rather than running into it.
    const contd = `${title} ${inv.invoiceNumber} (continued)`;
    const room = right - MARGIN - widthOf(reg, contd, 9) - 16;
    let firmSize = 11;
    while (firmSize > 8 && widthOf(bold, lh.name, firmSize) > room) firmSize -= 0.5;
    text(page, lh.name, { x: MARGIN, y: ny, size: firmSize, font: bold });
    text(page, contd, {
      x: right, y: ny, size: 9, font: reg, color: MUTED, align: "right",
    });
    ny -= 20;
    return reopenTable ? drawTableHead(ny) : ny;
  };

  y = drawTableHead(y);

  // One row per service line; fall back to the single description/amount when
  // an invoice has no line items (older invoices).
  const items: { description: string; amount: number; sacCode: string | null }[] =
    inv.lineItems && inv.lineItems.length > 0
      ? inv.lineItems.map((li) => ({ description: li.description, amount: li.amount, sacCode: li.sacCode }))
      : [{ description: inv.description?.trim() || "Professional services rendered", amount: tax.taxable, sacCode: null }];

  for (const item of items) {
    const descLines = wrap(item.description || "Professional services", reg, 9.5, colSac - MARGIN - 24);
    // Keep a row whole: if it will not fit above the floor, move it over.
    const rowHeight = descLines.length * 12 + 5;
    if (y - rowHeight < TABLE_FLOOR) y = continueOnNewPage();
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

  // Totals, the amount in words and the footer band all live together. If the
  // whole tail will not fit under the table, carry it to a fresh page rather
  // than let any of it collide with the band.
  if (y - TAIL_HEIGHT < FOOTER_BAND_TOP) {
    // Only the totals follow, so no column header — just the rule above them.
    y = continueOnNewPage(false);
    hline(page, MARGIN, right, y);
  }

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

  // ---- Footer band: payment details | scan-to-pay QR | signature ----
  // Three columns share this band. The left column is measured against the
  // QR's edge rather than a fixed width, so a long bank name or payment note
  // wraps inside its own column instead of running underneath the code.
  const bankTop = FOOTER_BAND_TOP;
  const QR_X = 318;
  const QR_SIZE = 78;
  const COL_GAP = 16;
  // Nothing may descend into the footer rule at y = 58.
  const BAND_FLOOR = 68;

  // Resolved first: whether there is a QR decides how wide the left column is.
  const upiQr = await firmUpiQr(lh);
  const leftWidth = (upiQr ? QR_X - COL_GAP : right) - MARGIN;
  const labelWidth = 70;

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
    // A long value (a branch address, say) runs on rather than overflowing.
    for (const line of wrap(v, bold, 8.5, leftWidth - labelWidth)) {
      text(page, line, { x: MARGIN + labelWidth, y: by, size: 8.5, font: bold });
      by -= 12;
    }
  }
  if (lh.invoiceNote) {
    by -= 6;
    for (const line of wrap(lh.invoiceNote, reg, 8, leftWidth)) {
      if (by < BAND_FLOOR) break; // never print into the footer rule
      text(page, line, { x: MARGIN, y: by, size: 8, font: reg, color: FAINT });
      by -= 10;
    }
  }

  // Scan-to-pay UPI QR, centred between the bank details and the signature.
  // Rendered from the firm's UPI ID unless it uploaded a QR of its own, so the
  // code and the ID printed under it always point at the same account.
  if (upiQr) {
    try {
      const qr =
        upiQr.mime === "image/png"
          ? await pdf.doc.embedPng(upiQr.bytes)
          : await pdf.doc.embedJpg(upiQr.bytes);
      const cx = QR_X + QR_SIZE / 2;
      text(page, "SCAN TO PAY (UPI)", { x: cx, y: bankTop, size: 7.5, font: bold, color: FAINT, align: "center" });
      page.drawImage(qr, { x: QR_X, y: bankTop - 14 - QR_SIZE, width: QR_SIZE, height: QR_SIZE });
      if (lh.bank.upi) {
        text(page, lh.bank.upi, { x: cx, y: bankTop - 14 - QR_SIZE - 10, size: 7.5, font: reg, color: MUTED, align: "center" });
      }
    } catch {
      // Unreadable QR image — the printed bank/UPI details still stand.
    }
  }

  await signatureAndFooter(pdf, bankTop, lh.name, lh);
  stampPageNumbers(pdf);
  return pdf.doc.save();
}
