import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { prisma } from "@/lib/prisma";
import {
  getImapSettings,
  recordSyncOutcome,
  describeConnectionError,
  type ImapConfig,
} from "@/lib/mail/config";
import { matchClient, normaliseAddress } from "@/lib/mail/match";

// Fetching the firm's mail.
//
// Sync is incremental and idempotent: the mailbox hands every message a UID
// that only ever climbs, so asking for everything above the highest one we
// hold fetches exactly what is new. A UID is only meaningful inside one
// UIDVALIDITY — if the server reissues that number the old UIDs mean nothing,
// so it is part of the key and a change simply starts the folder again.

/** Bodies past this are stored as a snippet only — a mail is not a filesystem. */
const MAX_BODY = 200_000;
/** Attachments past this keep their details and no bytes. */
const MAX_ATTACHMENT = 8 * 1024 * 1024;
/** Never pull the whole history on a first run. */
const FIRST_RUN_LIMIT = 200;

export type SyncResult = {
  fetched: number;
  matched: number;
  skipped: number;
  folder: string;
  status: string;
};

/** Trim a header to a storable length, dropping control characters. */
const text = (v: string | null | undefined, max = 2000) =>
  v ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : null;

/** A one-line preview for the list, from the text body. */
function snippetOf(parsed: ParsedMail): string | null {
  const body = parsed.text ?? parsed.html ?? "";
  const flat = String(body)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat ? flat.slice(0, 240) : null;
}

const addressList = (v: ParsedMail["to"]): string[] => {
  if (!v) return [];
  const all = Array.isArray(v) ? v : [v];
  return all.flatMap((a) =>
    a.value.map((x) => normaliseAddress(x.address)).filter((s): s is string => !!s),
  );
};

/** mailparser types `date` loosely; only a real Date is worth storing. */
const asDate = (v: unknown): Date | null =>
  v instanceof Date ? v : typeof v === "string" && !isNaN(Date.parse(v)) ? new Date(v) : null;

/**
 * Strip the parts of an HTML body that must never run or phone home in our
 * page: scripts, styles, embedded frames, event handlers, and remote images.
 * What survives is text, links and structure — enough to read the mail by.
 */
export function sanitiseHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    // on*= handlers, in quoted or bare form.
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // javascript: and data: URLs in href/src.
    .replace(/\s(href|src)\s*=\s*("|')?\s*(javascript|data|vbscript):[^"'>\s]*("|')?/gi, "")
    // Remote images are trackers as often as they are pictures.
    .replace(/<\s*img\b[^>]*>/gi, "");
}

/**
 * How long to wait for the mailbox to answer at all.
 *
 * The IMAP client waits 90 seconds by default, which is no use here: this runs
 * inside a web request, and a hosting platform will kill the function long
 * before then — turning a diagnosable failure into a blank gateway timeout.
 * A mailbox that has not answered in eight seconds is not going to.
 */
const CONNECT_TIMEOUT = 8_000;

/** Open the mailbox. Callers must always close what this returns. */
async function connect(config: ImapConfig): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    // Reaching it, and it saying hello, are both bounded — see above.
    connectionTimeout: CONNECT_TIMEOUT,
    greetingTimeout: 8_000,
    // Once talking, a fetch of a large mailbox may legitimately take longer.
    socketTimeout: 45_000,
  });
  await client.connect();
  return client;
}

/**
 * When nothing answered, find out whether this machine can reach the port at
 * all — and whether it can reach anything.
 *
 * A connect timeout has two quite different causes and the same appearance:
 * the settings are wrong, or the host running the portal is not allowed out on
 * that port. Managed hosting often permits HTTPS and nothing else. Trying the
 * port directly, and then 443 on the same host, tells the two apart — which
 * turns a list of things to check into a fact.
 */
