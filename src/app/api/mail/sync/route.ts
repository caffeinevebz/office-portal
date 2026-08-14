import { ok, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { syncInbox, testConnection } from "@/lib/mail/sync";
import { getImapSettings } from "@/lib/mail/config";

/** Where inbox sync stands: configured, switched on, and how the last run went. */
export const GET = route(async () => {
  await requirePermission("viewMail");
  const { enabled, config, missing, syncedAt, status } = await getImapSettings();
  return ok({
    enabled,
    configured: !!config,
    // Never the password — only enough to show which mailbox is being read.
    mailbox: config ? { user: config.user, host: config.host, folder: config.folder } : null,
    missing,
    syncedAt,
    status,
  });
});

/** Fetch what has arrived since the last run, or just test the credentials. */
export const POST = route(async (req) => {
  await requirePermission("manageMail");
  const test = new URL(req.url).searchParams.get("test") === "1";
  if (test) {
    // A test that comes back "no" is a successful test, not a failed request —
    // and answering 200 keeps its explanation, which an error status would
    // reduce to the status code on the way to the caller.
    return ok(await testConnection());
  }
  return ok(await syncInbox());
});
