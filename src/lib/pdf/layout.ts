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
export const ACCENT = rgb(0.31, 0.27, 0.9); // indigo-600
export const LINE = rgb(0.89, 0.91, 0.94); // slate-200
export const FILL = rgb(0.97, 0.98, 0.99); // slate-50

export type Pdf = {
  doc: PDFDocument;
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
};

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
  let x = opts.x;
  if (opts.align === "right") x -= opts.font.widthOfTextAtSize(str, size);
  if (opts.align === "center") x -= opts.font.widthOfTextAtSize(str, size) / 2;
  page.drawText(str, { x, y: opts.y, size, font: opts.font, color: opts.color ?? INK });
}

/** Greedy word wrap to a pixel width. */
export function wrap(str: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
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
  page.drawText(label, {
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
  page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: ACCENT });

  // Optional logo, boxed to 40x40 left of the name.
  let textX = MARGIN;
  if (lh.logo && lh.logoMime) {
    try {
      const img =
        lh.logoMime === "image/png"
          ? await doc.embedPng(lh.logo)
          : await doc.embedJpg(lh.logo);
      const box = 40;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, {
        x: MARGIN,
        y: A4.height - 30 - h + (box - h) / 2 - 22,
        width: w,
        height: h,
      });
      textX = MARGIN + box + 12;
    } catch {
      // Unreadable image — fall back to text-only letterhead.
    }
  }

  let y = A4.height - 44;
  text(page, lh.name, { x: textX, y, size: 19, font: bold, color: INK });
  text(page, title, { x: A4.width - MARGIN, y, size: 15, font: bold, color: ACCENT, align: "right" });

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

/** Signature block bottom-right + footer note, shared by both documents. */
export function signatureAndFooter(pdf: Pdf, yTop: number, firmName: string) {
  const { page, reg, bold } = pdf;
  const x = A4.width - MARGIN;
  text(page, `For ${firmName}`, { x, y: yTop, size: 9.5, font: bold, align: "right" });
  text(page, "Authorised Signatory", { x, y: yTop - 46, size: 9, font: reg, color: MUTED, align: "right" });

  hline(page, MARGIN, A4.width - MARGIN, 58);
  text(page, "This is a computer-generated document and does not require a physical signature.", {
    x: A4.width / 2,
    y: 44,
    size: 7.5,
    font: reg,
    color: FAINT,
    align: "center",
  });
}
