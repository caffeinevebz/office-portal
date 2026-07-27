import "server-only";
import { prisma } from "@/lib/prisma";
import { buildReceiptPdf } from "@/lib/pdf/receipt";
import { deliver } from "@/lib/notify";
import { getDefaultOrg } from "@/lib/org";
import { invoiceGross } from "@/lib/format";

export type ReceiptEmailResult = {
  status: "Sent" | "Simulated" | "Failed" | "Skipped";
  to?: string;
  reason?: string;
};

/**
 * Email the payment-receipt PDF to the client the moment a receipt exists —
 * called right after an invoice is first marked Paid. Sends once per receipt
 * (deduped on the receipt number), skips quietly when the client has no
 * email, and never throws: recording the payment must succeed regardless.
 */
export async function sendReceiptEmail(invoiceId: string): Promise<ReceiptEmailResult> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        organization: true,
        tradeName: true,
        lineItems: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!invoice || invoice.status !== "Paid" || !invoice.receiptNumber) {
      return { status: "Skipped", reason: "No receipt to send" };
    }
    const to = invoice.client.email?.trim();
    if (!to) return { status: "Skipped", reason: "Client has no email address" };

    const dedupeKey = `receipt-email:${invoice.id}:${invoice.receiptNumber}`;
    const already = await prisma.notificationLog.findFirst({ where: { dedupeKey } });
    if (already) return { status: "Skipped", reason: "Already emailed" };

    const org = invoice.organization ?? (await getDefaultOrg());
    const firm = org?.name ?? "our firm";
    const gross = Math.round(invoiceGross(invoice.amount, invoice.taxRate, invoice.gstMode));
    const tds = invoice.tdsDeducted ?? 0;
    const net = Math.max(0, gross - tds);
    const inr = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

    const subject = `Payment receipt ${invoice.receiptNumber} from ${firm}`;
    const body =
      `Dear ${invoice.client.contactPerson || invoice.client.name},\n\n` +
      `Thank you for your payment against invoice ${invoice.invoiceNumber}. ` +
      `Please find attached receipt ${invoice.receiptNumber} for ${inr(net)}` +
      `${tds > 0 ? ` (invoice value ${inr(gross)} less TDS ${inr(tds)})` : ""}.\n\n` +
      `Warm regards,\n${firm}`;

    const pdf = await buildReceiptPdf(invoice);
    const status = await deliver("Email", to, subject, body, [
      { filename: `${invoice.receiptNumber.replace(/\//g, "-")}.pdf`, content: pdf },
    ]);

    await prisma.notificationLog.create({
      data: {
        channel: "Email",
        recipientType: "Client",
        recipientName: invoice.client.name,
        to,
        subject,
        body,
        status,
        dedupeKey,
      },
    });
    return { status, to };
  } catch (e) {
    console.error("receipt email failed", e);
    return { status: "Failed", reason: e instanceof Error ? e.message : "Unknown error" };
  }
}
