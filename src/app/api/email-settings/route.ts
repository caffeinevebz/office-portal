import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { emailSettingsSchema } from "@/lib/validation";
import { getEmailConfig, providerStatus } from "@/lib/notify";

// Secrets are write-only: reads return whether one is set, never the value.
function view(row: {
  provider: string;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  appPassword: string | null;
  resendApiKey: string | null;
} | null) {
  return {
    provider: row?.provider === "resend" ? "resend" : "google",
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    hasAppPassword: Boolean(row?.appPassword?.trim()),
    hasApiKey: Boolean(row?.resendApiKey?.trim()),
  };
}

async function respond(row: Parameters<typeof view>[0]) {
  const [cfg, status] = await Promise.all([getEmailConfig(), providerStatus()]);
  return ok({
    ...view(row),
    effectiveFrom: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
    envKeyPresent: Boolean(process.env.RESEND_API_KEY),
    live: cfg.live,
    providerStatus: status,
  });
}

export const GET = route(async () => {
  await requirePermission("manageOrgs");
  const row = await prisma.emailSettings.findUnique({ where: { id: "default" } });
  return respond(row);
});

export const PUT = route(async (req) => {
  await requirePermission("manageOrgs");
  const data = await parse(req, emailSettingsSchema);
  const patch = {
    ...(data.provider ? { provider: data.provider } : {}),
    fromName: data.fromName,
    fromEmail: data.fromEmail,
    replyTo: data.replyTo,
    // Omitted/blank secret = keep the stored one; "clear" removes it.
    ...(data.appPassword === "clear"
      ? { appPassword: null }
      : data.appPassword
        ? { appPassword: data.appPassword.replace(/\s+/g, "") }
        : {}),
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
  return respond(row);
});
