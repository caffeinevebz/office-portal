import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requireUser, requirePermission } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 512 * 1024; // 512 KB is plenty for a letterhead logo
const ALLOWED = ["image/png", "image/jpeg"];

// Upload a logo as a JSON body: { dataUrl: "data:image/png;base64,..." }
export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { dataUrl?: string };
  const match = body.dataUrl?.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!match) return fail("Logo must be a PNG or JPEG image");
  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return fail("Empty image");
  if (bytes.length > MAX_BYTES) return fail("Logo must be under 512 KB");
  if (!ALLOWED.includes(mime)) return fail("Logo must be a PNG or JPEG image");

  await prisma.organization.update({
    where: { id },
    data: { logo: bytes, logoMime: mime },
  });
  return ok({ ok: true });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageOrgs");
  const { id } = await ctx.params;
  await prisma.organization.update({
    where: { id },
    data: { logo: null, logoMime: null },
  });
  return ok({ ok: true });
});

// Serve the logo image (authenticated; used inside the app).
export const GET = route(async (_req, ctx: Ctx) => {
  await requireUser();
  const { id } = await ctx.params;
  const org = await prisma.organization.findUnique({
    where: { id },
    select: { logo: true, logoMime: true },
  });
  if (!org?.logo || !org.logoMime) return fail("No logo", 404);
  return new Response(Buffer.from(org.logo), {
    headers: { "Content-Type": org.logoMime, "Cache-Control": "no-store" },
  });
});
