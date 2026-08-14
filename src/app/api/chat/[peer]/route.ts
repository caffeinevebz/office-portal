import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { chatMessageSchema } from "@/lib/validation";
import { conversationMessages, markConversationRead, parsePeer } from "@/lib/chat";

type Ctx = { params: Promise<{ peer: string }> };

const sender = { select: { id: true, name: true, role: true } } as const;

/** Read a conversation (and mark it read for this member). */
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const peer = parsePeer(decodeURIComponent((await ctx.params).peer));
  if (peer.kind === "dm") {
    const other = await prisma.staff.findUnique({
      where: { id: peer.staffId },
      select: { id: true, name: true, role: true },
    });
    if (!other) return fail("Team member not found", 404);
  }
  const messages = await conversationMessages(user.id, peer);
  // Opening the thread clears its unread badge, unless the caller is only
  // polling for new messages in the background.
  if (new URL(req.url).searchParams.get("peek") !== "1") {
    await markConversationRead(user.id, peer);
  }
  return ok(messages);
});

/** Send a message to a colleague, or post in the Team channel. */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const peer = parsePeer(decodeURIComponent((await ctx.params).peer));
  const { body } = await parse(req, chatMessageSchema);

  if (peer.kind === "dm") {
    if (peer.staffId === user.id) return fail("You cannot message yourself");
    const other = await prisma.staff.findUnique({ where: { id: peer.staffId } });
    if (!other) return fail("Team member not found", 404);
    if (!other.active) return fail("That team member is no longer active");
  }

  const message = await prisma.chatMessage.create({
    data: {
      body,
      senderId: user.id,
      recipientId: peer.kind === "dm" ? peer.staffId : null,
    },
    include: { sender },
  });
  // A message just posted has reached nobody yet — it goes on screen with a
  // single tick, which the next poll advances.
  return ok({ ...message, delivery: "sent" as const }, 201);
});
