import "server-only";
import { prisma } from "@/lib/prisma";

// Working out whose mail this is.
//
// A message is filed against a client when one of its addresses is one the
// firm already knows: the address on the client's record, or one someone
// filed a message from by hand before. Filing by hand teaches the register,
// so a client who writes from their office address once has every later
// message from it filed for them.
//
// Nothing is guessed from a name or a domain. A wrong client on a message is
// worse than none — it puts a stranger's affairs in a client's file.

export const normaliseAddress = (v: string | null | undefined) =>
  (v ?? "").trim().toLowerCase();

/** Every address on a message, sender first — the sender identifies it best. */
export function addressesOf(m: {
  fromEmail?: string | null;
  toEmails?: unknown;
  ccEmails?: unknown;
}): string[] {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return [...new Set([m.fromEmail ?? "", ...list(m.toEmails), ...list(m.ccEmails)].map(normaliseAddress))].filter(
    Boolean,
  );
}

export type MailMatch = { clientId: string; matchedBy: "auto" } | null;

/**
 * The client a message belongs to, or null when no address on it is known.
 * The sender is tried first, then the other addresses — a client copied on a
 * departmental mail still gets it filed.
 */
export async function matchClient(m: {
  fromEmail?: string | null;
  toEmails?: unknown;
  ccEmails?: unknown;
}): Promise<MailMatch> {
  const addresses = addressesOf(m);
  if (addresses.length === 0) return null;

  const [clients, aliases] = await Promise.all([
    prisma.client.findMany({
      where: { email: { in: addresses, mode: "insensitive" } },
      select: { id: true, email: true },
    }),
    prisma.mailAlias.findMany({
      where: { address: { in: addresses } },
      select: { clientId: true, address: true },
    }),
  ]);

  const byAddress = new Map<string, string>();
  // Aliases go in first so a hand-filed address wins over a stale record.
  for (const a of aliases) byAddress.set(normaliseAddress(a.address), a.clientId);
  for (const c of clients) {
    const key = normaliseAddress(c.email);
    if (key && !byAddress.has(key)) byAddress.set(key, c.id);
  }

  for (const addr of addresses) {
    const clientId = byAddress.get(addr);
    if (clientId) return { clientId, matchedBy: "auto" };
  }
  return null;
}

/**
 * File a message against a client by hand, and remember the address it came
 * from so the next one files itself. The firm's own address is never learnt —
 * it is on every message and would match everything.
 */
export async function fileAgainstClient(
  mailId: string,
  clientId: string | null,
  ownAddress: string | null,
): Promise<void> {
  const mail = await prisma.mailMessage.update({
    where: { id: mailId },
    data: { clientId, matchedBy: clientId ? "manual" : null },
    select: { fromEmail: true, direction: true },
  });
  if (!clientId) return;

  // Learn from incoming mail only: the sender of an outgoing message is the
  // firm, which tells us nothing about whose mail it is.
  const from = normaliseAddress(mail.fromEmail);
  if (!from || mail.direction !== "Incoming") return;
  if (from === normaliseAddress(ownAddress)) return;

  await prisma.mailAlias.upsert({
    where: { address: from },
    update: { clientId },
    create: { address: from, clientId },
  });
}

/**
 * Re-file everything that arrived before the register knew the address —
 * run after an alias is learnt, so the client's older mail joins their file.
 */
export async function backfillAlias(address: string, clientId: string): Promise<number> {
  const { count } = await prisma.mailMessage.updateMany({
    where: { fromEmail: { equals: address, mode: "insensitive" }, clientId: null },
    data: { clientId, matchedBy: "auto" },
  });
  return count;
}
