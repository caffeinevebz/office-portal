import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

// Record a custody movement: "In" = token received by the firm,
// "Out" = token handed back to the client. Keeps Dsc.custody in sync and
// stamps the entry with the signed-in user.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("manageDsc");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    direction?: string;
    note?: string;
  };
  if (body.direction !== "In" && body.direction !== "Out") {
    return fail('direction must be "In" or "Out"');
  }

  const dsc = await prisma.dsc.findUnique({ where: { id } });
  if (!dsc) return fail("DSC not found", 404);

  const newCustody = body.direction === "In" ? "With Firm" : "With Client";
  if (dsc.custody === newCustody) {
    return fail(
      body.direction === "In"
        ? "This DSC is already with the firm"
        : "This DSC is already with the client",
    );
  }

  const [, updated] = await prisma.$transaction([
    prisma.dscMovement.create({
      data: {
        dscId: id,
        direction: body.direction,
        note: body.note?.trim() || null,
        byName: user.name,
      },
    }),
    prisma.dsc.update({
      where: { id },
      data: { custody: newCustody },
      include: { client: true, movements: { orderBy: { createdAt: "desc" }, take: 10 } },
    }),
  ]);
  return ok(updated);
});
