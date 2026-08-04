import { fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { buildDocument, pdfResponse } from "@/lib/pdf/document";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  await requirePermission("viewInvoices");
  const { id } = await ctx.params;
  const built = await buildDocument("receipt", id);
  if ("error" in built) return fail(built.error, built.status);
  return pdfResponse(built.doc);
});
