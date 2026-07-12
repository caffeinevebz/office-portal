import { existsSync } from "node:fs";
import { join } from "node:path";

/** App-icon path: prefers uploaded original artwork (either at public/ root
 *  or public/brand/), falling back to the built-in recreated icons.
 *  Server-side only. */
export function brandIcon(size: 192 | 512): string {
  for (const p of [`/icon-${size}.png`, `/brand/icon-${size}.png`]) {
    if (existsSync(join(process.cwd(), "public", p))) return p;
  }
  return `/icon-${size}.png`;
}

/** Path to the full logo if an original was uploaded, else null.
 *  Server-side only. */
export function brandLogoFull(): string | null {
  for (const p of ["/logo-full.png", "/brand/logo-full.png"]) {
    if (existsSync(join(process.cwd(), "public", p))) return p;
  }
  return null;
}
