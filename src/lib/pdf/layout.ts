import "server-only";
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  degrees,
  type RGB,
} from "pdf-lib";
import type { Letterhead } from "@/lib/org";

// A4 in PDF points.
export const A4 = { width: 595.28, height: 841.89 };
export const MARGIN = 48;

export const INK = rgb(0.06, 0.09, 0.16); // slate-900
export const MUTED = rgb(0.39, 0.45, 0.55); // slate-500
export const FAINT = rgb(0.58, 0.64, 0.72); // slate-400
export const ACCENT = rgb(0.18, 0.424, 0.318); // brand-600 green #2e6c51
export const SAFFRON = rgb(0.498, 0.788, 0.561); // chalk green #7fc98f
export const FERN = rgb(0.333, 0.671, 0.408); // #55ab68
export const LINE = rgb(0.89, 0.91, 0.94); // slate-200
export const FILL = rgb(0.97, 0.98, 0.99); // slate-50

export type Pdf = {
  doc: PDFDocument;
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
};

// ── what the standard fonts can print ──────────────────────────────────────
//
// Helvetica is a standard PDF font, and standard fonts are encoded WinAnsi:
// Latin-1 plus a couple of dozen typographic characters. Hand pdf-lib anything
// outside that — a rupee sign typed into an observation, a bullet or an arrow
// pasted out of Word, a note written in Hindi — and it *throws*, which used to
// take the whole document down with it. A document that prints "Rs." where the
// author typed "₹" is right; a document that refuses to print is not.

/** The characters above U+00FF that WinAnsi can still encode (0x80–0x9F). */
const WIN_ANSI_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Unencodable slots inside Latin-1's range: controls and WinAnsi's gaps. */
const UNUSABLE = /[\x00-\x1F\x7F\u0081\u008D\u008F\u0090\u009D\u00AD]/g;

/** Sensible stand-ins for what people actually type and paste. */
const SUBSTITUTIONS: [RegExp, string][] = [
  // A rupee sign against a figure reads as "Rs. 45,000", the way the rest
  // of the app writes money.
  [/[\u20B9\u20A8]\s*(?=[\d(])/g, "Rs. "],
  [/[\u20B9\u20A8]/g, "Rs."],
  [/[\u21D2\u2192\u2794\u279C\u27A4]/g, "->"],
  [/[\u21D0\u2190]/g, "<-"],
  [/[\u2194\u21D4]/g, "<->"],
  [/[\u2022\u2023\u25AA\u25AB\u25CF\u25CB\u25E6\u2219]/g, "-"],
  [/[\u2713\u2714\u2611]/g, "(done)"],
  [/[\u2717\u2718\u2612]/g, "(not done)"],
  [/\u2116/g, "No."],
  [/\u2153/g, "1/3"],
  [/\u2154/g, "2/3"],
  [/\u215B/g, "1/8"],
  [/[\u2010\u2011\u2012]/g, "-"],
  [/\u2044/g, "/"],
  // Direction marks and zero-width joiners carry no ink; drop them.
  [/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, ""],
];

const encodable = (ch: string) => ch.codePointAt(0)! <= 0xff || WIN_ANSI_HIGH.includes(ch);

/**
 * Make a string printable by a standard PDF font, without throwing.
 *
 * Substitutions first, then accents that WinAnsi lacks are stripped by
 * decomposing ("Śrī" → "Sri"). Whatever is left that cannot be printed at all —
 * Devanagari, Gujarati, emoji — becomes a single "?" per run, so the sheet says
 * *something is here that could not be printed* rather than quietly losing it.
 */
export function pdfSafe(str: string): string {
  let out = str.normalize("NFC");
  for (const [re, rep] of SUBSTITUTIONS) out = out.replace(re, rep);
  out = out.replace(UNUSABLE, " ");
  let safe = "";
  let pending = "";
  const flush = () => {
    if (pending) safe += "?";
    pending = "";
  };
  for (const ch of out) {
    if (encodable(ch)) {
      flush();
      safe += ch;
      continue;
    }
    // An accented letter WinAnsi does not carry may still reduce to one it does.
    const bare = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    if (bare && [...bare].every(encodable)) {
      flush();
      safe += bare;
    } else {
      pending += ch;
    }
  }
  flush();
  return safe;
}

/** Whether printing this string would have to substitute anything. */
export const printsWholly = (str: string | null | undefined) =>
  !str || pdfSafe(str) === str;

/** Width of a string as it will actually be printed. */
export const widthOf = (font: PDFFont, str: string, size: number) =>
  font.widthOfTextAtSize(pdfSafe(str), size);

export async function createA4(): Promise<Pdf> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.width, A4.height]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, reg, bold };
}

