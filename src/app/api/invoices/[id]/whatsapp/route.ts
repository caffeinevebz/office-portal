import { prisma } from "@/lib/prisma";
import { ok, fail, parse, route } from "@/lib/api";
import { requirePermission } from "@/lib/auth/session";
import { whatsappDocumentSchema } from "@/lib/validation";
import { getWhatsappConfig, sendWhatsappDocument, waLink, waNumber } from "@/lib/notify";
import { buildDocument } from "@/lib/pdf/document";
import { shareUrl } from "@/lib/share-link";
import { INVOICE_UNISSUED } from "@/lib/constants";

type Ctx = { params: Promise<{ id: string }> };

/**
 * What the send will look like: the document's name and its share link. The
 * modal needs the link in hand before the user clicks, because opening
 * WhatsApp is a plain navigation that cannot wait on a request.
 */
export const GET = route(async (req, ctx: Ctx) => {
  await requirePermission("viewInvoices");
  const { id } = await ctx.params;
  const kind = new URL(req.url).searchParams.get("kind") === "receipt" ? "receipt" : "invoice";
  const built = await buildDocument(kind, id);
  if ("error" in built) return fail(built.error, built.status);
  const cfg = await getWhatsappConfig();
  return ok({
    title: built.doc.title,
    filename: built.doc.filename,
    shareUrl: shareUrl(kind, id, req),
    live: cfg.live,
  });
});

/**
 * Send an invoice — or its payment receipt — to the client on WhatsApp with
 * the PDF itself, not just the details.
 *
 * With Cloud API credentials the PDF is uploaded and delivered as a document
 * message from the firm's own number. Without them WhatsApp offers no way to
 * attach a file from outside, so the message carries a **share link** to the
 * PDF instead and opens in the sender's own WhatsApp. Either way the client
 * ends up with the document, and either way the send is logged.
 */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requirePermission("viewInvoices");
  const { id } = await ctx.params;
  const data = await parse(req, whatsappDocumentSchema);

  const digits = waNumber(data.to);
  if (digits.length < 8) return fail("That does not look like a valid WhatsApp number");

  const built = await buildDocument(data.kind, id);
  if ("error" in built) return fail(built.error, built.status);
  const { bytes, filename, title } = built.doc;

  const cfg = await getWhatsappConfig();
  const link = shareUrl(data.kind, id, req);

  // The hand-off message needs the link inside the text — it is the only way
  // the PDF can travel. A live send carries the file, so it stays clean.
  // The client may have already folded the link into the text it showed the
  // sender; log exactly what went out rather than appending it twice.
  const body =
    cfg.live || data.body.includes("/api/share/") ? data.body : `${data.body}\n\n${title}: ${link}`;
  const status = cfg.live
    ? await sendWhatsappDocument(digits, bytes, filename, data.body)
    : "Simulated";
  if (status === "Failed") {
    return fail("WhatsApp rejected the document — check the number and the firm's credentials", 502);
  }

  await prisma.notificationLog.create({
    data: {
      channel: "WhatsApp",
      recipientType: "Client",
      recipientName: data.recipientName ?? digits,
      to: digits,
      subject: `${title} on WhatsApp from ${user.name}`,
      body,
      status,
      dedupeKey: `whatsapp-doc:${data.kind}:${id}:${Date.now()}`,
    },
  });

  // Sending the invoice itself moves it on, the same as emailing it does. A
  // receipt is not the bill, so it leaves the status where it is.
  let invoiceStatus: string | null = null;
  if (data.kind === "invoice") {
    const current = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
    if (current && INVOICE_UNISSUED.has(current.status)) {
      const moved = await prisma.invoice.update({
        where: { id },
        data: { status: "Sent" },
        select: { status: true },
      });
      invoiceStatus = moved.status;
    }
  }

  return ok({
    status,
    to: digits,
    live: cfg.live,
    filename,
    title,
    // What the bill now reads as, when the send moved it on.
    invoiceStatus,
    // The link is what makes the document reachable on the hand-off path; it
    // is also handy on the live path as a fallback the sender can paste.
    shareUrl: link,
    link: cfg.live ? null : waLink(digits, body),
  });
});
