import { prisma } from "@/lib/prisma";
import { ok, fail, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { nextInvoiceNumber, orgForInvoice } from "@/lib/numbering";
import { notifyStaff } from "@/lib/notifications";

type Ctx = { params: Promise<{ id: string }> };

type ClaimItem = { date?: string | null; category: string; description: string; amount: number };

// Raise a client invoice for an approved reimbursement claim: one invoice
// line per expense item, no GST (a pure reimbursement pass-through — the
// firm can adjust before sending).
export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requirePermission("approveExpenses");
  const { id } = await ctx.params;
  const claim = await prisma.expenseClaim.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!claim) return fail("Claim not found", 404);
  if (claim.status !== "Approved") return fail("Only an approved claim can be billed", 409);
  if (claim.invoiceId) return fail("This claim has already been billed", 409);
  if (!claim.clientId)
    return fail("Link the claim to a client before billing the expenses", 409);

  const items = (claim.items as ClaimItem[]) ?? [];
  const org = await orgForInvoice(null);
  const issueDate = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(org, issueDate);
    try {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          clientId: claim.clientId,
          organizationId: org?.id ?? null,
          description: `Reimbursement of expenses — ${claim.title}`,
          amount: claim.totalAmount,
          taxRate: 0,
          gstMode: "None",
          status: "Draft",
          issueDate,
          lineItems: {
            create: items.map((i) => ({
              description: `${i.category} — ${i.description}`,
              amount: i.amount,
              taskId: claim.taskId,
            })),
          },
        },
        include: { client: true, lineItems: true },
      });
      const updated = await prisma.expenseClaim.update({
        where: { id },
        data: { invoiceId: invoice.id },
        include: {
          staff: { select: { id: true, name: true, role: true } },
          client: { select: { id: true, name: true } },
          task: { select: { id: true, title: true, category: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
      });
      if (claim.staffId !== user.id) {
        await notifyStaff([claim.staffId], {
          type: "expense-decided",
          title: `Expenses billed to client: ${claim.title}`,
          body: `Invoice ${invoice.invoiceNumber} raised on ${claim.client?.name ?? "the client"}`,
          href: "/expenses",
        });
      }
      return ok(updated, 201);
    } catch (e) {
      // P2002 = invoice-number collision from a concurrent create; try a fresh number.
      if ((e as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
});
