import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Passwords are stored as "salt:hash" using Node's built-in scrypt — no native
// dependency and no external service required.

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(plain, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
