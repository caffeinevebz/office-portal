import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DOC_KINDS, type DocKind } from "@/lib/pdf/document";

// A share link lets a client open one document — their own invoice or receipt
// — without a Ledgify login, which is what makes "send it on WhatsApp" work at
// all: the recipient is never a user of this app.
//
// The link carries its own proof: {kind, id, expiry} signed with the app
// secret. Nothing is stored, so there is no table to leak and no cleanup; the
// link simply stops working after it expires. It grants read of that one
// document and nothing else.
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";

/** How long a link stays good. Long enough to sit unread in a chat. */
export const SHARE_TTL_DAYS = 30;

type Payload = { k: DocKind; i: string; e: number };

const sign = (payload: string) =>
  createHmac("sha256", SECRET).update(payload).digest("base64url");

/** Sign a link token for one document. */
export function signShareToken(kind: DocKind, id: string, ttlDays = SHARE_TTL_DAYS): string {
  const payload: Payload = { k: kind, i: id, e: Date.now() + ttlDays * 86_400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verify a token; null when it is forged, malformed or expired. */
export function verifyShareToken(token: string): { kind: DocKind; id: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (!DOC_KINDS.includes(data.k) || typeof data.i !== "string") return null;
    if (typeof data.e !== "number" || Date.now() > data.e) return null;
    return { kind: data.k, id: data.i };
  } catch {
    return null;
  }
}

/**
 * The absolute URL to put in a message. Built from the request the sender
 * made, so it is right on localhost, on a preview deployment and on the
 * firm's own domain without any configuration — unless APP_URL pins it
 * (needed when a message is sent from a background job, which has no request).
 */
export function shareUrl(kind: DocKind, id: string, req?: Request): string {
  const token = signShareToken(kind, id);
  const base = (process.env.APP_URL || "").replace(/\/$/, "") || originOf(req);
  return `${base}/api/share/${token}`;
}

function originOf(req?: Request): string {
  if (!req) return "";
  const h = req.headers;
  // Behind Vercel's proxy the visible host is the forwarded one.
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
