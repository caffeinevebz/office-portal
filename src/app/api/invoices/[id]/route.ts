import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { invoiceUpdateSchema, invoicePaymentSchema } from "@/lib/validation";
import { sendReceiptEmail } from "@/lib/receipt-email";
import { recordPayment, settleInvoice, settlementOf } from "@/lib/payments";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const INVOICE_INCLUDE = {
  client: true,
  tradeName: true,
  lineItems: {
    include: {
      task: { select: { id: true, title: true, category: true } },
      tasks: { select: { id: true, title: true, category: true } },
    },
  },
  payments: { orderBy: { paidDate: "asc" } },
} as const;

/**
 * Apply an edit. Status is special: once money has been received it belongs to
 * the payments, so marking a bill Paid records the balance rather than setting
 * a field, and moving it off Paid is refused while receipts stand — undo the
 * receipt instead, which is the honest record of what happened.
 */
async function applyUpdate(
  id: string,
  data: Record<string, unknown>,
): Promise<
  { invoice: Awaited<ReturnType<typeof readInvoice>>; paymentId?: string } | { error: string; status: number }
> {
  const { status, paidDate, paymentMode, chequeNumber, chequeDate, chequeBank, transactionRef, tdsDeducted, ...rest } =
    data;

  const current = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: true },
  });
  if (!current) return { error: "Invoice not found", status: 404 };

  if (Object.keys(rest).length) {
    await prisma.invoice.update({ where: { id }, data: rest as Prisma.InvoiceUncheckedUpdateInput });
  }

  // The edit form re-sends the bill's *current* status on every save. Reading
  // that as an instruction is what made a part-paid invoice impossible to edit
  // at all, and made correcting an amount on a paid one record a receipt
  // nobody had taken. Only an actual change of status means anything here.
  let paymentId: string | undefined;
  if (typeof status === "string" && status !== current.status) {
    const fresh = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    const { outstanding } = settlementOf(fresh!, fresh!.payments);
    if (status === "Paid") {
      // Settle whatever is left — for an unpaid bill that is the whole of it,
      // for a part-paid one only the balance.
      if (outstanding > 0.5) {
        const payment = await recordPayment(id, {
          amount: outstanding,
          tdsDeducted: (tdsDeducted as number | null) ?? null,
          paidDate: (paidDate as Date | null) ?? null,
          paymentMode: (paymentMode as string | null) ?? null,
          chequeNumber: (chequeNumber as string | null) ?? null,
          chequeDate: (chequeDate as Date | null) ?? null,
          chequeBank: (chequeBank as string | null) ?? null,
          transactionRef: (transactionRef as string | null) ?? null,
        });
        paymentId = payment?.id;
      }
    } else if (fresh!.payments.length > 0) {
      return {
        error:
          "Money has been received against this invoice. Remove the receipt first if it was recorded in error.",
        status: 409,
      };
    } else {
      await prisma.invoice.update({ where: { id }, data: { status } });
    }
  }

  await settleInvoice(id);
  return { invoice: await readInvoice(id), paymentId };
}

function readInvoice(id: string) {
  return prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
}

/**
 * Check what the edit points at before writing any of it.
 *
 * A saved invoice names a client, perhaps a trade name and a billing firm, and
 * its lines may bill tasks. Any of those can have been deleted or re-pointed
 * since the form was opened, and handing a dead id to the database turns a
 * save into "Internal server error" — which tells the person at the desk
 * nothing at all. Each one is checked here and answered in words.
 */
