import "server-only";
import { prisma } from "@/lib/prisma";
import { invoiceGross } from "@/lib/format";
import { nextReceiptNumber, orgForInvoice } from "@/lib/numbering";
import type { Invoice, Payment } from "@prisma/client";

// Money received against a bill. A client rarely settles a professional-fee
// invoice in one go — a payment on account now, the balance when the return is
// filed — so each receipt is its own row and the invoice's status is *derived*
// from the set of them. There is exactly one writer of that status
// (`settleInvoice` below), which is what keeps the two from drifting.

/** Rupee rounding slack: a bill is settled when the remainder is under 50p. */
const EPSILON = 0.5;

export type Settlement = {
  /** Invoice value including GST. */
  gross: number;
  /** Of that, how much the payments have settled. */
  received: number;
  /** What the client still owes. Never negative. */
  outstanding: number;
  /** Cash actually in hand — the received amount less TDS withheld from it. */
  net: number;
  /** TDS the client deducted across the payments. */
  tds: number;
  fullyPaid: boolean;
};

type InvoiceAmounts = Pick<Invoice, "amount" | "taxRate" | "gstMode">;
type PaymentAmounts = Pick<Payment, "amount" | "tdsDeducted">;

/** Work out where an invoice stands from its payments. Pure arithmetic. */
export function settlementOf(inv: InvoiceAmounts, payments: PaymentAmounts[]): Settlement {
  const gross = invoiceGross(inv.amount, inv.taxRate, inv.gstMode);
  const received = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const tds = payments.reduce((s, p) => s + (p.tdsDeducted || 0), 0);
  return {
    gross,
    received,
    outstanding: Math.max(0, gross - received),
    net: Math.max(0, received - tds),
    tds,
    fullyPaid: payments.length > 0 && received >= gross - EPSILON,
  };
}

/**
 * The status an invoice's payments imply. `fallback` is where it sits when no
 * money has come in yet — Draft, Sent or Overdue, whichever it already was.
 */
export function statusFor(settlement: Settlement, fallback: string): string {
  if (settlement.fullyPaid) return "Paid";
  if (settlement.received > 0) return "Partly Paid";
  // No money in: an invoice that had been marked Paid falls back to Sent.
  // Draft and Approved are left alone — a bill nobody has been sent cannot
  // become "Sent" because a receipt was removed from it.
  return fallback === "Paid" || fallback === "Partly Paid" ? "Sent" : fallback;
}

/**
 * Recompute an invoice's status and paid date from its payments. The single
 * writer of both — call it after any change to the payments.
 */
export async function settleInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { orderBy: { paidDate: "asc" } } },
  });
  if (!invoice) return null;
  const settlement = settlementOf(invoice, invoice.payments);
  const status = statusFor(settlement, invoice.status);
  // The date the bill was *settled* — the last payment's, and only once the
  // whole of it is in. A part-paid bill has no paid date.
  const paidDate = settlement.fullyPaid
    ? (invoice.payments[invoice.payments.length - 1]?.paidDate ?? new Date())
    : null;

  if (invoice.status !== status || invoice.paidDate?.getTime() !== paidDate?.getTime()) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status, paidDate } });
  }
  return { settlement, status, paidDate };
}

/**
 * Record a receipt of money against an invoice, giving it its own number in
 * the firm's receipt series, then restate the invoice.
 */
export async function recordPayment(
  invoiceId: string,
  input: {
    amount: number;
    tdsDeducted?: number | null;
    paidDate?: Date | null;
    paymentMode?: string | null;
    chequeNumber?: string | null;
    chequeDate?: Date | null;
    chequeBank?: string | null;
    transactionRef?: string | null;
    note?: string | null;
  },
) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  const paidDate = input.paidDate ?? new Date();
  const org = await orgForInvoice(invoice.organizationId);
  const kind = invoice.kind === "Reimbursement" ? "Reimbursement" : "Fee";
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      amount: input.amount,
      tdsDeducted: input.tdsDeducted ?? null,
      paidDate,
      receiptNumber: await nextReceiptNumber(org, paidDate, kind),
      paymentMode: input.paymentMode ?? null,
      chequeNumber: input.chequeNumber ?? null,
      chequeDate: input.chequeDate ?? null,
      chequeBank: input.chequeBank ?? null,
      transactionRef: input.transactionRef ?? null,
      note: input.note ?? null,
    },
  });
  await settleInvoice(invoiceId);
  return payment;
}

/** Undo a receipt — a payment entered in error, or a cheque returned. */
export async function deletePayment(invoiceId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, invoiceId } });
  if (!payment) return false;
  await prisma.payment.delete({ where: { id: paymentId } });
  await settleInvoice(invoiceId);
  return true;
}

// ── Migrating the old one-payment-per-invoice records ────────────────────
//
// Payments used to live on the invoice row itself, so a bill could only ever
// be paid in one go. Each of those becomes a Payment for the full invoice
// value, carrying its receipt number so nothing is renumbered. Runs once per
// process and skips any invoice that already has payments, so it is safe to
// call on every read.

let backfilled = false;

export async function backfillPayments(): Promise<void> {
  if (backfilled) return;
  backfilled = true;
  try {
    const legacy = await prisma.invoice.findMany({
      where: { status: "Paid", paidDate: { not: null }, payments: { none: {} } },
    });
    for (const inv of legacy) {
      await prisma.payment.create({
        data: {
          invoiceId: inv.id,
          // The old model settled the whole bill in one payment.
          amount: invoiceGross(inv.amount, inv.taxRate, inv.gstMode),
          tdsDeducted: inv.tdsDeducted,
          paidDate: inv.paidDate!,
          receiptNumber: inv.receiptNumber,
          paymentMode: inv.paymentMode,
          chequeNumber: inv.chequeNumber,
          chequeDate: inv.chequeDate,
          chequeBank: inv.chequeBank,
          transactionRef: inv.transactionRef,
        },
      });
    }
  } catch (e) {
    // Never let the migration break the page it was meant to fill.
    backfilled = false;
    console.error("payment backfill failed", e);
  }
}