async function probeEgress(
  host: string,
  port: number,
): Promise<"port-open" | "port-blocked" | "no-network"> {
  const { connect: tcp } = await import("node:net");
  const reachable = (p: number) =>
    new Promise<boolean>((resolve) => {
      const socket = tcp({ host, port: p });
      const done = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(5_000, () => done(false));
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    });

  if (await reachable(port)) return "port-open";
  // 443 is the one port everything allows; if even that fails the machine has
  // no way out and the mailbox settings are beside the point.
  return (await reachable(443)) ? "port-blocked" : "no-network";
}

/** Check the credentials answer, without fetching anything. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const { config, missing } = await getImapSettings();
  if (!config) return { ok: false, message: missing ?? "Inbox sync is not configured." };
  let client: ImapFlow | null = null;
  try {
    client = await connect(config);
    const box = await client.mailboxOpen(config.folder, { readOnly: true });
    return {
      ok: true,
      message: `Connected to ${config.user} — ${box.exists} message${box.exists === 1 ? "" : "s"} in ${config.folder}.`,
    };
  } catch (e) {
    // Nothing answered — say which of the two reasons it was.
    if (isConnectTimeout(e)) {
      const egress = await probeEgress(config.host, config.port);
      if (egress === "port-blocked") {
        return {
          ok: false,
          message:
            `Your settings look right — “${config.host}” is a real host — but this deployment is not ` +
            `allowed to open outbound connections on port ${config.port}. That is a restriction of the ` +
            `hosting, not of your mailbox, and nothing you change here will get past it.`,
        };
      }
      if (egress === "no-network") {
        return {
          ok: false,
          message: `This deployment cannot reach the internet at all just now, so the mailbox cannot be checked. Try again shortly.`,
        };
      }
    }
    return { ok: false, message: describeConnectionError(e, config) };
  } finally {
    await client?.logout().catch(() => {});
  }
}

/** The client reports "nothing answered" on `code`, not in the message. */
function isConnectTimeout(e: unknown): boolean {
  const err = (e ?? {}) as { code?: string; message?: string };
  return err.code === "CONNECT_TIMEOUT" || /ETIMEDOUT|CONNECT_TIMEOUT/i.test(err.code ?? "");
}

/**
 * Pull everything that has arrived since the last run.
 *
 * Safe to call as often as you like: nothing below the high-water UID is
 * re-fetched, and the unique key on (folder, uidValidity, uid) makes a second
 * run of the same batch a no-op even if two of these overlap.
 */
export async function syncInbox(limit = 100): Promise<SyncResult> {
  const { enabled, config, missing } = await getImapSettings();
  if (!enabled) {
    return { fetched: 0, matched: 0, skipped: 0, folder: "", status: "Inbox sync is switched off." };
  }
  if (!config) {
    const status = missing ?? "Inbox sync is not configured.";
    await recordSyncOutcome(status, null);
    return { fetched: 0, matched: 0, skipped: 0, folder: "", status };
  }

  let client: ImapFlow | null = null;
  try {
    client = await connect(config);
    const box = await client.mailboxOpen(config.folder, { readOnly: true });
    const uidValidity = String(box.uidValidity);

    // Where we got to last time, within this folder generation. A server that
    // has reissued uidValidity gets treated as a folder we have never read.
    const high = await prisma.mailMessage.findFirst({
      where: { folder: config.folder, uidValidity },
      orderBy: { uid: "desc" },
      select: { uid: true },
    });
    const firstRun = !high;
    const from = (high?.uid ?? 0) + 1;
    // A first run takes the tail of the mailbox rather than all of it — a
    // decade of mail is not what anyone wants to wait for.
    const range = firstRun
      ? `${Math.max(1, (box.uidNext ?? 1) - FIRST_RUN_LIMIT)}:*`
      : `${from}:*`;

    let fetched = 0;
    let matched = 0;
    let skipped = 0;

    for await (const msg of client.fetch(
      range,
      { uid: true, source: true, flags: true, internalDate: true },
      { uid: true },
    )) {
      // `from:*` always yields at least the last message, even when it is one
      // we already hold — the range is inclusive of the high-water mark.
      if (!firstRun && msg.uid < from) continue;
      if (fetched >= limit) {
        skipped++;
        continue;
      }
      if (!msg.source) continue; // nothing to parse
      const parsed: ParsedMail = await simpleParser(msg.source);
      const stored = await storeMessage({
        parsed,
        uid: msg.uid,
        uidValidity,
        folder: config.folder,
        seen: msg.flags?.has("\\Seen") ?? false,
        receivedAt: asDate(msg.internalDate),
      });
      if (stored) {
        fetched++;
        if (stored.clientId) matched++;
      }
    }

    const status =
      fetched === 0
        ? "Up to date — nothing new."
        : `${fetched} new message${fetched === 1 ? "" : "s"}` +
          (matched ? `, ${matched} filed against a client` : "") +
          (skipped ? `. ${skipped} more waiting — run it again.` : ".");
    await recordSyncOutcome(status);
    return { fetched, matched, skipped, folder: config.folder, status };
  } catch (e) {
    const status = describeConnectionError(e, config);
    await recordSyncOutcome(status, null);
    return { fetched: 0, matched: 0, skipped: 0, folder: config.folder, status };
  } finally {
    await client?.logout().catch(() => {});
  }
}

