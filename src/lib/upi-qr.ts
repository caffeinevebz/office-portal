import "server-only";
import QRCode from "qrcode";

// The scan-to-pay QR on an invoice is *rendered from the firm's UPI ID*, never
// stored as a picture of its own. A QR and an ID kept as two separate fields
// drift apart the moment one of them is edited — and a QR that no longer
// matches the ID printed beside it sends the client's money nowhere. Deriving
// one from the other makes that impossible.

/** A UPI ID looks like `name.surname-2@oksbi` — local part, then a handle. */
const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,63}$/;

export function isUpiId(vpa: string | null | undefined): vpa is string {
  return !!vpa && VPA.test(vpa.trim());
}

/**
 * The payment intent every UPI app understands. Deliberately minimal — payee
 * address and name only, no amount — so one QR serves every invoice and any
 * app can read it. Bank-issued QRs sometimes carry signed, app-specific
 * parameters; a firm that must use one can still upload it (see below).
 */
export function upiPayload(vpa: string, payeeName?: string | null): string {
  // Encoded by hand rather than with URLSearchParams, which would render the
  // VPA's "@" as %40 and spaces as "+". Bank and wallet QRs in the field carry
  // a literal "@" and %20, and apps that parse the string naively — plenty do
  // — read %40 as part of the address and send the payment nowhere. Matching
  // what the banks themselves emit is what makes the code scan everywhere.
  const parts = [`pa=${encodeURIComponent(vpa.trim()).replace(/%40/g, "@")}`];
  const name = payeeName?.trim();
  if (name) parts.push(`pn=${encodeURIComponent(name)}`);
  parts.push("cu=INR");
  return `upi://pay?${parts.join("&")}`;
}

/**
 * Render the scan-to-pay QR for a UPI ID as PNG bytes, or null when the ID is
 * missing or malformed — an invoice prints no QR rather than an unscannable
 * one. Error-correction level M leaves the code readable from a phone photo.
 */
export async function renderUpiQr(
  vpa: string | null | undefined,
  payeeName?: string | null,
): Promise<Uint8Array | null> {
  if (!isUpiId(vpa)) return null;
  try {
    const png = await QRCode.toBuffer(upiPayload(vpa, payeeName), {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    return new Uint8Array(png);
  } catch {
    return null;
  }
}

/**
 * The QR to print for a firm: the one it uploaded if it has one (a bank-issued
 * code with a signed payload, say), else one rendered from its UPI ID.
 */
export async function firmUpiQr(firm: {
  name?: string | null;
  bank: { upi: string | null };
  upiQr: Uint8Array | null;
  upiQrMime: string | null;
}): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (firm.upiQr && firm.upiQrMime) return { bytes: firm.upiQr, mime: firm.upiQrMime };
  const bytes = await renderUpiQr(firm.bank.upi, firm.name);
  return bytes ? { bytes, mime: "image/png" } : null;
}
