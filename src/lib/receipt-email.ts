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
 * Email a payment receipt to the client the moment the money is recorded. A
 * bill settled in instalments sends one receipt per instalment, each naming
 * the balance still outstanding. Deduped on the receipt number, skipped
 * quietly when the client has no email, and never throws: recording the
 * payment must succeed regardless.
 */
export async function sendReceiptEmail(
  invoiceId: string,
  paymentId?: string,
): Promise<ReceiptEmailResult> {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: true,
        organization: true,
        tradeName: true,
        lineItems: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { paidDate: "asc" } },
      },
    });
    if (!invoice) return { status: "Skipped", reason: "No receipt to send" };
    // The payment just recorded, else the most recent one.
    const payment = paymentId
      ? invoice.payments.find((p) => p.id === paymentId)
      : invoice.payments[invoice.payments.length - 1];
    if (!payment?.receiptNumber) return { status: "Skipped", reason: "No receipt to send" };

    const to = invoice.client.email?.trim();
    if (!to) return { status: "Skipped", reason: "Client has no email address" };

    const dedupeKey = `receipt-email:${invoice.id}:${payment.receiptNumber}`;
    const already = await prisma.notificationLog.findFirst({ where: { dedupeKey } });
    if (already) return { status: "Skipped", reason: "Already emailed" };

    const org = invoice.organization ?? (await getDefaultOrg());
    const firm = org?.name ?? "our firm";
    const gross = Math.round(invoiceGross(invoice.amount, invoice.taxRate, invoice.gstMode));
    // Only payments up to and including this one — a receipt states the
    // position as at the moment it was issued, not as at today.
    const upto = invoice.payments.filter((p) => p.paidDate <= payment.paidDate);
    const settledSoFar = upto.reduce((s, p) => s + p.amount, 0);
    const balance = Math.max(0, gross - settledSoFar);
    const tds = payment.tdsDeducted ?? 0;
    const net = Math.max(0, payment.amount - tds);
    const inr = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

    const partial = balance > 0.5;
    const subject = `Payment receipt ${payment.receiptNumber} from ${firm}`;
    const body =
      `Dear ${invoice.client.contactPerson || invoice.client.name},\n\n` +
      `Thank you for your payment against invoice ${invoice.invoiceNumber}. ` +
      `Please find attached receipt ${payment.receiptNumber} for ${inr(net)}` +
      `${tds > 0 ? ` (${inr(payment.amount)} settled, less TDS ${inr(tds)})` : ""}.\n\n` +
      (partial
        ? `Of the invoice value of ${inr(gross)}, ${inr(balance)} remains outstanding.\n\n`
        : "") +
      `Warm regards,\n${firm}`;

    const pdf = await buildReceiptPdf(invoice, payment, balance);
    const status = await deliver("Email", to, subject, body, [
      { filename: `${payment.receiptNumber.replace(/\//g, "-")}.pdf`, content: pdf },
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
