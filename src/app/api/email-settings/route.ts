import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { emailSettingsSchema } from "@/lib/validation";
import { getEmailConfig, providerStatus } from "@/lib/notify";

// The API key is write-only: reads return whether one is set, never the value.
function view(row: { fromName: string | null; fromEmail: string | null; replyTo: string | null; resendApiKey: string | null } | null) {
  return {
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    hasApiKey: Boolean(row?.resendApiKey?.trim()),
  };
}

export const GET = route(async () => {
  await requirePermission("manageOrgs");
  const row = await prisma.emailSettings.findUnique({ where: { id: "default" } });
  const [cfg, provider] = await Promise.all([getEmailConfig(), providerStatus()]);
  return ok({
    ...view(row),
    effectiveFrom: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    envKeyPresent: Boolean(process.env.RESEND_API_KEY),
    provider,
  });
});

export const PUT = route(async (req) => {
  await requirePermission("manageOrgs");
  const data = await parse(req, emailSettingsSchema);
  const patch = {
    fromName: data.fromName,
    fromEmail: data.fromEmail,
    replyTo: data.replyTo,
    // Omitted/blank key = keep the stored one; "clear" removes it.
    ...(data.resendApiKey === "clear"
      ? { resendApiKey: null }
      : data.resendApiKey
        ? { resendApiKey: data.resendApiKey }
        : {}),
  };
  const row = await prisma.emailSettings.upsert({
    where: { id: "default" },
    update: patch,
    create: { id: "default", ...patch },
  });
  const [cfg, provider] = await Promise.all([getEmailConfig(), providerStatus()]);
  return ok({
    ...view(row),
    effectiveFrom: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    envKeyPresent: Boolean(process.env.RESEND_API_KEY),
    provider,
  });
});