async function checkReferences(
  id: string,
  data: { clientId?: string; tradeNameId?: string | null; organizationId?: string | null; invoiceNumber?: string | null },
): Promise<string | null> {
  const [client, tradeName, org, clash] = await Promise.all([
    data.clientId
      ? prisma.client.findUnique({ where: { id: data.clientId }, select: { id: true } })
      : null,
    data.tradeNameId
      ? prisma.tradeName.findUnique({ where: { id: data.tradeNameId }, select: { id: true } })
      : null,
    data.organizationId
      ? prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true } })
      : null,
    data.invoiceNumber
      ? prisma.invoice.findFirst({
          where: { invoiceNumber: data.invoiceNumber, id: { not: id } },
          select: { id: true },
        })
      : null,
  ]);
  if (data.clientId && !client) {
    return "That client is no longer on the register. Reload the page and pick the client again.";
  }
  if (data.tradeNameId && !tradeName) {
    return "The firm / trade name this bill was raised under no longer exists. Reload the page and choose again.";
  }
  if (data.organizationId && !org) {
    return "The billing firm on this invoice no longer exists. Reload the page and choose again.";
  }
  if (clash) {
    return `Invoice number ${data.invoiceNumber} already belongs to another bill. Use a different number.`;
  }
  return null;
}

export const PUT = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const { lineItems, ...data } = await parse(req, invoiceUpdateSchema);

  const problem = await checkReferences(id, data);
  if (problem) return fail(problem, 409);

  // Sync line items when the form provides them, and keep `amount` = their sum.
  if (lineItems) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceLineItem.findMany({ where: { invoiceId: id }, select: { id: true } });
      const mine = new Set(existing.map((e) => e.id));
      // A line whose id is not on this invoice any more — a stale form, or a
      // row someone else removed — is taken as a new line rather than as a
      // reason to refuse the whole save. The words the user typed are real
      // even when the id behind them is not.
      const lines = lineItems.map((l) => (l.id && mine.has(l.id) ? l : { ...l, id: undefined }));
      // Likewise a task that has since been deleted: bill the line, drop the link.
      const wanted = [...new Set(lines.flatMap((l) => l.taskIds ?? []))];
      const alive = wanted.length
        ? new Set(
            (await tx.task.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map(
              (t) => t.id,
            ),
          )
        : new Set<string>();

      const keep = new Set(lines.filter((l) => l.id).map((l) => l.id));
      const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (remove.length) await tx.invoiceLineItem.deleteMany({ where: { id: { in: remove } } });
      for (const line of lines) {
        const { id: lid, taskIds: sent, ...fields } = line;
        const taskIds = sent?.filter((t) => alive.has(t));
        // Lead task stays on taskId; the full set lives on the m-n relation.
        const lead = (fields.taskId && alive.has(fields.taskId) ? fields.taskId : null) ?? taskIds?.[0] ?? null;
        const data = {
          ...fields,
          taskId: lead,
          tasks: taskIds ? { set: taskIds.map((tid) => ({ id: tid })) } : undefined,
        };
        if (lid) await tx.invoiceLineItem.update({ where: { id: lid }, data });
        else
          await tx.invoiceLineItem.create({
            data: {
              ...fields,
              taskId: lead,
              tasks: taskIds?.length ? { connect: taskIds.map((tid) => ({ id: tid })) } : undefined,
              invoiceId: id,
            },
          });
      }
    });
    data.amount = lineItems.reduce((s, l) => s + (l.amount || 0), 0);
  }
  const result = await applyUpdate(id, data as Record<string, unknown>);
  if ("error" in result) return fail(result.error, result.status);
  // The receipt for a payment just recorded goes to the client's inbox
  // (skipped when the client has no email).
  const receiptEmail = result.paymentId
    ? await sendReceiptEmail(id, result.paymentId)
    : undefined;
  return ok(receiptEmail ? { ...result.invoice, receiptEmail } : result.invoice);
});

// Quick status change; marking Paid can carry the payment record — mode of
// payment, instrument details (cheque no./date/bank or transaction ref) and
// any TDS the client deducted at source.
export const PATCH = route(async (req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  const data = await parse(req, invoicePaymentSchema);
  const result = await applyUpdate(id, data as Record<string, unknown>);
  if ("error" in result) return fail(result.error, result.status);
  const receiptEmail = result.paymentId
    ? await sendReceiptEmail(id, result.paymentId)
    : undefined;
  return ok(receiptEmail ? { ...result.invoice, receiptEmail } : result.invoice);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await requirePermission("manageInvoices");
  const { id } = await ctx.params;
  await prisma.invoice.delete({ where: { id } });
  return ok({ ok: true });
});
