import { prisma } from "@/lib/prisma";
import { ok, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { emailSettingsSchema } from "@/lib/validation";
import { getEmailConfig, providerStatus } from "@/lib/notify";
import { hostForAddress } from "@/lib/mail/config";

// Secrets are write-only: reads return whether one is set, never the value.
function view(row: {
  provider: string;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  appPassword: string | null;
  resendApiKey: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  imapEnabled?: boolean;
  imapHost?: string | null;
  imapPort?: number | null;
  imapSecure?: boolean;
  imapUser?: string | null;
  imapPassword?: string | null;
  imapFolder?: string | null;
  imapSyncedAt?: Date | null;
  imapStatus?: string | null;
} | null) {
  const mailbox = row?.imapUser?.trim() || row?.fromEmail?.trim() || "";
  return {
    provider: row?.provider === "resend" ? "resend" : "google",
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    replyTo: row?.replyTo ?? "",
    hasAppPassword: Boolean(row?.appPassword?.trim()),
    hasApiKey: Boolean(row?.resendApiKey?.trim()),
    smtpHost: row?.smtpHost ?? "",
    smtpPort: row?.smtpPort ?? null,
    imapEnabled: row?.imapEnabled ?? false,
    imapHost: row?.imapHost ?? "",
    imapPort: row?.imapPort ?? null,
    imapSecure: row?.imapSecure ?? true,
    imapUser: row?.imapUser ?? "",
    imapFolder: row?.imapFolder ?? "",
    hasImapPassword: Boolean(row?.imapPassword?.trim()),
    // What the sync will actually use once the blanks are filled from the
    // outbound side, so the page can show it rather than make them guess.
    effectiveImapHost: row?.imapHost?.trim() || hostForAddress(mailbox) || "",
    effectiveMailbox: mailbox,
    imapSyncedAt: row?.imapSyncedAt ?? null,
    imapStatus: row?.imapStatus ?? null,
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
    ...(data.smtpHost === undefined ? {} : { smtpHost: data.smtpHost }),
    ...(data.smtpPort === undefined ? {} : { smtpPort: data.smtpPort ?? null }),
    ...(data.imapEnabled === undefined ? {} : { imapEnabled: data.imapEnabled }),
    ...(data.imapHost === undefined ? {} : { imapHost: data.imapHost }),
    ...(data.imapPort === undefined ? {} : { imapPort: data.imapPort ?? null }),
    ...(data.imapSecure === undefined ? {} : { imapSecure: data.imapSecure }),
    ...(data.imapUser === undefined ? {} : { imapUser: data.imapUser }),
    ...(data.imapFolder === undefined ? {} : { imapFolder: data.imapFolder }),
    ...(data.imapPassword === "clear"
      ? { imapPassword: null }
      : data.imapPassword
        ? { imapPassword: data.imapPassword.replace(/\s+/g, "") }
        : {}),
  };
  const row = await prisma.emailSettings.upsert({
    where: { id: "default" },
    update: patch,
    create: { id: "default", ...patch },
  });
  return respond(row);
});
