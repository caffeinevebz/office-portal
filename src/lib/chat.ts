import "server-only";
import { prisma } from "@/lib/prisma";

/** The firm-wide channel every member can post in. */
export const TEAM_CHANNEL = "team";

export type ChatPeer = { kind: "team" } | { kind: "dm"; staffId: string };

/** Parse a conversation id from the URL: "team" or a staff id. */
export function parsePeer(raw: string): ChatPeer {
  return raw === TEAM_CHANNEL ? { kind: "team" } : { kind: "dm", staffId: raw };
}

const sender = { select: { id: true, name: true, role: true } } as const;

/** Messages in a conversation, oldest first, each with how far it has got. */
export async function conversationMessages(userId: string, peer: ChatPeer, limit = 200) {
  const where =
    peer.kind === "team"
      ? { recipientId: null }
      : {
          OR: [
            { senderId: userId, recipientId: peer.staffId },
            { senderId: peer.staffId, recipientId: userId },
          ],
        };
  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sender },
  });
  rows.reverse();

  // Ticks are only ever shown on your own messages, so only those are worked
  // out — the team aggregate costs a query and there is no point paying it
  // for messages that will never display a tick.
  const team = peer.kind === "team" ? await teamDelivery(rows, userId) : null;
  return rows.map((m) => ({
    ...m,
    delivery: m.senderId !== userId ? null : (team?.get(m.id) ?? dmDelivery(m)),
    // When the state was reached, for the tooltip. A team post's aggregate has
    // no single moment behind it, so it carries none.
    deliveredAt: team ? null : m.deliveredAt,
  }));
}

/** A direct message's state, straight off its own two stamps. */
const dmDelivery = (m: { deliveredAt: Date | null; readAt: Date | null }): DeliveryState =>
  m.readAt ? "read" : m.deliveredAt ? "delivered" : "sent";

type Stamped = {
  id: string;
  senderId: string;
  recipientId: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
};

/**
 * How far one message of yours has got. For a single message off a write path;
 * `conversationMessages` works a whole thread out in one pass instead.
 */
export async function deliveryOf(m: Stamped, userId: string): Promise<DeliveryState | null> {
  if (m.senderId !== userId) return null;
  if (m.recipientId !== null) return dmDelivery(m);
  return (await teamDelivery([m], userId)).get(m.id) ?? "sent";
}

/**
 * How far a sent message has got, WhatsApp's three states.
 *
 * There is no push channel here — the app polls — so "delivered" can only
 * mean one thing honestly: the recipient's app has checked in since the
 * message was sent, so it is on their device. "Read" means they opened the
 * conversation. Anything stronger would be a tick the app cannot stand behind.
 */
export type DeliveryState = "sent" | "delivered" | "read";

/**
 * Record that this member's app has checked in, and mark everything already
 * waiting for them as delivered. Called from the app-wide alerts poll, which
 * runs wherever they are in the portal — not just on the Messages page.
 */
export async function markSeen(userId: string): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.staff.update({ where: { id: userId }, data: { chatSeenAt: now } }),
    // Only the ones not already stamped, so the common case writes nothing.
    prisma.chatMessage.updateMany({
      where: { recipientId: userId, deliveredAt: null },
      data: { deliveredAt: now },
    }),
  ]);
}

/**
 * The earliest of a set of markers — or null if even one member has none,
 * because a member who has never checked in holds the whole group back.
 */
function floorOf(values: (Date | null)[]): Date | null {
  if (values.length === 0 || values.some((v) => !v)) return null;
  return values.reduce((min, v) => (v! < min! ? v : min))!;
}

/**
 * The delivery state of a Team post, aggregated over everyone else — a group
 * message is only delivered when it has reached all of them, and only read
 * when all of them have opened the channel, which is what a group's ticks
 * mean elsewhere.
 */
async function teamDelivery(
  posts: { id: string; createdAt: Date; senderId: string }[],
  userId: string,
): Promise<Map<string, DeliveryState>> {
  const out = new Map<string, DeliveryState>();
  const mine = posts.filter((p) => p.senderId === userId);
  if (mine.length === 0) return out;

  const others = await prisma.staff.findMany({
    where: { active: true, id: { not: userId } },
    select: { chatSeenAt: true, teamChatReadAt: true },
  });
  // A channel with nobody else in it has no one to deliver to.
  if (others.length === 0) {
    for (const p of mine) out.set(p.id, "sent");
    return out;
  }
  // The laggards decide: the earliest check-in and the earliest open.
  const seenFloor = floorOf(others.map((o) => o.chatSeenAt));
  const readFloor = floorOf(others.map((o) => o.teamChatReadAt));
  for (const p of mine) {
    out.set(
      p.id,
      readFloor && readFloor > p.createdAt
        ? "read"
        : seenFloor && seenFloor > p.createdAt
          ? "delivered"
          : "sent",
    );
  }
  return out;
}

