import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { chatMessageSchema } from "@/lib/validation";
import { deliveryOf } from "@/lib/chat";

type Ctx = { params: Promise<{ peer: string; messageId: string }> };

const sender = { select: { id: true, name: true, role: true } } as const;

/** Edit a message you sent. Only the author can change their own words. */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { messageId } = await ctx.params;
  const { body } = await parse(req, chatMessageSchema);

  const existing = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { sender },
  });
  if (!existing) return fail("Message not found", 404);
  if (existing.senderId !== user.id) return fail("You can only edit your own messages", 403);
  // Saving without a change shouldn't stamp it as edited.
  if (existing.body === body)
    return ok({ ...existing, delivery: await deliveryOf(existing, user.id) });

  const message = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
    include: { sender },
  });
  // Editing does not undo delivery, and the reply replaces the row on screen —
  // so it has to carry the tick back with it.
  return ok({ ...message, delivery: await deliveryOf(message, user.id) });
});
