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

/** Messages in a conversation, oldest first. */
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
  return rows.reverse();
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
  await prisma.chatMessage.updateMany({
    where: { senderId: peer.staffId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
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
      select: { body: true, createdAt: true, readAt: true, senderId: true, recipientId: true },
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

  const threads = new Map<string, { body: string; at: Date; fromSelf: boolean; unread: number }>();
  for (const m of dms) {
    const other = m.senderId === userId ? m.recipientId! : m.senderId;
    const t = threads.get(other);
    const incomingUnread = m.recipientId === userId && !m.readAt ? 1 : 0;
    if (!t) {
      threads.set(other, {
        body: m.body,
        at: m.createdAt,
        fromSelf: m.senderId === userId,
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
