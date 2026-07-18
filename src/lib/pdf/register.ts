import "server-only";
import { PDFPage } from "pdf-lib";
import type { Organization } from "@prisma/client";
import { getDefaultOrg, toLetterhead } from "@/lib/org";
import type { ReceiptRow } from "@/lib/receipts";
import {
  A4,
  MARGIN,
  INK,
  MUTED,
  FAINT,
  FILL,
  ACCENT,
  createA4,
  text,
  hline,
  money,
  firmHeader,
} from "./layout";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// Column x-positions for the register table (amount columns right-aligned).
const COL = {
  receipt: MARGIN,
  date: MARGIN + 70,
  client: MARGIN + 128,
  invoice: MARGIN + 238,
  mode: MARGIN + 288,
  gross: A4.width - MARGIN - 98,
  tds: A4.width - MARGIN - 50,
  net: A4.width - MARGIN,
};

// Compact mode labels so the column never collides with the amounts.
const MODE_SHORT: Record<string, string> = {
  Cash: "Cash",
  Cheque: "Cheque",
  "NEFT/IMPS/Transfer": "NEFT/IMPS",
  UPI: "UPI",
};

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

/**
 * The receipt register as a printable PDF: one row per payment received in
 * the period, with gross / TDS / net columns and grand totals — the record a
 * CA firm keeps because professional income is accounted on receipt basis.
 * The register is firm-wise: printed for one billing organization under its
 * own letterhead, or across all firms grouped with per-firm subtotals.
 */
