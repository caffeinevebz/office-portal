import "server-only";
import { toLetterhead } from "@/lib/org";
import {
  A4,
  MARGIN,
  MUTED,
  FAINT,
  LINE,
  FILL,
  createA4,
  text,
  wrap,
  hline,
  money,
  firmHeader,
  signatureAndFooter,
  stampPageNumbers,
} from "@/lib/pdf/layout";
import type { Organization } from "@prisma/client";

// The query letter: the points the firm wants the client to answer, on the
// firm's letterhead, numbered so a reply can refer to them.
//
// Only what the auditor marked as needing clarification reaches this file, and
// the internal note never does — a working paper is not a letter, and the two
// must not be able to leak into one another.

const FOOTER_FLOOR = 150; // below this the page is signature and footer
const DATE = { day: "2-digit", month: "short", year: "numeric" } as const;

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-GB", DATE) : "";

export type LetterItem = {
  kind: string;
  observation: string;
  ledgerName: string | null;
  voucherNo: string | null;
  voucherDate: Date | null;
  partyName: string | null;
  amount: number | null;
};

export type LetterInput = {
  number: string;
  subject: string | null;
  preamble: string | null;
  issuedAt: Date;
  replyBy: Date | null;
  client: { name: string; address: string | null; contactPerson: string | null };
  task: { title: string; financialYear: string | null } | null;
  organization: Organization | null;
  items: LetterItem[];
};

/** The particulars line under a point: whichever of them the note carries. */
function particulars(it: LetterItem): string {
  const bits = [
    it.voucherNo ? `Voucher ${it.voucherNo}` : null,
    it.voucherDate ? `dated ${fmt(it.voucherDate)}` : null,
    it.ledgerName,
    it.partyName,
    it.amount != null ? money(it.amount) : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export async function buildQueryLetterPdf(letter: LetterInput): Promise<Uint8Array> {
  const lh = toLetterhead(letter.organization);
  const pdf = await createA4();
  let page = pdf.page;
  const { reg, bold } = pdf;
  const right = A4.width - MARGIN;
  const width = right - MARGIN;

  let y = await firmHeader(pdf, "Audit Query Letter", lh);
  y -= 6;

  // Reference and date, facing each other.
  text(page, `Ref: ${letter.number}`, { x: MARGIN, y, size: 9.5, font: bold });
  text(page, fmt(letter.issuedAt), { x: right, y, size: 9.5, font: reg, align: "right" });
  y -= 22;

  // Addressee.
  text(page, "To,", { x: MARGIN, y, size: 9, font: reg, color: MUTED });
  y -= 14;
  text(page, letter.client.name, { x: MARGIN, y, size: 10.5, font: bold });
  y -= 13;
  if (letter.client.contactPerson) {
    text(page, `Kind attention: ${letter.client.contactPerson}`, {
      x: MARGIN,
      y,
      size: 9,
      font: reg,
      color: MUTED,
    });
    y -= 12;
  }
  for (const line of (letter.client.address ?? "").split("\n").filter(Boolean).slice(0, 4)) {
    text(page, line.trim(), { x: MARGIN, y, size: 9, font: reg, color: MUTED });
    y -= 11;
  }
  y -= 10;

  // Subject — what the letter is about, in one line.
  // The engagement's own name usually carries its year already; saying it
  // twice reads like a mistake on a letter going to a client.
  const engagement = letter.task?.title ?? "audit";
  const fy = letter.task?.financialYear;
  const namesYear = !!fy && engagement.includes(fy);
  const subject =
    letter.subject?.trim() ||
    `Points arising in the course of our ${engagement}` +
      (fy && !namesYear ? ` for FY ${fy}` : "");
  for (const line of wrap(`Subject: ${subject}`, bold, 10, width)) {
    text(page, line, { x: MARGIN, y, size: 10, font: bold });
    y -= 13;
  }
  y -= 8;

  text(page, "Dear Sir / Madam,", { x: MARGIN, y, size: 9.5, font: reg });
  y -= 18;

  const preamble =
    letter.preamble?.trim() ||
    "In the course of our audit, the following points have arisen on which we require your clarification. " +
      "We should be grateful if you would let us have your explanation, with supporting records where applicable, against each point below.";
  for (const line of wrap(preamble, reg, 9.5, width)) {
    text(page, line, { x: MARGIN, y, size: 9.5, font: reg });
    y -= 12.5;
  }
  y -= 12;

  // ── the points ────────────────────────────────────────────────────────────
  const NUM_W = 26;
  const REPLY_W = 132; // a column the client can write in
  const bodyW = width - NUM_W - REPLY_W - 16;

  const drawHead = () => {
    page.drawRectangle({ x: MARGIN, y: y - 15, width, height: 19, color: FILL });
    text(page, "#", { x: MARGIN + 8, y: y - 9, size: 8.5, font: bold, color: MUTED });
    text(page, "Observation", { x: MARGIN + NUM_W, y: y - 9, size: 8.5, font: bold, color: MUTED });
    text(page, "Your clarification", {
      x: right - 8,
      y: y - 9,
      size: 8.5,
      font: bold,
      color: MUTED,
      align: "right",
    });
    y -= 24;
  };

  const newPage = () => {
    page = pdf.doc.addPage([A4.width, A4.height]);
    pdf.page = page;
    y = A4.height - MARGIN - 10;
    drawHead();
  };

  drawHead();

  letter.items.forEach((it, i) => {
    const lines = wrap(it.observation, reg, 9, bodyW);
    const detail = particulars(it);
    const detailLines = detail ? wrap(detail, reg, 8, bodyW) : [];
    const height = Math.max(lines.length * 12 + detailLines.length * 10 + 14, 46);

    if (y - height < FOOTER_FLOOR) newPage();

    const top = y;
    text(page, String(i + 1), { x: MARGIN + 8, y: top - 9, size: 9, font: bold, color: MUTED });

    let ly = top - 9;
    for (const line of lines) {
      text(page, line, { x: MARGIN + NUM_W, y: ly, size: 9, font: reg });
      ly -= 12;
    }
    for (const line of detailLines) {
      text(page, line, { x: MARGIN + NUM_W, y: ly, size: 8, font: reg, color: FAINT });
      ly -= 10;
    }

    // The rule the client writes their answer on. It has to be visible to be
    // useful — a column header over blank paper invites nothing.
    hline(page, right - REPLY_W, right - 8, top - height + 16, FAINT, 0.8);

    y = top - height;
    hline(page, MARGIN, right, y + 6, LINE, 0.5);
  });

  y -= 16;

  // Reply-by and sign-off.
  if (y < FOOTER_FLOOR + 40) newPage();
  if (letter.replyBy) {
    for (const line of wrap(
      `We should be grateful for your reply by ${fmt(letter.replyBy)}, so that our work is not held up.`,
      reg,
      9.5,
      width,
    )) {
      text(page, line, { x: MARGIN, y, size: 9.5, font: reg });
      y -= 12.5;
    }
    y -= 6;
  }
  text(page, "Thanking you,", { x: MARGIN, y, size: 9.5, font: reg });
  y -= 10;

  text(page, "Yours faithfully,", { x: right, y, size: 9, font: reg, color: MUTED, align: "right" });
  await signatureAndFooter(pdf, y - 18, lh.name, lh);

  // A letter of points is often more than a page; number them when it is.
  stampPageNumbers(pdf);
  return pdf.doc.save();
}

/** What the file is called when it is downloaded or attached. */
export const queryLetterFilename = (number: string) => `${number.replace(/\//g, "-")}.pdf`;