/** Mark a conversation read for this member. */
export async function markConversationRead(userId: string, peer: ChatPeer) {
  if (peer.kind === "team") {
    await prisma.staff.update({
      where: { id: userId },
      data: { teamChatReadAt: new Date() },
    });
    return;
  }
  const now = new Date();
  const thread = { senderId: peer.staffId, recipientId: userId } as const;
  // Reading a message that was never stamped delivered — the thread was opened
  // straight from a notification, say — settles both, so the record never
  // claims a message was read before it arrived. Each is filtered on null so
  // neither overwrites a moment already recorded.
  await prisma.chatMessage.updateMany({
    where: { ...thread, deliveredAt: null },
    data: { deliveredAt: now },
  });
  await prisma.chatMessage.updateMany({
    where: { ...thread, readAt: null },
    data: { readAt: now },
  });
}

export type Conversation = {
  id: string; // "team" or the other member's staff id
  kind: "team" | "dm";
  name: string;
  role: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  lastFromSelf: boolean;
  // How far your own last message got, for the tick beside the preview.
  lastDelivery: DeliveryState | null;
  unread: number;
};

/**
 * Every conversation open to this member: the Team channel plus a direct
 * thread with each active colleague, newest activity first.
 */
export async function conversationList(userId: string): Promise<Conversation[]> {
  const [me, members, dms, teamPosts] = await Promise.all([
    prisma.staff.findUnique({ where: { id: userId }, select: { teamChatReadAt: true } }),
    prisma.staff.findMany({
      where: { active: true, id: { not: userId } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    // Direct messages either way, newest first — one pass builds every thread.
    prisma.chatMessage.findMany({
      where: {
        recipientId: { not: null },
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        createdAt: true,
        deliveredAt: true,
        readAt: true,
        senderId: true,
        recipientId: true,
      },
    }),
    prisma.chatMessage.findMany({
      where: { recipientId: null },
      orderBy: { createdAt: "desc" },
      take: 1,
      include: { sender },
    }),
  ]);

  const teamReadAt = me?.teamChatReadAt ?? null;
  const teamUnread = await prisma.chatMessage.count({
    where: {
      recipientId: null,
      senderId: { not: userId },
      ...(teamReadAt ? { createdAt: { gt: teamReadAt } } : {}),
    },
  });
  const lastTeam = teamPosts[0];

  const threads = new Map<
    string,
    { body: string; at: Date; fromSelf: boolean; delivery: DeliveryState | null; unread: number }
  >();
  for (const m of dms) {
    const other = m.senderId === userId ? m.recipientId! : m.senderId;
    const t = threads.get(other);
    const incomingUnread = m.recipientId === userId && !m.readAt ? 1 : 0;
    if (!t) {
      threads.set(other, {
        body: m.body,
        at: m.createdAt,
        fromSelf: m.senderId === userId,
        // Newest first, so this is the thread's last message.
        delivery: m.senderId === userId ? dmDelivery(m) : null,
        unread: incomingUnread,
      });
    } else {
      t.unread += incomingUnread;
    }
  }

  const list: Conversation[] = [
    {
      id: TEAM_CHANNEL,
      kind: "team",
      name: "Team",
      role: "Everyone in the firm",
      lastMessage: lastTeam ? `${lastTeam.sender.name.split(" ")[0]}: ${lastTeam.body}` : null,
      lastAt: lastTeam?.createdAt.toISOString() ?? null,
      lastFromSelf: lastTeam?.senderId === userId,
      lastDelivery: lastTeam ? await deliveryOf(lastTeam, userId) : null,
      unread: teamUnread,
    },
    ...members.map((m) => {
      const t = threads.get(m.id);
      return {
        id: m.id,
        kind: "dm" as const,
        name: m.name,
        role: m.role,
        lastMessage: t?.body ?? null,
        lastAt: t?.at.toISOString() ?? null,
        lastFromSelf: t?.fromSelf ?? false,
        lastDelivery: t?.delivery ?? null,
        unread: t?.unread ?? 0,
      };
    }),
  ];

  // Conversations with activity float to the top, newest first; the rest
  // stay in alphabetical order beneath them.
  return list.sort((a, b) => {
    if (a.kind === "team" && !b.lastAt) return -1;
    if (b.kind === "team" && !a.lastAt) return 1;
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.name.localeCompare(b.name);
  });
}

/** Total unread messages across every conversation. */
export async function unreadChatCount(userId: string): Promise<number> {
  const me = await prisma.staff.findUnique({
    where: { id: userId },
    select: { teamChatReadAt: true },
  });
  const [dm, team] = await Promise.all([
    prisma.chatMessage.count({ where: { recipientId: userId, readAt: null } }),
    prisma.chatMessage.count({
      where: {
        recipientId: null,
        senderId: { not: userId },
        ...(me?.teamChatReadAt ? { createdAt: { gt: me.teamChatReadAt } } : {}),
      },
    }),
  ]);
  return dm + team;
}

/** The newest message addressed to this member (drives the alert pop-up). */
export async function latestIncoming(userId: string) {
  const m = await prisma.chatMessage.findFirst({
    where: {
      senderId: { not: userId },
      OR: [{ recipientId: userId }, { recipientId: null }],
    },
    orderBy: { createdAt: "desc" },
    include: { sender },
  });
  if (!m) return null;
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    senderName: m.sender.name,
    // Where to open the conversation from a notification.
    conversationId: m.recipientId ? m.senderId : TEAM_CHANNEL,
  };
}
