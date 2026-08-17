import "server-only";
import { toLetterhead } from "@/lib/org";
import { VOUCHING_AREAS, UNFILED_VOUCHING } from "@/lib/constants";
import {
  A4,
  MARGIN,
  INK,
  MUTED,
  FAINT,
  LINE,
  FILL,
  ACCENT,
  createA4,
  text,
  wrap,
  hline,
  money,
  firmHeader,
  stampPageNumbers,
} from "@/lib/pdf/layout";
import type { Organization } from "@prisma/client";
import type { PDFPage } from "pdf-lib";

// The audit observations as the firm files them: a working paper, printed
// area-wise the way the vouching was done.
//
// This one is *not* the query letter. It is the office copy, so it carries
// everything the panel shows — the internal note, what the client came back
// with, which letter a point went out on — and it says on every page that it
// is not for circulation. The letter remains the only document that leaves,
// and it is built from a different file that cannot even see the internal note.

const DATE = { day: "2-digit", month: "short", year: "numeric" } as const;
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", DATE) : "");

const FOOTER_FLOOR = 92; // below this a row moves to the next page
const NUM_W = 22;
const META_W = 104; // the status / letter column on the right

const CAVEAT = "Internal working paper — for the firm's file. Not for circulation to the client.";

export type ObservationRow = {
  kind: string;
  vouchingArea: string | null;
  observation: string;
  internalNote: string | null;
  ledgerName: string | null;
  voucherNo: string | null;
  voucherDate: Date | null;
  partyName: string | null;
  amount: number | null;
  needsClarification: boolean;
  status: string;
  response: string | null;
  respondedAt: Date | null;
  resolution: string | null;
  raisedBy: string | null;
  createdAt: Date;
  letter: { number: string; status: string; issuedAt: Date } | null;
};

export type ObservationsInput = {
  client: { name: string } | null;
  task: { title: string; taskType: string | null; financialYear: string | null } | null;
  organization: Organization | null;
  rows: ObservationRow[];
  /** Who asked for the print — a working paper says who ran it off. */
  printedBy: string;
  /** What the print was narrowed to, if anything, so the paper says so. */
  filter?: { kind?: string | null; area?: string | null };
};

/**
 * The particulars under a point: whichever of them the note carries. The
 * heading it is filed under is left out — a ledger named twice, once as the
 * heading and again under the note, reads as a mistake.
 */
