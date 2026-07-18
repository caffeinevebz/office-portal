import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { fail } from "@/lib/api";
import { type Permission } from "./roles";
import { roleHasPermission } from "./effective";

const COOKIE = "op_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64url");

function sign(payloadB64: string) {
  return createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function signToken(payload: object): string {
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifyToken(token: string): { uid: string; exp: number } | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** Set the session cookie for a user. Call only from a Route Handler. */
export async function createSession(userId: string) {
  const token = signToken({ uid: userId, exp: Date.now() + MAX_AGE * 1000 });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Clear the session cookie. Call only from a Route Handler. */
export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** Resolve the current user from the session cookie, or null. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const data = verifyToken(token);
  if (!data) return null;
  // Short-lived cache: this lookup runs on every API request and page load,
  // so trimming it is a round-trip saved per call. Team-route mutations
  // invalidate; deactivation/role edits otherwise apply within the TTL.
  const user = await cached(`staff:${data.uid}`, 30_000, () =>
    prisma.staff.findUnique({ where: { id: data.uid } }),
  );
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Require any authenticated user in an API route (throws a 401 Response). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw fail("Authentication required", 401);
  return user;
}

/** Require a specific permission in an API route (throws 401/403). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await roleHasPermission(user.role, permission))) {
    throw fail("You do not have permission to perform this action", 403);
  }
  return user;
}
