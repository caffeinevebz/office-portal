import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { FIRM_ASSET_RULES, SIGNATORY_SIGNATURE_BASE64 } from "@/lib/firm-assets";

// Lowercase, letters-only view of a firm name so punctuation variants match:
// "ANIL P.S. BHANSALI & CO." → "anilpsbhansalico".
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Re-checked at most once a minute so a firm added or renamed later still
// picks up its assets, without querying on every PDF render.
const RECHECK_MS = 60_000;
let checkedAt = 0;

/** Force the next call to re-scan (used when an organization is saved). */
export function resetFirmAssetsCheck() {
  checkedAt = 0;
}

/**
 * Install the bundled payment details into organizations whose names match the
 * firm rules.
 *
 * Two things are written, and only two:
 *
 *   • the **UPI ID**, when the firm has none — or when it still carries one
 *     this rule has since superseded, e.g. a VPA that stopped accepting
 *     payments. Leaving a dead ID in place would keep printing a QR that
 *     silently loses the client's money, so a superseded value is corrected;
 *   • the **signatory's signature**, when the firm has none.
 *
 * A stored **QR image** is only ever *removed*, and only when its bytes are one
 * we installed ourselves in an earlier version — the QR is rendered from the
 * UPI ID now, and a leftover picture would override it. Anything the firm
 * uploaded or typed itself is never touched: its bytes won't match, and its ID
 * won't be in `supersedes`.
 */
export async function ensureFirmAssets(): Promise<void> {
  if (Date.now() - checkedAt < RECHECK_MS) return;
  checkedAt = Date.now();
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        bankUpi: true,
        upiQr: true,
        upiQrMime: true,
        signatureMime: true,
      },
    });
    for (const org of orgs) {
      const n = normalize(org.name);
      const rule = FIRM_ASSET_RULES.find((r) => r.match.every((m) => n.includes(m)));
      if (!rule) continue;
      const data: Record<string, unknown> = {};

      const upi = org.bankUpi?.trim();
      if (!upi || (rule.supersedes as readonly string[]).includes(upi)) {
        if (upi !== rule.upiId) data.bankUpi = rule.upiId;
      }

      // Drop a QR we bundled in an earlier version so the one rendered from
      // the UPI ID takes over.
      if (org.upiQr && (rule.supersededQrSha256 as readonly string[]).includes(sha256(org.upiQr))) {
        data.upiQr = null;
        data.upiQrMime = null;
      }

      if (!org.signatureMime) {
        data.signature = Buffer.from(SIGNATORY_SIGNATURE_BASE64, "base64");
        data.signatureMime = "image/png";
      }

      if (Object.keys(data).length) {
        await prisma.organization.update({ where: { id: org.id }, data });
      }
    }
  } catch (e) {
    // Never let the backfill break a request; retry on the next call.
    checkedAt = 0;
    console.error("firm-assets install failed", e);
  }
}
