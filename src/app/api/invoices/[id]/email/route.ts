import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { buildInvoicePdf, taxBreakdown } from "@/lib/pdf/invoice";
import { deliver, getEmailConfig } from "@/lib/notify";
import { getDefaultOrg } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;
const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;

// Email the tax-invoice PDF to the client from the firm's official mailbox.
export const POST = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, organization: true },
  });
  if (!invoice) return fail("Invoice not found", 404);
  const to = invoice.client.email?.trim();
  if (!to) return fail("This client has no email address on record");

  const org = invoice.organization ?? (await getDefaultOrg());
  const firm = org?.name ?? "our firm";
  const tax = taxBreakdown(invoice, org?.gstin?.slice(0, 2) ?? null);
  const due = fmt(invoice.dueDate);

  const subject = `Invoice ${invoice.invoiceNumber} from ${firm}`;
  const body =
    `Dear ${invoice.client.contactPerson || invoice.client.name},\n\n` +
    `Please find attached invoice ${invoice.invoiceNumber} for ${inr(tax.grand)}` +
    `${invoice.description ? ` towards ${invoice.description}` : ""}.` +
    `${due ? ` Payment is due by ${due}.` : ""}\n\n` +
    `Bank and UPI details are on the invoice. Kindly quote the invoice number when remitting.\n\n` +
    `Warm regards,\n${firm}`;

  const pdf = await buildInvoicePdf(invoice);
  const status = await deliver("Email", to, subject, body, [
    { filename: `${invoice.invoiceNumber}.pdf`, content: pdf },
  ]);
  if (status === "Failed") return fail("The email provider rejected the message", 502);

  await prisma.notificationLog.create({
    data: {
      channel: "Email",
      recipientType: "Client",
      recipientName: invoice.client.name,
      to,
      subject,
      body,
      status,
      dedupeKey: `invoice-email:${invoice.id}:${Date.now()}`,
    },
  });

  // Emailing a draft moves it into the billing pipeline.
  let updated = invoice;
  if (invoice.status === "Draft") {
    updated = await prisma.invoice.update({
      where: { id },
      data: { status: "Sent" },
      include: { client: true, organization: true },
    });
  }
  const cfg = await getEmailConfig();
  return ok({ status, to, live: cfg.live, invoice: updated });
});