export async function buildReceiptRegisterPdf(
  label: string,
  receipts: ReceiptRow[],
  totals: { count: number; gross: number; tds: number; net: number },
  org?: Organization | null,
): Promise<Uint8Array> {
  const pdf = await createA4();
  const { doc, reg, bold } = pdf;
  // The selected firm's letterhead; the all-firms register prints under the
  // default organization's.
  const lh = toLetterhead(org ?? (await getDefaultOrg()));
  const right = A4.width - MARGIN;

  let page = pdf.page;
  let y = await firmHeader(pdf, "RECEIPT REGISTER", lh);

  text(page, `Period: ${label}`, { x: MARGIN, y, size: 10, font: bold });
  text(page, `${totals.count} receipt${totals.count === 1 ? "" : "s"}`, {
    x: right,
    y,
    size: 9,
    font: reg,
    color: MUTED,
    align: "right",
  });
  y -= 13;
  text(page, org ? `Firm: ${org.name}` : "All billing firms (grouped)", {
    x: MARGIN,
    y,
    size: 8.5,
    font: reg,
    color: MUTED,
  });
  y -= 18;

  const header = (pg: PDFPage, yy: number): number => {
    pg.drawRectangle({ x: MARGIN, y: yy - 6, width: right - MARGIN, height: 20, color: FILL });
    text(pg, "RECEIPT NO.", { x: COL.receipt + 4, y: yy, size: 7.5, font: bold, color: MUTED });
    text(pg, "DATE", { x: COL.date, y: yy, size: 7.5, font: bold, color: MUTED });
    text(pg, "RECEIVED FROM", { x: COL.client, y: yy, size: 7.5, font: bold, color: MUTED });
    text(pg, "INVOICE", { x: COL.invoice, y: yy, size: 7.5, font: bold, color: MUTED });
    text(pg, "MODE", { x: COL.mode, y: yy, size: 7.5, font: bold, color: MUTED });
    text(pg, "GROSS", { x: COL.gross, y: yy, size: 7.5, font: bold, color: MUTED, align: "right" });
    text(pg, "TDS", { x: COL.tds, y: yy, size: 7.5, font: bold, color: MUTED, align: "right" });
    text(pg, "NET RECD.", { x: COL.net, y: yy, size: 7.5, font: bold, color: MUTED, align: "right" });
    hline(pg, MARGIN, right, yy - 8);
    return yy - 22;
  };
  y = header(page, y);

  const amount = (n: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

  const ensureSpace = (needed: number) => {
    if (y < needed) {
      // New page: repeat the accent strip-free simple continuation header.
      page = doc.addPage([A4.width, A4.height]);
      y = A4.height - 56;
      text(page, `Receipt Register — ${label} (contd.)`, { x: MARGIN, y, size: 10, font: bold });
      y -= 20;
      y = header(page, y);
    }
  };

  const drawRow = (r: ReceiptRow) => {
    ensureSpace(84);
    text(page, r.receiptNumber ?? "—", { x: COL.receipt + 4, y, size: 8, font: bold });
    text(page, fmtDate(r.paidDate), { x: COL.date, y, size: 8, font: reg });
    text(page, truncate(r.clientName, 22), { x: COL.client, y, size: 8, font: reg });
    text(page, r.invoiceNumber.split("/").slice(-2).join("/"), { x: COL.invoice, y, size: 7.5, font: reg, color: MUTED });
    text(page, r.paymentMode ? (MODE_SHORT[r.paymentMode] ?? truncate(r.paymentMode, 10)) : "—", { x: COL.mode, y, size: 8, font: reg });
    text(page, amount(r.gross), { x: COL.gross, y, size: 8.5, font: reg, align: "right" });
    text(page, r.tds > 0 ? amount(r.tds) : "—", { x: COL.tds, y, size: 8.5, font: reg, align: "right" });
    text(page, amount(r.net), { x: COL.net, y, size: 8.5, font: bold, align: "right" });
    // Instrument detail on a faint second line, when present.
    if (r.detail) {
      y -= 10;
      text(page, truncate(r.detail, 64), { x: COL.mode, y, size: 7, font: reg, color: FAINT });
    }
    y -= 14;
    hline(page, MARGIN, right, y + 4, FILL, 0.6);
  };

  // Firm-wise sections: when the register spans several billing firms (the
  // all-firms view), group the rows per firm with a subtotal each.
  const groups = new Map<string, ReceiptRow[]>();
  for (const r of receipts) {
    const key = r.orgName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const grouped = !org && groups.size > 1;

  if (grouped) {
    for (const [firm, rows] of groups) {
      ensureSpace(120);
      y -= 2;
      text(page, firm, { x: MARGIN, y, size: 9.5, font: bold, color: ACCENT });
      y -= 15;
      for (const r of rows) drawRow(r);
      const sub = rows.reduce(
        (a, r) => ({ gross: a.gross + r.gross, tds: a.tds + r.tds, net: a.net + r.net }),
        { gross: 0, tds: 0, net: 0 },
      );
      ensureSpace(90);
      // The section header above names the firm; keep the label short so it
      // clears the amount columns.
      text(page, `Subtotal (${rows.length} receipt${rows.length === 1 ? "" : "s"})`, { x: COL.invoice, y, size: 8, font: bold, color: MUTED });
      text(page, amount(sub.gross), { x: COL.gross, y, size: 8.5, font: bold, align: "right" });
      text(page, sub.tds > 0 ? amount(sub.tds) : "—", { x: COL.tds, y, size: 8.5, font: bold, align: "right" });
      text(page, amount(sub.net), { x: COL.net, y, size: 8.5, font: bold, align: "right" });
      y -= 20;
    }
  } else {
    for (const r of receipts) drawRow(r);
  }

  if (receipts.length === 0) {
    text(page, "No receipts in this period.", { x: MARGIN, y, size: 9.5, font: reg, color: MUTED });
    y -= 18;
  }

  // Totals (plain numbers — the note below marks the currency).
  ensureSpace(110);
  y -= 6;
  hline(page, MARGIN, right, y + 10);
  page.drawRectangle({ x: COL.invoice - 8, y: y - 7, width: right - COL.invoice + 8, height: 22, color: FILL });
  text(page, "TOTAL", { x: COL.invoice, y, size: 9.5, font: bold, color: INK });
  text(page, amount(totals.gross), { x: COL.gross, y, size: 9, font: bold, align: "right" });
  text(page, totals.tds > 0 ? amount(totals.tds) : "—", { x: COL.tds, y, size: 9, font: bold, align: "right" });
  text(page, amount(totals.net), { x: COL.net, y, size: 9.5, font: bold, align: "right" });
  y -= 14;
  text(page, `Net received in the period: ${money(totals.net)}`, { x: COL.net, y, size: 8, font: bold, color: INK, align: "right" });
  y -= 14;
  text(
    page,
    "All amounts in Rs. Professional income is accounted on receipt basis; this register lists payments by the date received.",
    { x: MARGIN, y, size: 7.5, font: reg, color: FAINT },
  );
  y -= 10;
  text(
    page,
    "Expense reimbursement bills (EXP series) are recoveries, not professional receipts, and are excluded.",
    { x: MARGIN, y, size: 7.5, font: reg, color: FAINT },
  );

  return pdf.doc.save();
}
