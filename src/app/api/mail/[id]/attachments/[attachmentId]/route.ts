import { prisma } from "@/lib/prisma";
import { fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

/** Download a file that arrived on a message. */
export const GET = route(async (_req, ctx: Ctx) => {
  await requirePermission("viewMail");
  const { id, attachmentId } = await ctx.params;
  const file = await prisma.mailAttachment.findFirst({
    // Scoped to its message, so an id guessed from elsewhere reaches nothing.
    where: { id: attachmentId, mailId: id },
  });
  if (!file) return fail("Attachment not found", 404);
  if (!file.content) {
    return fail(
      "This file was too large to keep — open the message in your mail client to get it.",
      410,
    );
  }
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.contentType || "application/octet-stream",
      // Always an attachment: a mail attachment is the last thing that should
      // be rendered inline on our own origin.
      "Content-Disposition": `attachment; filename="${file.filename.replace(/["\\]/g, "")}"`,
      "Content-Length": String(file.content.length),
    },
  });
});
