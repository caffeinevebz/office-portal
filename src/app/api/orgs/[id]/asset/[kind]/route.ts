import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";
import { renderUpiQr } from "@/lib/upi-qr";

type Ctx = { params: Promise<{ id: string; kind: string }> };

const MAX_BYTES = 512 * 1024;

// Image assets an organization can carry beyond its logo.
const FIELDS: Record<string, { data: "upiQr" | "signature"; mime: "upiQrMime" | "signatureMime" }> = {
  "upi-qr": { data: "upiQr", mime: "upiQrMime" },
  signature: { data: "signature", mime: "signatureMime" },
};

// Upload as JSON: { dataUrl: "data:image/png;base64,..." } (PNG or JPEG).
export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id, kind } = await ctx.params;
  const field = FIELDS[kind];
  if (!field) return fail("Unknown asset", 404);
  const body = (await req.json().catch(() => ({}))) as { dataUrl?: string };
  const match = body.dataUrl?.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!match) return fail("The image must be a PNG or JPEG");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return fail("Empty image");
  if (bytes.length > MAX_BYTES) return fail("The image must be under 512 KB");
  await prisma.organization.update({
    where: { id },
    data: { [field.data]: bytes, [field.mime]: match[1] },
  });
  return ok({ ok: true });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id, kind } = await ctx.params;
  const field = FIELDS[kind];
  if (!field) return fail("Unknown asset", 404);
  await prisma.organization.update({
    where: { id },
    data: { [field.data]: null, [field.mime]: null },
  });
  return ok({ ok: true });
});

// Serve the image (authenticated; used for previews in Firm Settings).
export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id, kind } = await ctx.params;
  const field = FIELDS[kind];
  if (!field) return fail("Unknown asset", 404);
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { [field.data]: true, [field.mime]: true, name: true, bankUpi: true },
  });
  let data = org?.[field.data as keyof typeof org] as Uint8Array | null | undefined;
  let mime = org?.[field.mime as keyof typeof org] as string | null | undefined;
  // No uploaded QR: preview the one rendered from the firm's UPI ID, which is
  // what the invoice will actually print.
  if (kind === "upi-qr" && !data) {
    const generated = await renderUpiQr(
      org?.bankUpi as string | null | undefined,
      org?.name as string | null | undefined,
    );
    if (generated) {
      data = generated;
      mime = "image/png";
    }
  }
  if (!data || !mime) return fail("No image", 404);
  return new Response(Buffer.from(data), {
    headers: { "Content-Type": mime, "Cache-Control": "no-store" },
  });
});