function particulars(o: ObservationRow, heading: string): string {
  return [
    o.voucherNo ? `Voucher ${o.voucherNo}` : null,
    o.voucherDate ? `dated ${fmt(o.voucherDate)}` : null,
    o.ledgerName?.trim() === heading ? null : o.ledgerName,
    o.partyName,
    o.amount != null ? money(o.amount) : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
}

/**
 * Split the notes into the groups a working paper is filed in: vouching
 * area-wise in the order the work is done, scrutiny by account head.
 *
 * A group with nothing in it is left out — an empty "Bank reconciliation"
 * heading would read as work done and nothing found, which is not what an
 * unfilled area means.
 */
function groups(rows: ObservationRow[]): { title: string; heading: string; items: ObservationRow[] }[] {
  const out: { title: string; heading: string; items: ObservationRow[] }[] = [];

  const vouching = rows.filter((r) => r.kind === "Vouching");
  if (vouching.length) {
    const order = [...VOUCHING_AREAS, UNFILED_VOUCHING];
    const buckets = new Map<string, ObservationRow[]>();
    for (const r of vouching) {
      const key = r.vouchingArea?.trim() || UNFILED_VOUCHING;
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    for (const area of order) {
      const items = buckets.get(area);
      if (items?.length) out.push({ title: "VOUCHING OBSERVATIONS", heading: area, items });
    }
    // An area that is no longer on the list (renamed since) still prints.
    for (const [area, items] of buckets) {
      if (!order.includes(area)) out.push({ title: "VOUCHING OBSERVATIONS", heading: area, items });
    }
  }

  const scrutiny = rows.filter((r) => r.kind === "Ledger scrutiny");
  if (scrutiny.length) {
    const buckets = new Map<string, ObservationRow[]>();
    for (const r of scrutiny) {
      const key = r.ledgerName?.trim() || "Ledger not named";
      buckets.set(key, [...(buckets.get(key) ?? []), r]);
    }
    const heads = [...buckets.keys()].sort((a, b) =>
      a === "Ledger not named" ? 1 : b === "Ledger not named" ? -1 : a.localeCompare(b),
    );
    for (const head of heads) {
      out.push({ title: "LEDGER SCRUTINY NOTES", heading: head, items: buckets.get(head)! });
    }
  }

  return out;
}

export async function buildObservationsPdf(input: ObservationsInput): Promise<Uint8Array> {
  const lh = toLetterhead(input.organization);
  const pdf = await createA4();
  const { reg, bold } = pdf;
  let page = pdf.page;
  const right = A4.width - MARGIN;
  const width = right - MARGIN;
  const bodyW = width - NUM_W - META_W - 12;

  let y = await firmHeader(pdf, "AUDIT OBSERVATIONS", lh);

  // Whose file this is, and what work it covers.
  // The engagement's own name usually carries its year; printing it twice
  // reads as a slip on a sheet that goes into the file.
  const fy = input.task?.financialYear;
  const engagement = input.task
    ? [input.task.title, fy && !input.task.title.includes(fy) ? `FY ${fy}` : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  text(page, input.client?.name ?? "Client not linked", { x: MARGIN, y, size: 11, font: bold });
  text(page, `Printed ${fmt(new Date())}`, {
    x: right,
    y,
    size: 8.5,
    font: reg,
    color: MUTED,
    align: "right",
  });
  y -= 13;
  if (engagement) {
    text(page, engagement, { x: MARGIN, y, size: 9, font: reg, color: MUTED });
  }
  text(page, `by ${input.printedBy}`, {
    x: right,
    y,
    size: 8.5,
    font: reg,
    color: MUTED,
    align: "right",
  });
  y -= 16;

  // The caveat, stated once at the top in full and then on every page footer.
  page.drawRectangle({ x: MARGIN, y: y - 15, width, height: 20, color: FILL });
  text(page, CAVEAT, { x: MARGIN + 8, y: y - 9, size: 8.5, font: bold, color: ACCENT });
  y -= 26;

  // What the file holds, counted — the figures a reviewer looks for first.
  const rows = input.rows;
  const count = (f: (r: ObservationRow) => boolean) => rows.filter(f).length;
  const summary = [
    `${rows.length} note${rows.length === 1 ? "" : "s"}`,
    `${count((r) => r.kind === "Vouching")} vouching`,
    `${count((r) => r.kind === "Ledger scrutiny")} scrutiny`,
    `${count((r) => r.needsClarification)} needing the client's clarification`,
    `${count((r) => r.status === "Queried")} awaiting a reply`,
    `${count((r) => r.status === "Answered")} answered`,
    `${count((r) => r.status === "Closed" || r.status === "Dropped")} settled`,
  ].join("   ·   ");
  for (const line of wrap(summary, reg, 8.5, width)) {
    text(page, line, { x: MARGIN, y, size: 8.5, font: reg, color: MUTED });
    y -= 11;
  }
  const narrowed = [
    input.filter?.kind ? `${input.filter.kind} only` : null,
    input.filter?.area ? `area: ${input.filter.area}` : null,
  ].filter(Boolean);
  if (narrowed.length) {
    text(page, `Printed narrowed to ${narrowed.join(", ")}.`, {
      x: MARGIN,
      y,
      size: 8.5,
      font: bold,
      color: MUTED,
    });
    y -= 11;
  }
  y -= 8;

  const newPage = () => {
    page = pdf.doc.addPage([A4.width, A4.height]);
    pdf.page = page;
    y = A4.height - MARGIN;
  };

  /** A section title ("VOUCHING OBSERVATIONS") — printed when it changes. */
  const sectionTitle = (title: string) => {
    if (y - 30 < FOOTER_FLOOR) newPage();
    text(page, title, { x: MARGIN, y, size: 10, font: bold, color: ACCENT });
    y -= 6;
    hline(page, MARGIN, right, y, ACCENT, 0.8);
    y -= 16;
  };

  /** The area / account head a run of notes was filed under. */
  const groupHeading = (heading: string, n: number, contd = false, needs = 0) => {
    // A heading with its first note on the next page is a heading over nothing,
    // so it moves down with the note it belongs to.
    if (y - 24 - needs < FOOTER_FLOOR) newPage();
    page.drawRectangle({ x: MARGIN, y: y - 13, width, height: 17, color: FILL });
    text(page, contd ? `${heading} (contd.)` : heading, {
      x: MARGIN + 8,
      y: y - 8,
      size: 9,
      font: bold,
      color: INK,
    });
    text(page, `${n} note${n === 1 ? "" : "s"}`, {
      x: right - 8,
      y: y - 8,
      size: 8,
      font: reg,
      color: MUTED,
      align: "right",
    });
    y -= 24;
  };

  if (rows.length === 0) {
    text(page, "No observations have been recorded on this engagement yet.", {
      x: MARGIN,
      y,
      size: 9.5,
      font: reg,
      color: MUTED,
    });
    y -= 20;
  }

  let n = 0;
  let lastTitle = "";
  for (const group of groups(input.rows)) {
    if (group.title !== lastTitle) {
      sectionTitle(group.title);
      lastTitle = group.title;
    }
    // Every note in the group is measured before the heading is drawn, so the
    // heading knows whether its first note can follow it on this page.
    const measured = group.items.map((o) => {
      const lines = wrap(o.observation, reg, 9, bodyW);
      const detail = particulars(o, group.heading);
      const detailLines = detail ? wrap(detail, reg, 8, bodyW) : [];
      const internalLines = o.internalNote
        ? wrap(`Internal: ${o.internalNote}`, reg, 8, bodyW - 10)
        : [];
      const replyLines = o.response
        ? wrap(
            `Client: ${o.response}${o.respondedAt ? `  (${fmt(o.respondedAt)})` : ""}`,
            reg,
            8,
            bodyW - 10,
          )
        : [];
      const resolutionLines = o.resolution
        ? wrap(`Settled: ${o.resolution}`, reg, 8, bodyW - 10)
        : [];
      const height =
        lines.length * 12 +
        detailLines.length * 10 +
        (internalLines.length ? internalLines.length * 10 + 6 : 0) +
        (replyLines.length ? replyLines.length * 10 + 6 : 0) +
        (resolutionLines.length ? resolutionLines.length * 10 + 6 : 0) +
        16;
      return { o, lines, detailLines, internalLines, replyLines, resolutionLines, height };
    });

    groupHeading(group.heading, group.items.length, false, measured[0]?.height ?? 0);

    for (const { o, lines, detailLines, internalLines, replyLines, resolutionLines, height } of measured) {
      n += 1;

      // A note is kept whole: splitting an observation across a page break
      // makes a working paper hard to read back against the file.
      if (y - height < FOOTER_FLOOR) {
        newPage();
        groupHeading(group.heading, group.items.length, true, height);
      }

      const top = y;
      text(page, String(n), { x: MARGIN + 4, y: top, size: 9, font: bold, color: MUTED });

      let ly = top;
      for (const line of lines) {
        text(page, line, { x: MARGIN + NUM_W, y: ly, size: 9, font: reg });
        ly -= 12;
      }
      for (const line of detailLines) {
        text(page, line, { x: MARGIN + NUM_W, y: ly, size: 8, font: reg, color: FAINT });
        ly -= 10;
      }

      // The three things that only ever appear on the office copy.
      const block = (lineSet: string[], colour = MUTED) => {
        ly -= 4;
        for (const line of lineSet) {
          text(page, line, { x: MARGIN + NUM_W + 10, y: ly, size: 8, font: reg, color: colour });
          ly -= 10;
        }
      };
      if (internalLines.length) block(internalLines, FAINT);
      if (replyLines.length) block(replyLines, INK);
      if (resolutionLines.length) block(resolutionLines);

      // The right-hand column: where the point stands, and what was asked.
      const metaX = right;
      let my = top;
      text(page, o.status, { x: metaX, y: my, size: 8.5, font: bold, color: MUTED, align: "right" });
      my -= 11;
      text(page, o.needsClarification ? "clarification wanted" : "no clarification", {
        x: metaX,
        y: my,
        size: 7.5,
        font: reg,
        color: FAINT,
        align: "right",
      });
      my -= 10;
      if (o.letter) {
        text(page, o.letter.number, {
          x: metaX,
          y: my,
          size: 7.5,
          font: reg,
          color: FAINT,
          align: "right",
        });
        my -= 10;
      }
      if (o.raisedBy) {
        text(page, o.raisedBy, {
          x: metaX,
          y: my,
          size: 7.5,
          font: reg,
          color: FAINT,
          align: "right",
        });
      }

      y = top - height;
      hline(page, MARGIN, right, y + 8, LINE, 0.5);
    }
    y -= 6;
  }

  // Prepared / reviewed, the way a working paper is signed off in the file.
  if (y - 60 < FOOTER_FLOOR) newPage();
  y -= 14;
  text(page, `Prepared by: ${input.printedBy}`, { x: MARGIN, y, size: 9, font: reg, color: MUTED });
  text(page, "Reviewed by: ", { x: right - 150, y, size: 9, font: reg, color: MUTED });
  hline(page, right - 92, right, y - 2, FAINT, 0.8);

  footNote(pdf.doc.getPages(), reg);
  stampPageNumbers(pdf);
  return pdf.doc.save();
}

/** The caveat again at the foot of every page — a loose sheet says what it is. */
function footNote(pages: PDFPage[], reg: Parameters<typeof text>[2]["font"]) {
  for (const p of pages) {
    hline(p, MARGIN, A4.width - MARGIN, 58);
    text(p, CAVEAT, { x: MARGIN, y: 44, size: 7.5, font: reg, color: FAINT });
  }
}

/** What the file is called when it is downloaded. */
export function observationsFilename(clientName: string | null, task: { title: string } | null) {
  const bits = ["Audit observations", clientName, task?.title].filter(Boolean).join(" - ");
  return `${bits.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-")}.pdf`;
}
