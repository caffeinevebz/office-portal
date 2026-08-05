import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { organizationUpdateSchema } from "@/lib/validation";
import { ensureFirmAssets, resetFirmAssetsCheck } from "@/lib/firm-assets-install";
import { isUpiId } from "@/lib/upi-qr";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const data = await parse(req, organizationUpdateSchema);
  await prisma.organization.update({ where: { id }, data });
  // A rename can bring the firm into (or out of) a bundled-asset rule.
  resetFirmAssetsCheck();
  await ensureFirmAssets();
  // Read back *after* the rules have run — they may have corrected the payment
  // details we just saved, and the caller should see what actually stands.
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) return fail("Organization not found", 404);
  const { logo, upiQr, signature, ...rest } = org;
  return ok({
    ...rest,
    hasLogo: !!logo,
    hasUpiQr: !!upiQr || isUpiId(org.bankUpi),
    upiQrGenerated: !upiQr && isUpiId(org.bankUpi),
    hasSignature: !!signature,
  });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) return fail("Organization not found", 404);
  if (org.isDefault) {
    return fail("The default organization cannot be deleted — make another one default first");
  }
  await prisma.organization.delete({ where: { id } }); // invoices keep their data (SetNull)
  return ok({ ok: true });
});
