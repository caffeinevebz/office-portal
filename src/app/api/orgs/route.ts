import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { organizationSchema } from "@/lib/validation";
import { ensureFirmAssets, resetFirmAssetsCheck } from "@/lib/firm-assets-install";
import { isUpiId } from "@/lib/upi-qr";

// Image bytes are excluded from list payloads; has* flags their presence.
const LIST_SELECT = {
  id: true, name: true, tagline: true, address: true, phone: true, email: true,
  pan: true, gstin: true, sacCode: true, bankName: true, bankAccount: true,
  bankIfsc: true, bankUpi: true, invoiceNote: true, invoicePrefix: true, isDefault: true,
  logoMime: true, upiQrMime: true, signatureMime: true, createdAt: true,
  _count: { select: { invoices: true } },
} as const;

const withFlags = <
  T extends {
    logoMime: string | null;
    upiQrMime: string | null;
    signatureMime: string | null;
    bankUpi: string | null;
  },
>(
  o: T,
) => ({
  ...o,
  hasLogo: !!o.logoMime,
  // A scan-to-pay QR prints whenever there is one to print: the firm's own
  // upload, or one rendered from its UPI ID.
  hasUpiQr: !!o.upiQrMime || isUpiId(o.bankUpi),
  // …and this says which, so Firm Settings can label it honestly.
  upiQrGenerated: !o.upiQrMime && isUpiId(o.bankUpi),
  hasSignature: !!o.signatureMime,
});

export const GET = route(async () => {
  await requireUser();
  await ensureFirmAssets();
  const orgs = await prisma.organization.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: LIST_SELECT,
  });
  return ok(orgs.map(withFlags));
});

export const POST = route(async (req) => {
  await requirePermission("manageOrgs");
  const data = await parse(req, organizationSchema);
  const count = await prisma.organization.count();
  const org = await prisma.organization.create({
    data: { ...data, isDefault: count === 0 }, // the first org becomes default
    select: LIST_SELECT,
  });
  // A new firm may match a bundled QR/signature rule — re-scan on next read.
  resetFirmAssetsCheck();
  await ensureFirmAssets();
  return ok(withFlags(org), 201);
});
