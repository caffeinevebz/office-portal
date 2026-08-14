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

export const GOOGLE_IMAP_HOST = "imap.gmail.com";

/**
 * The IMAP host to read a mailbox on.
 *
 * The provider matters more than the domain. A firm on **Google Workspace**
 * has addresses at its own domain — `office@sharmaassociates.in` — but Google
 * holds the mail, and it is read at imap.gmail.com like any other Gmail. Since
 * Firm Settings has already been told the mail goes out through Google, that
 * settles where it comes in, whatever the domain says.
 *
 * Only when the provider gives nothing away does the domain get a look, and an
 * unrecognised one asks rather than guessing at `imap.<domain>` — a guess that
 * fails looking exactly like a wrong password.
 */
export function hostForAddress(
  email: string | null | undefined,
  provider?: "google" | "resend" | null,
): string | null {
  if (provider === "google") return GOOGLE_IMAP_HOST;
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain) return null;
  return KNOWN_HOSTS.find((k) => k.match.test(domain))?.host ?? null;
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
  const host = row?.imapHost?.trim() || hostForAddress(user, out?.provider) || "";
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

/**
 * Say what went wrong in words the firm can act on.
 *
 * What the network layer hands back — `getaddrinfo ENOTFOUND imap.gmail.in` —
 * names the fault precisely and tells a chartered accountant nothing. Each of
 * these failures has one likely cause and one thing to do about it, so the
 * message says that instead.
 */
export function describeConnectionError(error: unknown, config: ImapConfig): string {
  const host = config.host;
  // The IMAP client keeps the useful part off `message` — a rejected password
  // arrives as a bare "Command failed" with the reason on sibling fields — so
  // everything it carries is searched, not just the message.
  const e = (error ?? {}) as {
    message?: string;
    code?: string;
    responseText?: string;
    serverResponseCode?: string;
    authenticationFailed?: boolean;
  };
  const raw = [e.message, e.code, e.responseText, e.serverResponseCode]
    .filter(Boolean)
    .join(" ") || String(error ?? "");

  if (e.authenticationFailed) {
    return (
      `“${host}” rejected the sign-in for ${config.user}. On Google this must be a 16-character ` +
      `App Password (with 2-Step Verification on), not the account password` +
      `${e.responseText ? ` — the server said: ${e.responseText}` : ""}.`
    );
  }

  // A host that nearly reads as Google's is the commonest slip of all: the
  // firm is on Workspace, guessed at the host, and got a letter wrong.
  const nearlyGoogle = /gmail|google/i.test(host) && host !== GOOGLE_IMAP_HOST;
  const googleHint = ` A Google mailbox — including Workspace on your own domain — is read at ${GOOGLE_IMAP_HOST}.`;

  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) {
    return (
      `There is no mail server called “${host}”. Check the spelling.` +
      (nearlyGoogle ? googleHint : " Leave the host blank to use the one for your provider.")
    );
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return `“${host}” refused the connection on port ${config.port}. Check the port — secure IMAP is 993.`;
  }
  if (/ETIMEDOUT|timed? ?out/i.test(raw)) {
    return `“${host}” did not answer on port ${config.port}. Check the host and port, and that the mail provider allows IMAP.`;
  }
  if (/certificate|self.signed|SSL|TLS|wrong version number/i.test(raw)) {
    return `The secure connection to “${host}” failed. If the server uses port 143, untick the secure option; port 993 must stay ticked.`;
  }
  if (/AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authenticat/i.test(raw)) {
    return (
      `“${host}” rejected the sign-in for ${config.user}. On Google this must be a 16-character App Password ` +
      `(with 2-Step Verification on), not the account password.`
    );
  }
  if (/NONEXISTENT|Mailbox doesn'?t exist|no such mailbox/i.test(raw)) {
    return `The folder “${config.folder}” is not in that mailbox. Leave it blank to read INBOX.`;
  }
  // Something we have not met — pass it on rather than inventing a diagnosis.
  return `Could not read the mailbox at “${host}”: ${raw}`;
}

/** Record how the last sync went, for the settings page. */
export async function recordSyncOutcome(status: string, at: Date | null = new Date()) {
  await prisma.emailSettings.upsert({
    where: { id: "default" },
    update: { imapStatus: status, ...(at ? { imapSyncedAt: at } : {}) },
    create: { id: "default", imapStatus: status, imapSyncedAt: at },
  });
}
