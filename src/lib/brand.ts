import { existsSync } from "node:fs";
import { join } from "node:path";

/** App-icon path: prefers original artwork uploaded to public/brand/,
 *  falling back to the built-in recreated icons. Server-side only. */
export function brandIcon(size: 192 | 512): string {
  const brand = `/brand/icon-${size}.png`;
  return existsSync(join(process.cwd(), "public", brand)) ? brand : `/icon-${size}.png`;
}