type TextOpts = {
  x: number;
  y: number;
  size?: number;
  font: PDFFont;
  color?: RGB;
  align?: "left" | "right" | "center";
};

/** Draw a single line of text with optional right/center alignment. */
export function text(page: PDFPage, str: string, opts: TextOpts) {
  const size = opts.size ?? 9;
  // Everything the app prints comes through here, so this is the one place
  // that has to make it printable.
  const safe = pdfSafe(str);
  let x = opts.x;
  if (opts.align === "right") x -= opts.font.widthOfTextAtSize(safe, size);
  if (opts.align === "center") x -= opts.font.widthOfTextAtSize(safe, size) / 2;
  page.drawText(safe, { x, y: opts.y, size, font: opts.font, color: opts.color ?? INK });
}

/** Greedy word wrap to a pixel width. */
export function wrap(str: string, font: PDFFont, size: number, maxWidth: number): string[] {
  // Wrapped against what will be drawn, not what was typed: "Rs." is wider
  // than "₹", so measuring the original would overrun the column.
  const words = pdfSafe(str).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    // A single token wider than the column — a run-on company name, a long
    // reference — cannot be broken at a space, so it is broken between
    // letters. Better a name split across two lines than one running off the
    // edge and across whatever is printed beside it.
    if (font.widthOfTextAtSize(w, size) > maxWidth) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      let chunk = "";
      for (const ch of w) {
        if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      cur = chunk;
      continue;
    }
    const probe = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      cur = probe;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

export function hline(page: PDFPage, x1: number, x2: number, y: number, color = LINE, thickness = 0.8) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

/** "Rs. 1,25,000.00" — Helvetica cannot encode the rupee glyph, so use Rs. */
export function money(n: number): string {
  return (
    "Rs. " +
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  );
}

/** Large diagonal status watermark (drawn before content). */
export function watermark(page: PDFPage, label: string, color: RGB) {
  const size = 92;
  page.drawText(pdfSafe(label), {
    x: 120,
    y: 260,
    size,
    color,
    opacity: 0.08,
    rotate: degrees(35),
  });
}

/**
 * Letterhead: accent strip, organization identity (with optional logo) on the
 * left, document title on the right. Returns the y where content can start.
 */
export async function firmHeader(pdf: Pdf, title: string, lh: Letterhead): Promise<number> {
  const { doc, page, reg, bold } = pdf;
  // Ledgify accent strip: chalk-green tones.
  const third = A4.width / 3;
  page.drawRectangle({ x: 0, y: A4.height - 6, width: third, height: 6, color: SAFFRON });
  page.drawRectangle({ x: third, y: A4.height - 6, width: third, height: 6, color: ACCENT });
  page.drawRectangle({ x: third * 2, y: A4.height - 6, width: third, height: 6, color: FERN });

  // Optional logo, boxed to 56x56 left of the name and vertically centred
  // against the firm name + tagline block.
  let textX = MARGIN;
  if (lh.logo && lh.logoMime) {
    try {
      const img =
        lh.logoMime === "image/png"
          ? await doc.embedPng(lh.logo)
          : await doc.embedJpg(lh.logo);
      const box = 56;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      // The identity block: name baseline at H-44 (cap ~13pt) and tagline
      // baseline at H-58 — its visual centre sits around H-47.
      const blockCenter = A4.height - 47;
      page.drawImage(img, {
        x: MARGIN + (box - w) / 2,
        y: blockCenter - h / 2,
        width: w,
        height: h,
      });
      textX = MARGIN + box + 14;
    } catch {
      // Unreadable image — fall back to text-only letterhead.
    }
  }

  let y = A4.height - 44;
  // The firm name and the document title share one line from opposite edges,
  // and both vary: "ANIL P.S. BHANSALI & CO." against "PAYMENT RECEIPT (ON
  // ACCOUNT)" would otherwise run into each other. Each is stepped down until
  // the pair fits — the title first, since it is the more compressible.
  const GAP = 18;
  const available = A4.width - MARGIN - textX;
  let titleSize = 15;
  while (titleSize > 9 && widthOf(bold, title, titleSize) > available * 0.5) {
    titleSize -= 0.5;
  }
  const titleWidth = widthOf(bold, title, titleSize);
  let nameSize = 19;
  while (nameSize > 11 && widthOf(bold, lh.name, nameSize) > available - titleWidth - GAP) {
    nameSize -= 0.5;
  }
  text(page, lh.name, { x: textX, y, size: nameSize, font: bold, color: INK });
  text(page, title, { x: A4.width - MARGIN, y, size: titleSize, font: bold, color: ACCENT, align: "right" });

  y -= 14;
  text(page, lh.tagline, { x: textX, y, size: 9.5, font: reg, color: ACCENT });

  y -= 13;
  for (const line of lh.addressLines) {
    text(page, line, { x: textX, y, size: 8, font: reg, color: MUTED });
    y -= 10;
  }
  const contact = [lh.phone, lh.email].filter(Boolean).join("  ·  ");
  if (contact) {
    text(page, contact, { x: textX, y, size: 8, font: reg, color: MUTED });
    y -= 10;
  }
  const ids = [lh.pan ? `PAN: ${lh.pan}` : null, lh.gstin ? `GSTIN: ${lh.gstin}` : null]
    .filter(Boolean)
    .join("   ");
  if (ids) {
    text(page, ids, { x: textX, y, size: 8, font: reg, color: MUTED });
    y -= 10;
  }

  y -= 14;
  hline(page, MARGIN, A4.width - MARGIN, y);
  return y - 22;
}

/** Signature block bottom-right + footer note, shared by both documents.
 *  When the letterhead carries the signatory's signature image it is drawn
 *  between the "For FIRM" line and the "Authorised Signatory" caption. */
/**
 * "Page 1 of 3" on every sheet, once the document knows how many there are.
 * Only stamped on multi-page documents — a one-page invoice needs no counter.
 */
export function stampPageNumbers(pdf: Pdf) {
  const pages = pdf.doc.getPages();
  if (pages.length < 2) return;
  pages.forEach((p, i) => {
    text(p, `Page ${i + 1} of ${pages.length}`, {
      x: A4.width - MARGIN,
      y: 44,
      size: 7.5,
      font: pdf.reg,
      color: FAINT,
      align: "right",
    });
  });
}

export async function signatureAndFooter(
  pdf: Pdf,
  yTop: number,
  firmName: string,
  lh?: Pick<Letterhead, "signature" | "signatureMime">,
) {
  const { doc, page, reg, bold } = pdf;
  const x = A4.width - MARGIN;
  let signed = false;
  text(page, `For ${firmName}`, { x, y: yTop, size: 9.5, font: bold, align: "right" });
  if (lh?.signature && lh.signatureMime) {
    try {
      const img =
        lh.signatureMime === "image/png"
          ? await doc.embedPng(lh.signature)
          : await doc.embedJpg(lh.signature);
      // Fit into the gap between the firm line and the signatory caption.
      const maxW = 120;
      const maxH = 38;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: x - w, y: yTop - 52, width: w, height: h });
      signed = true;
    } catch {
      // Unreadable image — leave the space blank for a physical signature.
    }
  }
  text(page, "Authorised Signatory", { x, y: yTop - 62, size: 9, font: reg, color: MUTED, align: "right" });

  hline(page, MARGIN, A4.width - MARGIN, 58);
  const footer = signed
    ? "Computer-generated document bearing the authorised signatory's signature; no physical signature is required."
    : "This is a computer-generated document and does not require a physical signature.";
  text(page, footer, {
    x: A4.width / 2,
    y: 44,
    size: 7.5,
    font: reg,
    color: FAINT,
    align: "center",
  });
}
