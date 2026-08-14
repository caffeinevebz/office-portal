import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/notify";

// Reading the firm's mailbox.
//
// The credential is the one already in Firm Settings → Official firm email:
// on Google, the same App Password serves IMAP and SMTP, so a firm that can
// already send from the portal can read too, with nothing new to obtain. A
// firm on its own mail host fills the host in and everything else follows.

/** Sensible IMAP hosts for the mail providers a firm is likely to be on. */
const KNOWN_HOSTS: { match: RegExp; host: string }[] = [
  { match: /(^|\.)gmail\.com$/i, host: "imap.gmail.com" },
  { match: /(^|\.)googlemail\.com$/i, host: "imap.gmail.com" },
  { match: /(^|\.)(outlook|hotmail|live|msn)\.com$/i, host: "outlook.office365.com" },
  { match: /(^|\.)yahoo\.(com|co\.in)$/i, host: "imap.mail.yahoo.com" },
  { match: /(^|\.)zoho\.(com|in)$/i, host: "imap.zoho.com" },
  { match: /(^|\.)rediffmail\.com$/i, host: "imap.rediffmail.com" },
];

/** The IMAP host implied by an address, when it is one we recognise. */
export function hostForAddress(email: string | null | undefined): string | null {
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  const hit = KNOWN_HOSTS.find((k) => k.match.test(domain));
  // A firm on its own domain almost always answers on imap.<domain>, but
  // guessing that would fail silently and look like a wrong password — so an
  // unrecognised domain asks for the host instead.
  return hit?.host ?? null;
}

export type ImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  folder: string;
};

export type ImapSettings = {
  enabled: boolean;
  config: ImapConfig | null;
  /** Why it cannot connect yet, for the settings page to show. */
  missing: string | null;
  syncedAt: Date | null;
  status: string | null;
};

/**
 * The effective inbox configuration. Anything left blank falls back to the
 * outbound side, so the ordinary Google setup needs only the tick.
 */
export async function getImapSettings(): Promise<ImapSettings> {
  const [row, out] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "default" } }).catch(() => null),
    getEmailConfig().catch(() => null),
  ]);

  const user = row?.imapUser?.trim() || out?.fromEmail?.trim() || "";
  const password = row?.imapPassword?.trim() || out?.appPassword?.trim() || "";
  const host = row?.imapHost?.trim() || hostForAddress(user) || "";
  const secure = row?.imapSecure ?? true;
  const port = row?.imapPort ?? (secure ? 993 : 143);
  const folder = row?.imapFolder?.trim() || "INBOX";

  const missing = !user
    ? "No mailbox address — set the official firm email first."
    : !password
      ? "No password — Google needs an App Password for the firm's mailbox."
      : !host
        ? "No IMAP host — this mail domain is not one we recognise, so give the host (e.g. imap.yourdomain.com)."
        : null;

  return {
    enabled: row?.imapEnabled ?? false,
    config: missing ? null : { host, port, secure, user, password, folder },
    missing,
    syncedAt: row?.imapSyncedAt ?? null,
    status: row?.imapStatus ?? null,
  };
}

/** Record how the last sync went, for the settings page. */
export async function recordSyncOutcome(status: string, at: Date | null = new Date()) {
  await prisma.emailSettings.upsert({
    where: { id: "default" },
    update: { imapStatus: status, ...(at ? { imapSyncedAt: at } : {}) },
    create: { id: "default", imapStatus: status, imapSyncedAt: at },
  });
}