/** Write one fetched message, with its attachments. Returns null if it is already held. */
async function storeMessage(input: {
  parsed: ParsedMail;
  uid: number;
  uidValidity: string;
  folder: string;
  seen: boolean;
  receivedAt: Date | null;
}): Promise<{ clientId: string | null } | null> {
  const { parsed, uid, uidValidity, folder, seen, receivedAt } = input;

  const fromAddr = parsed.from?.value?.[0];
  const toEmails = addressList(parsed.to);
  const ccEmails = addressList(parsed.cc);
  const fromEmail = normaliseAddress(fromAddr?.address) || null;

  const match = await matchClient({ fromEmail, toEmails, ccEmails });

  const html = parsed.html ? sanitiseHtml(String(parsed.html)) : null;
  const body = parsed.text ?? null;
  const tooBig = (html?.length ?? 0) > MAX_BODY || (body?.length ?? 0) > MAX_BODY;

  try {
    const mail = await prisma.mailMessage.create({
      data: {
        folder,
        uid,
        uidValidity,
        messageId: text(parsed.messageId, 500),
        inReplyTo: text(parsed.inReplyTo, 500),
        references: text(
          Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references,
          2000,
        ),
        subject: text(parsed.subject, 500),
        fromName: text(fromAddr?.name, 200),
        fromEmail,
        toEmails,
        ccEmails,
        sentAt: asDate(parsed.date) ?? receivedAt,
        textBody: tooBig ? null : body,
        htmlBody: tooBig ? null : html,
        snippet: snippetOf(parsed),
        truncated: tooBig,
        direction: "Incoming",
        seen,
        clientId: match?.clientId ?? null,
        matchedBy: match?.matchedBy ?? null,
      },
      select: { id: true, clientId: true },
    });

    const files = (parsed.attachments ?? []).filter((a) => a.contentDisposition !== "inline" || a.filename);
    if (files.length > 0) {
      await prisma.mailAttachment.createMany({
        data: files.map((a) => ({
          mailId: mail.id,
          filename: text(a.filename, 300) ?? "attachment",
          contentType: text(a.contentType, 120),
          size: a.size ?? a.content?.length ?? 0,
          // Past the cap we keep the details and not the bytes, and the mail
          // says as much — better than a file that silently is not there.
          content:
            (a.size ?? 0) <= MAX_ATTACHMENT && a.content ? new Uint8Array(a.content) : null,
        })),
      });
    }
    return { clientId: mail.clientId };
  } catch (e) {
    // The unique key already holds it — two syncs overlapped. Not an error.
    if (e instanceof Error && e.message.includes("Unique constraint")) return null;
    throw e;
  }
}
