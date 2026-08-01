import "server-only";
import { prisma } from "@/lib/prisma";
import { buildInvoicePdf } from "@/lib/pdf/invoice";
import { buildReceiptPdf, receiptNumber } from "@/lib/pdf/receipt";

/** The two client-facing documents an invoice can produce. */
export const DOC_KINDS = ["invoice", "receipt"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export type BuiltDocument = {
  bytes: Uint8Array;
  /** Safe for a Content-Disposition header and a phone's file system. */
  filename: string;
  /** How the document reads to a human, e.g. "Invoice APB/2627/001". */
  title: string;
};

/**
 * Render an invoice or its payment receipt. Shared by the authenticated PDF
 * routes, the public share link and the WhatsApp sender, so all three produce
 * byte-identical documents.
 *
 * Returns a plain error string rather than throwing, because each caller
 * answers differently (404 vs. a message in a modal).
 */
export async function buildDocument(
  kind: DocKind,
  id: string,
): Promise<{ doc: BuiltDocument } | { error: string; status: number }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      organization: true,
      tradeName: true,
      lineItems: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) return { error: "Invoice not found", status: 404 };

  if (kind === "receipt") {
    if (invoice.status !== "Paid") {
      return { error: "A receipt can only be issued for a paid invoice", status: 400 };
    }
    const number = receiptNumber(invoice);
    return {
      doc: {
        bytes: await buildReceiptPdf(invoice),
        filename: `${number.replace(/\//g, "-")}.pdf`,
        title: `Receipt ${number}`,
      },
    };
  }

  const label = invoice.kind === "Reimbursement" ? "Reimbursement bill" : "Invoice";
  return {
    doc: {
      bytes: await buildInvoicePdf(invoice),
      filename: `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`,
      title: `${label} ${invoice.invoiceNumber}`,
    },
  };
}

/** A PDF response with the document inline, so it opens rather than downloads. */
export function pdfResponse(doc: BuiltDocument) {
  return new Response(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
