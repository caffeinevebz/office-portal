import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { deliver, getEmailConfig } from "@/lib/notify";
import { getDefaultOrg } from "@/lib/org";
import { APP_NAME } from "@/lib/constants";

// Send a test email to the signed-in admin to verify the configuration.
export const POST = route(async (req) => {
  const user = await requirePermission("manageOrgs");
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim() || user.email;
  if (!to) return fail("No recipient email");

  const [cfg, org] = await Promise.all([getEmailConfig(), getDefaultOrg()]);
  const firm = org?.name ?? APP_NAME;
  const status = await deliver(
    "Email",
    to,
    `${firm} — test email from ${APP_NAME}`,
    `Hello,\n\nThis is a test email from ${APP_NAME}, the office management portal of ${firm}.\n\nIf you received this, the firm's official email is configured correctly and invoices, documents and alerts can be emailed to clients.\n\n— ${APP_NAME}`,
  );
  return ok({
    status,
    to,
    from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    live: Boolean(cfg.apiKey),
  });
});
