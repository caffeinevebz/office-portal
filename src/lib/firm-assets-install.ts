import "server-only";
import { prisma } from "@/lib/prisma";
import { FIRM_ASSET_RULES, SIGNATORY_SIGNATURE_BASE64 } from "@/lib/firm-assets";

// Lowercase, letters-only view of a firm name so punctuation variants match:
// "ANIL P.S. BHANSALI & CO." → "anilpsbhansalico".
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

// Re-checked at most once a minute so a firm added or renamed later still
// picks up its assets, without querying on every PDF render.
const RECHECK_MS = 60_000;
let checkedAt = 0;

/** Force the next call to re-scan (used when an organization is saved). */
export function resetFirmAssetsCheck() {
  checkedAt = 0;
}

/**
 * Install the bundled UPI QR + signatory signature into organizations whose
 * names match the firm rules — only into fields the user hasn't already
 * filled, so uploads and deletions via Firm Settings are never overwritten.
 */
export async function ensureFirmAssets(): Promise<void> {
  if (Date.now() - checkedAt < RECHECK_MS) return;
  checkedAt = Date.now();
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, bankUpi: true, upiQrMime: true, signatureMime: true },
    });
    for (const org of orgs) {
      const n = normalize(org.name);
      const rule = FIRM_ASSET_RULES.find((r) => r.match.every((m) => n.includes(m)));
      if (!rule) continue;
      const data: Record<string, unknown> = {};
      if (!org.upiQrMime) {
        data.upiQr = Buffer.from(rule.qrBase64, "base64");
        data.upiQrMime = "image/png";
      }
      if (!org.bankUpi) data.bankUpi = rule.upiId;
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
