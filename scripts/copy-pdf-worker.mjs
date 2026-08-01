// pdf.js renders in a worker, which has to be served as a static file rather
// than bundled. Copy it into public/ before build and dev so the viewer can
// load it from a stable path on every platform.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The legacy build, to match the viewer: the modern one uses JavaScript that
// current Android/iOS browsers do not all have yet.
const src = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const dest = join(root, "public/pdf.worker.min.mjs");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`pdf.js worker → ${dest}`);
