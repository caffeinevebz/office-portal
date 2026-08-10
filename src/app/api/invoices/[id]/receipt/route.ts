import { fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { buildDocument, pdfResponse } from "@/lib/pdf/document";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  await requirePermission("viewInvoices");
  const { id } = await ctx.params;
  // A bill settled in instalments has a receipt per instalment; ?payment=
  // picks one, and the latest stands in when it is left off.
  const paymentId = new URL(req.url).searchParams.get("payment")?.trim() || undefined;
  const built = await buildDocument("receipt", id, paymentId);
  if ("error" in built) return fail(built.error, built.status);
  return pdfResponse(built.doc);
});
