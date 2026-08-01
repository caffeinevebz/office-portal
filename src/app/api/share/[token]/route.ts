import { fail, route } from "@/lib/api";
import { buildDocument, pdfResponse } from "@/lib/pdf/document";
import { verifyShareToken } from "@/lib/share-link";

type Ctx = { params: Promise<{ token: string }> };

/**
 * A client's own invoice or receipt, opened from the link the firm sent them
 * on WhatsApp or email. Deliberately unauthenticated — the recipient is a
 * client, not a Ledgify user — but the signed token names exactly one
 * document and expires, so it is not a way into anything else.
 */
export const GET = route(async (_req, ctx: Ctx) => {
  const { token } = await ctx.params;
  const claim = verifyShareToken(token);
  if (!claim) return fail("This link has expired or is not valid", 404);

  const built = await buildDocument(claim.kind, claim.id);
  if ("error" in built) return fail(built.error, built.status);
  return pdfResponse(built.doc);
});
